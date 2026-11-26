using System;
using UnityEngine;
#if UNITY_ANDROID
using UnityEngine.Android;
#endif

namespace MobileQuestVR.HandTracking
{
    /// <summary>
    /// Manages Android camera permission and rear camera metadata/stream capture for MediaPipe Hand Tracking.
    /// Provides camera pinhole intrinsics (horizontal/vertical FOV) needed to unproject 2D hand landmarks into 3D VR space.
    /// </summary>
    public class CameraFrameSource : MonoBehaviour
    {
        [Header("Capture Settings")]
        [SerializeField] private int requestedWidth = 640;
        [SerializeField] private int requestedHeight = 480;
        [SerializeField] private int requestedFps = 30;
        [SerializeField] private bool preferRearCamera = true;

        [Header("Approximate Phone Back Camera Intrinsics")]
        [Tooltip("Typical wide Android rear camera horizontal FOV in degrees.")]
        [Range(40f, 110f)]
        [SerializeField] private float horizontalFovDegrees = 68f;

        private WebCamTexture _webCamTexture;
        private bool _permissionRequested;

        public event Action<bool> OnCameraPermissionResult;

        public bool HasCameraPermission
        {
            get
            {
#if UNITY_ANDROID && !UNITY_EDITOR
                return Permission.HasUserAuthorizedPermission(Permission.Camera);
#else
                return true;
#endif
            }
        }

        public bool IsCapturing => _webCamTexture != null && _webCamTexture.isPlaying;
        public WebCamTexture ActiveTexture => _webCamTexture;
        public float HorizontalFovDegrees => horizontalFovDegrees;
        public float AspectRatio => _webCamTexture != null && _webCamTexture.height > 16
            ? (float)_webCamTexture.width / _webCamTexture.height
            : (float)requestedWidth / Mathf.Max(1, requestedHeight);

        public float VerticalFovDegrees
        {
            get
            {
                float halfH = Mathf.Tan(horizontalFovDegrees * 0.5f * Mathf.Deg2Rad);
                float halfV = halfH / Mathf.Max(0.25f, AspectRatio);
                return 2f * Mathf.Atan(halfV) * Mathf.Rad2Deg;
            }
        }

        public void RequestCameraPermission()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (HasCameraPermission)
            {
                OnCameraPermissionResult?.Invoke(true);
                return;
            }

            if (_permissionRequested)
            {
                return;
            }

            _permissionRequested = true;
            PermissionCallbacks callbacks = new PermissionCallbacks();
            callbacks.PermissionGranted += _ =>
            {
                _permissionRequested = false;
                OnCameraPermissionResult?.Invoke(true);
            };
            callbacks.PermissionDenied += _ =>
            {
                _permissionRequested = false;
                OnCameraPermissionResult?.Invoke(false);
            };
            Permission.RequestUserPermission(Permission.Camera, callbacks);
#else
            OnCameraPermissionResult?.Invoke(true);
#endif
        }

        /// <summary>
        /// Starts a Unity WebCamTexture feed (used when integrating C# / MediaPipeUnityPlugin pipelines
        /// directly inside Unity instead of Android CameraX native capture).
        /// </summary>
        public bool StartUnityWebCamCapture()
        {
            if (!HasCameraPermission)
            {
                RequestCameraPermission();
                return false;
            }

            if (IsCapturing)
            {
                return true;
            }

            WebCamDevice[] devices = WebCamTexture.devices;
            if (devices == null || devices.Length == 0)
            {
                Debug.LogWarning("[MobileQuestVR] No camera hardware detected for hand tracking.");
                return false;
            }

            string selectedDevice = devices[0].name;
            foreach (WebCamDevice device in devices)
            {
                if (preferRearCamera && !device.isFrontFacing)
                {
                    selectedDevice = device.name;
                    break;
                }

                if (!preferRearCamera && device.isFrontFacing)
                {
                    selectedDevice = device.name;
                    break;
                }
            }

            _webCamTexture = new WebCamTexture(selectedDevice, requestedWidth, requestedHeight, requestedFps);
            _webCamTexture.Play();
            return true;
        }

        public void StopUnityWebCamCapture()
        {
            if (_webCamTexture != null)
            {
                if (_webCamTexture.isPlaying)
                {
                    _webCamTexture.Stop();
                }

                Destroy(_webCamTexture);
                _webCamTexture = null;
            }
        }

        private void OnDestroy()
        {
            StopUnityWebCamCapture();
        }
    }
}
