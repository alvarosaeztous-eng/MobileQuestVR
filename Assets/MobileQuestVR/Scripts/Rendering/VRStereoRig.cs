using System;
using MobileQuestVR.Core;
using UnityEngine;

namespace MobileQuestVR.Rendering
{
    /// <summary>
    /// Controls the dual-camera mobile stereoscopic VR rendering pipeline:
    /// split-screen left/right eye cameras, IPD adjustment, off-axis frustums, barrel distortion,
    /// background clear pass, and live Stereo/Mono switching.
    /// </summary>
    public class VRStereoRig : MonoBehaviour
    {
        [Header("Profile & Mode")]
        [SerializeField] private VRHeadsetProfile headsetProfile;
        [SerializeField] private bool stereoEnabled = true;
        [SerializeField] private bool barrelDistortionEnabled = true;
        [SerializeField] private Color skyBackgroundColor = new Color(0.08f, 0.12f, 0.20f, 1f);

        [Header("Hierarchy References (auto-created if null)")]
        [SerializeField] private Transform trackingOrigin;
        [SerializeField] private Transform headPivot;
        [SerializeField] private Transform centerEyeAnchor;
        [SerializeField] private Camera backgroundClearCamera;
        [SerializeField] private Camera leftEyeCamera;
        [SerializeField] private Camera rightEyeCamera;

        private StereoDistortionEffect _leftDistortion;
        private StereoDistortionEffect _rightDistortion;
        private int _lastScreenWidth;
        private int _lastScreenHeight;
        private bool _isInitialized;

        public event Action OnStereoSettingsChanged;

        public VRHeadsetProfile HeadsetProfile => headsetProfile;
        public Transform TrackingOrigin => trackingOrigin;
        public Transform HeadPivot => headPivot;
        public Transform CenterEyeAnchor => centerEyeAnchor;
        public Camera LeftEyeCamera => leftEyeCamera;
        public Camera RightEyeCamera => rightEyeCamera;
        public bool StereoEnabled => stereoEnabled;
        public bool BarrelDistortionEnabled => barrelDistortionEnabled;
        public float CurrentIpdMeters => headsetProfile != null ? headsetProfile.interpupillaryDistance : 0.064f;
        public float CurrentVerticalFov => headsetProfile != null ? headsetProfile.verticalFov : 86f;

        private void Awake()
        {
            EnsureInitialized();
        }

        private void LateUpdate()
        {
            if (!_isInitialized)
            {
                return;
            }

            if (Screen.width != _lastScreenWidth || Screen.height != _lastScreenHeight)
            {
                ApplyOpticalConfiguration();
            }
        }

        public void EnsureInitialized(VRHeadsetProfile profileOverride = null)
        {
            if (profileOverride != null)
            {
                headsetProfile = profileOverride;
            }

            if (headsetProfile == null)
            {
                headsetProfile = VRHeadsetProfile.CreateRuntimeDefault();
            }

            if (!_isInitialized)
            {
                BuildOrBindHierarchy();
                barrelDistortionEnabled = headsetProfile.enableBarrelDistortion;
                _isInitialized = true;
            }

            ApplyOpticalConfiguration();
        }

        public void SetStereoEnabled(bool enabled)
        {
            stereoEnabled = enabled;
            ApplyOpticalConfiguration();
            OnStereoSettingsChanged?.Invoke();
        }

        public void ToggleStereoMode()
        {
            SetStereoEnabled(!stereoEnabled);
        }

        public void SetBarrelDistortionEnabled(bool enabled)
        {
            barrelDistortionEnabled = enabled;
            if (headsetProfile != null)
            {
                headsetProfile.enableBarrelDistortion = enabled;
            }

            ApplyOpticalConfiguration();
            OnStereoSettingsChanged?.Invoke();
        }

        public void ToggleBarrelDistortion()
        {
            SetBarrelDistortionEnabled(!barrelDistortionEnabled);
        }

        public void SetInterpupillaryDistance(float ipdMeters)
        {
            EnsureInitialized();
            headsetProfile.interpupillaryDistance = Mathf.Clamp(ipdMeters, 0.050f, 0.080f);
            ApplyOpticalConfiguration();
            OnStereoSettingsChanged?.Invoke();
        }

        public void AdjustIpdMillimeters(float deltaMm)
        {
            SetInterpupillaryDistance(CurrentIpdMeters + deltaMm * 0.001f);
        }

