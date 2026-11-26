Shader "MobileQuestVR/GazeReticle"
{
    Properties
    {
        _Color ("Base Color", Color) = (0.95, 0.98, 1.0, 0.9)
        _ProgressColor ("Dwell Progress Color", Color) = (0.15, 0.85, 1.0, 1.0)
        _Progress ("Dwell Progress", Range(0.0, 1.0)) = 0.0
        _InnerRadius ("Inner Ring Radius", Range(0.05, 0.45)) = 0.22
        _OuterRadius ("Outer Ring Radius", Range(0.1, 0.49)) = 0.36
        _DotRadius ("Center Dot Radius", Range(0.0, 0.15)) = 0.06
    }

    SubShader
    {
        Tags { "Queue" = "Overlay" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        Blend SrcAlpha OneMinusSrcAlpha
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

            fixed4 _Color;
            fixed4 _ProgressColor;
            float _Progress;
            float _InnerRadius;
            float _OuterRadius;
            float _DotRadius;

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

            fixed4 frag(v2f i) : SV_Target
            {
                float2 centered = i.uv - 0.5;
                float r = length(centered);
                float aa = max(fwidth(r), 0.012);

                float outerMask = 1.0 - smoothstep(_OuterRadius - aa, _OuterRadius + aa, r);
                float innerMask = smoothstep(_InnerRadius - aa, _InnerRadius + aa, r);
                float ringMask = outerMask * innerMask;

                float dotMask = 1.0 - smoothstep(_DotRadius - aa, _DotRadius + aa, r);

                // Clockwise angle starting at 12 o'clock (0..1)
                float angle = atan2(centered.x, centered.y);
                float normAngle = frac(angle / 6.2831853);
                float progressFill = step(normAngle, _Progress) * step(0.001, _Progress);

                fixed4 ringCol = lerp(_Color, _ProgressColor, progressFill);
                ringCol.a *= lerp(0.55, 1.0, progressFill);

                fixed4 finalCol = ringCol * ringMask + _Color * dotMask;
                finalCol.a = saturate(ringCol.a * ringMask + _Color.a * dotMask);
                return finalCol;
            }
            ENDCG
        }
    }

    Fallback Off
}
