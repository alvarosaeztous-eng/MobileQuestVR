using System;
using System.Collections.Generic;
using MobileQuestVR.Rendering;
using UnityEngine;

namespace MobileQuestVR.Environment
{
    public enum RoomLightingPreset
    {
        StudioDay = 0,
        WarmLounge = 1,
        CyberNeon = 2
    }

    /// <summary>
    /// Dynamically controls the 3D Virtual Room's directional light, ceiling fill light,
    /// ambient trilight lighting, wall accent emission strips, and VR sky backdrop.
    /// </summary>
    public class RoomLightingController : MonoBehaviour
    {
        [SerializeField] private RoomLightingPreset currentPreset = RoomLightingPreset.StudioDay;
        [SerializeField] private Light sunLight;
        [SerializeField] private Light ceilingLight;
        [SerializeField] private Light deskAccentLight;

        private readonly List<Renderer> _accentStripRenderers = new List<Renderer>();
        private VRStereoRig _stereoRig;

        public event Action<RoomLightingPreset> OnPresetChanged;

        public RoomLightingPreset CurrentPreset => currentPreset;
        public string CurrentPresetName => currentPreset switch
        {
            RoomLightingPreset.StudioDay => "Studio Day",
            RoomLightingPreset.WarmLounge => "Warm Lounge",
            RoomLightingPreset.CyberNeon => "Cyber Neon",
            _ => currentPreset.ToString()
        };

        public void BindSceneLights(VRStereoRig rig, Light sun, Light ceiling, Light deskAccent, IEnumerable<Renderer> accentStrips)
        {
            _stereoRig = rig;
            sunLight = sun;
            ceilingLight = ceiling;
            deskAccentLight = deskAccent;

            _accentStripRenderers.Clear();
            if (accentStrips != null)
            {
                _accentStripRenderers.AddRange(accentStrips);
            }

            ApplyPreset(currentPreset);
        }

        public void CyclePreset()
        {
            int next = ((int)currentPreset + 1) % 3;
            ApplyPreset((RoomLightingPreset)next);
        }

        public void ApplyPreset(RoomLightingPreset preset)
        {
            currentPreset = preset;

            Color skyColor;
            Color ambientSky;
            Color ambientEquator;
            Color ambientGround;
            Color sunColor;
            float sunIntensity;
            Color ceilingColor;
            float ceilingIntensity;
            Color deskColor;
            float deskIntensity;
            Color accentEmission;

            switch (preset)
            {
                case RoomLightingPreset.WarmLounge:
                    skyColor = new Color(0.14f, 0.09f, 0.08f, 1f);
                    ambientSky = new Color(0.45f, 0.34f, 0.28f, 1f);
                    ambientEquator = new Color(0.32f, 0.23f, 0.19f, 1f);
                    ambientGround = new Color(0.14f, 0.10f, 0.09f, 1f);
                    sunColor = new Color(1.0f, 0.78f, 0.56f, 1f);
                    sunIntensity = 0.95f;
                    ceilingColor = new Color(1.0f, 0.85f, 0.68f, 1f);
                    ceilingIntensity = 1.25f;
                    deskColor = new Color(1.0f, 0.65f, 0.32f, 1f);
                    deskIntensity = 1.4f;
                    accentEmission = new Color(1.0f, 0.54f, 0.18f, 1f);
                    break;

                case RoomLightingPreset.CyberNeon:
                    skyColor = new Color(0.03f, 0.05f, 0.12f, 1f);
                    ambientSky = new Color(0.16f, 0.28f, 0.48f, 1f);
                    ambientEquator = new Color(0.18f, 0.14f, 0.34f, 1f);
                    ambientGround = new Color(0.07f, 0.08f, 0.14f, 1f);
                    sunColor = new Color(0.55f, 0.78f, 1.0f, 1f);
                    sunIntensity = 0.65f;
                    ceilingColor = new Color(0.35f, 0.75f, 1.0f, 1f);
                    ceilingIntensity = 1.15f;
                    deskColor = new Color(0.85f, 0.28f, 1.0f, 1f);
                    deskIntensity = 1.85f;
                    accentEmission = new Color(0.14f, 0.88f, 1.0f, 1f);
                    break;

                default: // StudioDay
                    skyColor = new Color(0.12f, 0.18f, 0.28f, 1f);
                    ambientSky = new Color(0.55f, 0.64f, 0.78f, 1f);
                    ambientEquator = new Color(0.42f, 0.46f, 0.52f, 1f);
                    ambientGround = new Color(0.22f, 0.24f, 0.28f, 1f);
                    sunColor = new Color(1.0f, 0.97f, 0.92f, 1f);
                    sunIntensity = 1.2f;
                    ceilingColor = new Color(0.92f, 0.96f, 1.0f, 1f);
                    ceilingIntensity = 1.1f;
                    deskColor = new Color(0.40f, 0.82f, 1.0f, 1f);
                    deskIntensity = 1.1f;
                    accentEmission = new Color(0.22f, 0.76f, 1.0f, 1f);
                    break;
            }

            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = ambientSky;
            RenderSettings.ambientEquatorColor = ambientEquator;
            RenderSettings.ambientGroundColor = ambientGround;

            if (_stereoRig != null)
            {
                _stereoRig.SetSkyColor(skyColor);
            }

            if (sunLight != null)
            {
                sunLight.color = sunColor;
                sunLight.intensity = sunIntensity;
            }

            if (ceilingLight != null)
            {
                ceilingLight.color = ceilingColor;
                ceilingLight.intensity = ceilingIntensity;
            }

            if (deskAccentLight != null)
            {
                deskAccentLight.color = deskColor;
                deskAccentLight.intensity = deskIntensity;
            }

            for (int i = 0; i < _accentStripRenderers.Count; i++)
            {
                Renderer r = _accentStripRenderers[i];
                if (r == null)
                {
                    continue;
                }

                Material mat = Application.isPlaying ? r.material : r.sharedMaterial;
                if (mat == null)
                {
                    continue;
                }

                mat.color = accentEmission;
                if (mat.HasProperty("_EmissionColor"))
                {
                    mat.SetColor("_EmissionColor", accentEmission * 0.9f);
                }
            }

            OnPresetChanged?.Invoke(currentPreset);
        }
    }
}