        public void SetVerticalFov(float fovDegrees)
        {
            EnsureInitialized();
            headsetProfile.verticalFov = Mathf.Clamp(fovDegrees, 60f, 110f);
            ApplyOpticalConfiguration();
            OnStereoSettingsChanged?.Invoke();
        }

        public void SetSkyColor(Color color)
        {
            skyBackgroundColor = color;
            if (leftEyeCamera != null)
            {
                leftEyeCamera.backgroundColor = color;
            }

            if (rightEyeCamera != null)
            {
                rightEyeCamera.backgroundColor = color;
            }
        }

        /// <summary>
        /// Returns the active primary camera (LeftEye in stereo or mono mode) for UI WorldSpace Canvas assignment.
        /// </summary>
        public Camera GetPrimaryEventCamera()
        {
            return leftEyeCamera != null ? leftEyeCamera : Camera.main;
        }

        public void ApplyOpticalConfiguration()
        {
            if (headsetProfile == null || leftEyeCamera == null || rightEyeCamera == null)
            {
                return;
            }

            _lastScreenWidth = Mathf.Max(1, Screen.width);
            _lastScreenHeight = Mathf.Max(1, Screen.height);

            if (trackingOrigin != null)
            {
                Vector3 pos = trackingOrigin.localPosition;
                trackingOrigin.localPosition = new Vector3(pos.x, headsetProfile.eyeHeightMeters, pos.z);
            }

            if (stereoEnabled)
            {
                leftEyeCamera.enabled = true;
                rightEyeCamera.enabled = true;

                leftEyeCamera.rect = new Rect(0f, 0f, 0.5f, 1f);
                rightEyeCamera.rect = new Rect(0.5f, 0f, 0.5f, 1f);

                leftEyeCamera.transform.localPosition = StereoEyeFrustum.GetLocalEyeOffset(StereoEye.Left, headsetProfile.interpupillaryDistance);
                rightEyeCamera.transform.localPosition = StereoEyeFrustum.GetLocalEyeOffset(StereoEye.Right, headsetProfile.interpupillaryDistance);
                leftEyeCamera.transform.localRotation = Quaternion.identity;
                rightEyeCamera.transform.localRotation = Quaternion.identity;

                float eyeWidth = _lastScreenWidth * 0.5f;
                float eyeAspect = eyeWidth / _lastScreenHeight;

                ConfigureCameraCommon(leftEyeCamera);
                ConfigureCameraCommon(rightEyeCamera);

                leftEyeCamera.projectionMatrix = StereoEyeFrustum.ComputeProjectionMatrix(
                    StereoEye.Left,
                    headsetProfile.verticalFov,
                    eyeAspect,
                    headsetProfile.nearClipPlane,
                    headsetProfile.farClipPlane,
                    headsetProfile.interpupillaryDistance,
                    headsetProfile.convergenceDistance,
                    headsetProfile.lensCenterOffsetX);

                rightEyeCamera.projectionMatrix = StereoEyeFrustum.ComputeProjectionMatrix(
                    StereoEye.Right,
                    headsetProfile.verticalFov,
                    eyeAspect,
                    headsetProfile.nearClipPlane,
                    headsetProfile.farClipPlane,
                    headsetProfile.interpupillaryDistance,
                    headsetProfile.convergenceDistance,
                    headsetProfile.lensCenterOffsetX);

                if (_leftDistortion != null)
                {
                    _leftDistortion.Configure(StereoEye.Left, headsetProfile, barrelDistortionEnabled);
                }

                if (_rightDistortion != null)
                {
                    _rightDistortion.Configure(StereoEye.Right, headsetProfile, barrelDistortionEnabled);
                }
            }
            else
            {
                // Mono desktop/debug preview mode: full-screen single center camera
                leftEyeCamera.enabled = true;
                rightEyeCamera.enabled = false;

                leftEyeCamera.rect = new Rect(0f, 0f, 1f, 1f);
                leftEyeCamera.transform.localPosition = Vector3.zero;
                leftEyeCamera.transform.localRotation = Quaternion.identity;
                ConfigureCameraCommon(leftEyeCamera);
                leftEyeCamera.ResetProjectionMatrix();
                leftEyeCamera.fieldOfView = Mathf.Clamp(headsetProfile.verticalFov - 10f, 60f, 95f);

                if (_leftDistortion != null)
                {
                    _leftDistortion.Configure(StereoEye.Left, headsetProfile, false);
                }

                if (_rightDistortion != null)
                {
                    _rightDistortion.Configure(StereoEye.Right, headsetProfile, false);
                }
            }
        }

