using MobileQuestVR.Core;
using UnityEngine;

namespace MobileQuestVR.Rendering
{
    /// <summary>
    /// Post-processing image effect attached to each eye camera that applies real-time
    /// Brown-Conrady barrel distortion, lateral chromatic aberration compensation, and lens vignetting.
    /// </summary>
    [DisallowMultipleComponent]
    [RequireComponent(typeof(Camera))]
    public class StereoDistortionEffect : MonoBehaviour
    {
        private static readonly int PropK1 = Shader.PropertyToID("_K1");
        private static readonly int PropK2 = Shader.PropertyToID("_K2");
        private static readonly int PropZoomScale = Shader.PropertyToID("_ZoomScale");
        private static readonly int PropChromaticAberration = Shader.PropertyToID("_ChromaticAberration");
        private static readonly int PropLensCenterOffset = Shader.PropertyToID("_LensCenterOffset");
        private static readonly int PropEyeAspect = Shader.PropertyToID("_EyeAspect");
        private static readonly int PropVignetteStrength = Shader.PropertyToID("_VignetteStrength");
        private static readonly int PropVignetteRadius = Shader.PropertyToID("_VignetteRadius");

        [SerializeField] private StereoEye eye = StereoEye.Left;
        [SerializeField] private bool distortionEnabled = true;

        private Camera _camera;
        private Material _material;
        private VRHeadsetProfile _profile;

        public StereoEye Eye
        {
            get => eye;
            set => eye = value;
        }

        public bool DistortionEnabled
        {
            get => distortionEnabled;
            set => distortionEnabled = value;
        }

        public bool HasValidShader => _material != null;

        private void Awake()
        {
            _camera = GetComponent<Camera>();
            EnsureMaterial();
        }

        private void OnDestroy()
        {
            if (_material != null)
            {
                if (Application.isPlaying)
                {
                    Destroy(_material);
                }
                else
                {
                    DestroyImmediate(_material);
                }
                _material = null;
            }
        }

        public void Configure(StereoEye targetEye, VRHeadsetProfile profile, bool enableDistortion)
        {
            eye = targetEye;
            _profile = profile;
            distortionEnabled = enableDistortion;
            EnsureMaterial();
        }

        private void EnsureMaterial()
        {
            if (_material != null)
            {
                return;
            }

            Shader shader = Shader.Find(VRRuntimeConfig.ShaderStereoDistortion);
            if (shader == null || !shader.isSupported)
            {
                Debug.LogWarning($"[MobileQuestVR] Shader '{VRRuntimeConfig.ShaderStereoDistortion}' unavailable; barrel distortion bypassed.");
                return;
            }

            _material = new Material(shader)
            {
                hideFlags = HideFlags.HideAndDontSave
            };
        }

        private void OnRenderImage(RenderTexture source, RenderTexture destination)
        {
            if (!distortionEnabled || _material == null || _profile == null)
            {
                Graphics.Blit(source, destination);
                return;
            }

            float eyeAspect = _camera != null && _camera.pixelHeight > 0
                ? (float)_camera.pixelWidth / _camera.pixelHeight
                : 1f;

            float eyeSign = eye == StereoEye.Left ? -1f : 1f;

            _material.SetFloat(PropK1, _profile.distortionK1);
            _material.SetFloat(PropK2, _profile.distortionK2);
            _material.SetFloat(PropZoomScale, _profile.zoomScale);
            _material.SetFloat(PropChromaticAberration, _profile.chromaticAberration);
            _material.SetFloat(PropLensCenterOffset, eyeSign * _profile.lensCenterOffsetX);
            _material.SetFloat(PropEyeAspect, eyeAspect);
            _material.SetFloat(PropVignetteStrength, _profile.vignetteStrength);
            _material.SetFloat(PropVignetteRadius, _profile.vignetteRadius);

            Graphics.Blit(source, destination, _material);
        }
    }
}
