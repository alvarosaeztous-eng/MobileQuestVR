Shader "MobileQuestVR/HoloPanel"
{
    Properties
    {
        _Color ("Panel Tint", Color) = (0.06, 0.12, 0.22, 0.86)
        _BorderColor ("Border Glow Color", Color) = (0.18, 0.72, 1.0, 0.95)
        _BorderWidth ("Border Width", Range(0.002, 0.08)) = 0.018
        _ScanlineDensity ("Scanline Density", Range(0.0, 120.0)) = 32.0
        _ScanlineIntensity ("Scanline Intensity", Range(0.0, 0.25)) = 0.05
    }

    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        Blend SrcAlpha OneMinusSrcAlpha
        Cull Off
        ZWrite Off

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0

            #include "UnityCG.cginc"

            fixed4 _Color;
            fixed4 _BorderColor;
            float _BorderWidth;
            float _ScanlineDensity;
            float _ScanlineIntensity;

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
                float2 d = min(i.uv, 1.0 - i.uv);
                float edge = min(d.x, d.y);
                float borderMask = 1.0 - smoothstep(_BorderWidth * 0.4, _BorderWidth, edge);

                float scan = sin(i.uv.y * _ScanlineDensity * 6.2831853 + _Time.y * 1.5) * 0.5 + 0.5;
                fixed3 bodyCol = _Color.rgb + _BorderColor.rgb * (scan * _ScanlineIntensity);

                fixed3 col = lerp(bodyCol, _BorderColor.rgb, borderMask);
                fixed alpha = lerp(_Color.a, _BorderColor.a, borderMask);
                return fixed4(col, alpha);
            }
            ENDCG
        }
    }

    Fallback "Transparent/Diffuse"
}
