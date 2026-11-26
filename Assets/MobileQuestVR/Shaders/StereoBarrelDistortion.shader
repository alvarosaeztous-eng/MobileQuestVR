Shader "MobileQuestVR/StereoBarrelDistortion"
{
    Properties
    {
        _MainTex ("Eye Render Texture", 2D) = "black" {}
        _K1 ("Radial Distortion K1", Range(-0.5, 1.0)) = 0.22
        _K2 ("Radial Distortion K2", Range(-0.5, 1.0)) = 0.14
        _ZoomScale ("Zoom Scale", Range(0.5, 1.5)) = 0.94
        _ChromaticAberration ("Chromatic Aberration", Range(0.0, 0.05)) = 0.008
        _LensCenterOffset ("Lens Center Offset X", Range(-0.2, 0.2)) = 0.0
        _EyeAspect ("Eye Aspect Ratio", Range(0.3, 2.5)) = 1.0
        _VignetteStrength ("Vignette Strength", Range(0.0, 1.0)) = 0.45
        _VignetteRadius ("Vignette Radius", Range(0.3, 1.2)) = 0.88
    }

    SubShader
    {
        Cull Off
        ZWrite Off
        ZTest Always

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0

            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_TexelSize;

            float _K1;
            float _K2;
            float _ZoomScale;
            float _ChromaticAberration;
            float _LensCenterOffset;
            float _EyeAspect;
            float _VignetteStrength;
            float _VignetteRadius;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                return o;
            }

            float2 DistortUV(float2 centeredAspectPos, float2 center, float invAspect, float channelScale)
            {
                float r2 = dot(centeredAspectPos, centeredAspectPos);
                float poly = 1.0 + _K1 * r2 + _K2 * r2 * r2;
                float2 warped = centeredAspectPos * (poly * channelScale / max(_ZoomScale, 0.1));
                warped.x *= invAspect;
                return warped * 0.5 + center;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 center = float2(0.5 + _LensCenterOffset, 0.5);
                float aspect = max(_EyeAspect, 0.25);
                float invAspect = 1.0 / aspect;

                // Map UV to [-1, 1] space around optical lens center, corrected for eye aspect
                float2 p = (i.uv - center) * 2.0;
                p.x *= aspect;

                // Evaluate per-channel radial Brown-Conrady pre-distortion
                float2 uvR = DistortUV(p, center, invAspect, 1.0 + _ChromaticAberration);
                float2 uvG = DistortUV(p, center, invAspect, 1.0);
                float2 uvB = DistortUV(p, center, invAspect, 1.0 - _ChromaticAberration);

                // Clip pixels whose green channel falls outside the valid eye texture bounds
                if (uvG.x < 0.0 || uvG.x > 1.0 || uvG.y < 0.0 || uvG.y > 1.0)
                {
                    return fixed4(0.0, 0.0, 0.0, 1.0);
                }

                fixed r = (uvR.x >= 0.0 && uvR.x <= 1.0 && uvR.y >= 0.0 && uvR.y <= 1.0)
                    ? tex2D(_MainTex, uvR).r : 0.0;
                fixed g = tex2D(_MainTex, uvG).g;
                fixed b = (uvB.x >= 0.0 && uvB.x <= 1.0 && uvB.y >= 0.0 && uvB.y <= 1.0)
                    ? tex2D(_MainTex, uvB).b : 0.0;

                // Soft circular edge vignette matching optical lens FOV boundary
                float2 borderDist = min(uvG, 1.0 - uvG);
                float edgeMask = smoothstep(0.0, 0.035, min(borderDist.x, borderDist.y));

                float distFromCenter = length(p);
                float vignette = 1.0 - _VignetteStrength * smoothstep(_VignetteRadius * 0.65, _VignetteRadius, distFromCenter);

                fixed3 col = fixed3(r, g, b) * edgeMask * saturate(vignette);
                return fixed4(col, 1.0);
            }
            ENDCG
        }
    }

    Fallback Off
}
