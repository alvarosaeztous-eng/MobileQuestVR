using UnityEngine;

namespace MobileQuestVR.Core
{
    /// <summary>
    /// Shared runtime utilities for shaders, materials, built-in Unity 6 fonts, and layer resolution.
    /// </summary>
    public static class VRRuntimeConfig
    {
        public const string ShaderStereoDistortion = "MobileQuestVR/StereoBarrelDistortion";
        public const string ShaderRoomSurfaceLit = "MobileQuestVR/RoomSurfaceLit";
        public const string ShaderHoloPanel = "MobileQuestVR/HoloPanel";
        public const string ShaderGazeReticle = "MobileQuestVR/GazeReticle";

        public const string LayerNameInteractable = "VRInteractable";
        public const string LayerNameUI = "VRUI";
        public const string LayerNameHands = "VRHands";
        public const string LayerNameEnvironment = "VREnvironment";

        private static Font _cachedBuiltinFont;

        /// <summary>
        /// Resolves a named Unity layer, falling back to layer 0 (Default) if unconfigured.
        /// </summary>
        public static int ResolveLayer(string layerName)
        {
            int idx = LayerMask.NameToLayer(layerName);
            return idx >= 0 ? idx : 0;
        }

        /// <summary>
        /// Builds a LayerMask covering VR interactable objects and VR floating UI panels.
        /// </summary>
        public static LayerMask GetInteractionLayerMask()
        {
            int interactableLayer = LayerMask.NameToLayer(LayerNameInteractable);
            int uiLayer = LayerMask.NameToLayer(LayerNameUI);
            int mask = 1 << 0; // Always include Default as fallback

            if (interactableLayer >= 0)
            {
                mask |= 1 << interactableLayer;
            }

            if (uiLayer >= 0)
            {
                mask |= 1 << uiLayer;
            }

            return mask;
        }

        /// <summary>
        /// Loads Unity 6's built-in font (LegacyRuntime.ttf) safely without requiring TMP Essentials import.
        /// </summary>
        public static Font GetSafeBuiltinFont()
        {
            if (_cachedBuiltinFont != null)
            {
                return _cachedBuiltinFont;
            }

            _cachedBuiltinFont = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (_cachedBuiltinFont == null)
            {
                _cachedBuiltinFont = Resources.GetBuiltinResource<Font>("Arial.ttf");
            }

            return _cachedBuiltinFont;
        }

        /// <summary>
        /// Creates a mobile-optimized lit material using MobileQuestVR/RoomSurfaceLit with safe shader fallback.
        /// </summary>
        public static Material CreateRoomMaterial(
            Color baseColor,
            float smoothness = 0.35f,
            Color? emission = null,
            float rimStrength = 0.12f,
            float gridScale = 0f,
            float gridStrength = 0f,
            Color? gridColor = null)
        {
            Shader shader = Shader.Find(ShaderRoomSurfaceLit);
            if (shader == null)
            {
                shader = Shader.Find("Standard");
            }

            if (shader == null)
            {
                shader = Shader.Find("Universal Render Pipeline/Lit");
            }

            Material mat = new Material(shader);
            mat.color = baseColor;

            if (mat.HasProperty("_Smoothness"))
            {
                mat.SetFloat("_Smoothness", smoothness);
            }

            if (mat.HasProperty("_Glossiness"))
            {
                mat.SetFloat("_Glossiness", smoothness);
            }

            if (emission.HasValue && mat.HasProperty("_EmissionColor"))
            {
                mat.SetColor("_EmissionColor", emission.Value);
                if (emission.Value.maxColorComponent > 0.001f)
                {
                    mat.EnableKeyword("_EMISSION");
                }
            }

            if (mat.HasProperty("_RimStrength"))
            {
                mat.SetFloat("_RimStrength", rimStrength);
            }

            if (mat.HasProperty("_GridScale"))
            {
                mat.SetFloat("_GridScale", gridScale);
            }

            if (mat.HasProperty("_GridStrength"))
            {
                mat.SetFloat("_GridStrength", gridStrength);
            }

            if (gridColor.HasValue && mat.HasProperty("_GridColor"))
            {
                mat.SetColor("_GridColor", gridColor.Value);
            }

            return mat;
        }

        /// <summary>
        /// Creates a translucent holographic panel material using MobileQuestVR/HoloPanel with fallback.
        /// </summary>
        public static Material CreateHoloMaterial(Color tintColor, Color borderColor, float borderWidth = 0.018f)
        {
            Shader shader = Shader.Find(ShaderHoloPanel);
            if (shader == null)
            {
                shader = Shader.Find("UI/Default");
            }

            Material mat = new Material(shader);
            if (mat.HasProperty("_Color"))
            {
                mat.SetColor("_Color", tintColor);
            }

            if (mat.HasProperty("_BorderColor"))
            {
                mat.SetColor("_BorderColor", borderColor);
            }

            if (mat.HasProperty("_BorderWidth"))
            {
                mat.SetFloat("_BorderWidth", borderWidth);
            }

            return mat;
        }
    }
}