        private void ConfigureCameraCommon(Camera cam)
        {
            cam.nearClipPlane = headsetProfile.nearClipPlane;
            cam.farClipPlane = headsetProfile.farClipPlane;
            cam.fieldOfView = headsetProfile.verticalFov;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = skyBackgroundColor;
            cam.allowHDR = false; // Better fillrate & compatibility on mobile VR GPUs
            cam.allowMSAA = true;
            cam.stereoTargetEye = StereoTargetEyeMask.None;
        }

        private void BuildOrBindHierarchy()
        {
            // Disable any legacy scene Main Camera so it doesn't render over the stereo cameras
            Camera[] existingCameras = FindObjectsByType<Camera>(FindObjectsSortMode.None);
            foreach (Camera cam in existingCameras)
            {
                if (cam != leftEyeCamera && cam != rightEyeCamera && cam != backgroundClearCamera && !cam.transform.IsChildOf(transform))
                {
                    cam.gameObject.SetActive(false);
                }
            }

            if (trackingOrigin == null)
            {
                trackingOrigin = FindOrCreateChild(transform, "TrackingOrigin");
                trackingOrigin.localPosition = new Vector3(0f, headsetProfile.eyeHeightMeters, 0f);
            }

            if (headPivot == null)
            {
                headPivot = FindOrCreateChild(trackingOrigin, "HeadPivot");
            }

            if (centerEyeAnchor == null)
            {
                centerEyeAnchor = FindOrCreateChild(headPivot, "CenterEyeAnchor");
            }

            // Ensure a single AudioListener sits at the midpoint between eyes
            AudioListener[] listeners = FindObjectsByType<AudioListener>(FindObjectsSortMode.None);
            AudioListener headListener = centerEyeAnchor.GetComponent<AudioListener>();
            foreach (AudioListener listener in listeners)
            {
                if (listener != headListener)
                {
                    listener.enabled = false;
                }
            }

            if (headListener == null)
            {
                headListener = centerEyeAnchor.gameObject.AddComponent<AudioListener>();
            }
            headListener.enabled = true;

            if (backgroundClearCamera == null)
            {
                Transform bgTransform = FindOrCreateChild(trackingOrigin, "StereoBackdropClearCamera");
                backgroundClearCamera = GetOrAddComponent<Camera>(bgTransform.gameObject);
                backgroundClearCamera.clearFlags = CameraClearFlags.SolidColor;
                backgroundClearCamera.backgroundColor = Color.black;
                backgroundClearCamera.cullingMask = 0;
                backgroundClearCamera.depth = -10f;
                backgroundClearCamera.allowHDR = false;
                backgroundClearCamera.allowMSAA = false;
                backgroundClearCamera.useOcclusionCulling = false;
            }

            if (leftEyeCamera == null)
            {
                Transform leftTransform = FindOrCreateChild(centerEyeAnchor, "LeftEyeCamera");
                leftTransform.gameObject.tag = "MainCamera";
                leftEyeCamera = GetOrAddComponent<Camera>(leftTransform.gameObject);
                leftEyeCamera.depth = 0f;
            }

            if (rightEyeCamera == null)
            {
                Transform rightTransform = FindOrCreateChild(centerEyeAnchor, "RightEyeCamera");
                rightEyeCamera = GetOrAddComponent<Camera>(rightTransform.gameObject);
                rightEyeCamera.depth = 1f;
            }

            _leftDistortion = GetOrAddComponent<StereoDistortionEffect>(leftEyeCamera.gameObject);
            _rightDistortion = GetOrAddComponent<StereoDistortionEffect>(rightEyeCamera.gameObject);
        }

        private static Transform FindOrCreateChild(Transform parent, string childName)
        {
            Transform found = parent.Find(childName);
            if (found != null)
            {
                return found;
            }

            GameObject go = new GameObject(childName);
            go.transform.SetParent(parent, false);
            return go.transform;
        }

        private static T GetOrAddComponent<T>(GameObject target) where T : Component
        {
            T comp = target.GetComponent<T>();
            return comp != null ? comp : target.AddComponent<T>();
        }
    }
}
