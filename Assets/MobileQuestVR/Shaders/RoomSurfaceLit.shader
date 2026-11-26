Shader "MobileQuestVR/RoomSurfaceLit"
{
    Properties
    {
        _Color ("Base Color", Color) = (0.8, 0.84, 0.9, 1)
        _SpecColor ("Specular Color", Color) = (0.35, 0.4, 0.45, 1)
        _Smoothness ("Smoothness", Range(0.05, 1.0)) = 0.35
        _EmissionColor ("Emission Color", Color) = (0, 0, 0, 1)
        _RimColor ("Rim Highlight Color", Color) = (0.2, 0.65, 1.0, 1)
        _RimStrength ("Rim Strength", Range(0.0, 1.5)) = 0.12
        _GridScale ("World Grid Scale (tiles/m)", Range(0.0, 10.0)) = 0.0
        _GridThickness ("Grid Line Thickness", Range(0.005, 0.12)) = 0.025
        _GridStrength ("Grid Strength", Range(0.0, 1.0)) = 0.0
        _GridColor ("Grid Line Color", Color) = (0.25, 0.55, 0.85, 1)
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }
        LOD 200

        Pass
        {
            Tags { "LightMode" = "ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase
            #pragma target 3.0

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            fixed4 _Color;
            half _Smoothness;
            fixed4 _EmissionColor;
            fixed4 _RimColor;
            half _RimStrength;
            float _GridScale;
            float _GridThickness;
            half _GridStrength;
            fixed4 _GridColor;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 worldPos : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                SHADOW_COORDS(2)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                TRANSFER_SHADOW(o);
                return o;
            }

            float EvaluateWorldGrid(float3 worldPos, float3 worldNormal)
            {
                if (_GridScale <= 0.001 || _GridStrength <= 0.001)
                {
                    return 0.0;
                }

                float3 absN = abs(worldNormal);
                float2 gridCoord;
                if (absN.y >= absN.x && absN.y >= absN.z)
                {
                    gridCoord = worldPos.xz * _GridScale;
                }
                else if (absN.x >= absN.z)
                {
                    gridCoord = worldPos.zy * _GridScale;
                }
                else
                {
                    gridCoord = worldPos.xy * _GridScale;
                }

                float2 cell = abs(frac(gridCoord - 0.5) - 0.5);
                float2 fw = max(fwidth(gridCoord), 0.0005);
                float2 lines = smoothstep(_GridThickness + fw, _GridThickness, cell);
                float lineMask = max(lines.x, lines.y);

                // Subtle distance fade to avoid shimmering far away in stereo VR
                float dist = length(_WorldSpaceCameraPos - worldPos);
                float fade = 1.0 - smoothstep(6.0, 18.0, dist);
                return lineMask * _GridStrength * fade;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);
                float3 L = normalize(_WorldSpaceLightPos0.xyz);
                float3 H = normalize(L + V);

                fixed shadow = SHADOW_ATTENUATION(i);

                // Soft wrapped diffuse lighting for pleasant mobile VR shading
                float ndotl = saturate(dot(N, L));
                float wrapDiffuse = saturate((dot(N, L) + 0.25) / 1.25);
                float specPow = lerp(8.0, 96.0, _Smoothness);
                float spec = pow(saturate(dot(N, H)), specPow) * _Smoothness * ndotl;

                // Hemisphere ambient from Unity spherical harmonics
                fixed3 ambient = ShadeSH9(float4(N, 1.0));

                float gridMask = EvaluateWorldGrid(i.worldPos, N);
                fixed3 albedo = lerp(_Color.rgb, _GridColor.rgb, gridMask);

                fixed3 direct = (albedo * wrapDiffuse + _SpecColor.rgb * spec) * _LightColor0.rgb * shadow;

                // Subtle Fresnel rim to separate silhouettes cleanly in stereo vision
                float rim = pow(1.0 - saturate(dot(N, V)), 3.0) * _RimStrength;
                fixed3 rimLight = _RimColor.rgb * rim;

                fixed3 finalColor = albedo * ambient + direct + rimLight + _EmissionColor.rgb;
                return fixed4(finalColor, 1.0);
            }
            ENDCG
        }

        Pass
        {
            Tags { "LightMode" = "ForwardAdd" }
            Blend One One
            ZWrite Off

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdadd
            #pragma target 3.0

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            fixed4 _Color;
            half _Smoothness;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 worldPos : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                UNITY_LIGHTING_COORDS(2, 3)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                UNITY_TRANSFER_LIGHTING(o, v.uv);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float3 N = normalize(i.worldNormal);
                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);
                float3 lightVec = _WorldSpaceLightPos0.xyz - i.worldPos * _WorldSpaceLightPos0.w;
                float3 L = normalize(lightVec);
                float3 H = normalize(L + V);

                UNITY_LIGHT_ATTENUATION(atten, i, i.worldPos);
                float ndotl = saturate(dot(N, L));
                float specPow = lerp(8.0, 96.0, _Smoothness);
                float spec = pow(saturate(dot(N, H)), specPow) * _Smoothness * ndotl;

                fixed3 col = (_Color.rgb * ndotl + _SpecColor.rgb * spec) * _LightColor0.rgb * atten;
                return fixed4(col, 1.0);
            }
            ENDCG
        }
    }

    Fallback "VertexLit"
}
