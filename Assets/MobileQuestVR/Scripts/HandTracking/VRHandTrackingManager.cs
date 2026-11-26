using System;
using MobileQuestVR.Rendering;
using UnityEngine;

namespace MobileQuestVR.HandTracking
{
    /// <summary>
    /// Coordinates the complete MediaPipe Hand Tracking pipeline:
    /// provider lifecycle, Android camera permissions, 2D-to-3D VR spatial mapping with One-Euro filtering,
    /// geometric gesture recognition, and real-time hand pose events.
    /// </summary>
    public class VRHandTrackingManager : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private VRStereoRig stereoRig;
        [SerializeField] private CameraFrameSource cameraFrameSource;

        [Header("Tracking Settings")]
        [SerializeField] private float handLostTimeoutSeconds = 0.30f;
        [SerializeField] private float palmMenuHoldSeconds = 0.75f;
        [SerializeField] private bool requestAndroidCameraPermissionOnStart = true;

        private readonly RawHandTrackingFrame _workingFrame = new RawHandTrackingFrame();
        private readonly HandSpatialMapper _leftMapper = new HandSpatialMapper();
        private readonly HandSpatialMapper _rightMapper = new HandSpatialMapper();
        private readonly HandGestureRecognizer _leftRecognizer = new HandGestureRecognizer();
        private readonly HandGestureRecognizer _rightRecognizer = new HandGestureRecognizer();

        private readonly TrackedHandPose _leftHand = new TrackedHandPose(Handedness.Left);
        private readonly TrackedHandPose _rightHand = new TrackedHandPose(Handedness.Right);

        private IHandTrackingProvider _provider;
        private AndroidMediaPipeHandProvider _androidMediaPipeProvider;
        private EditorHandInputProvider _editorHandProvider;
        private float _palmMenuHoldTimer;
        private bool _palmMenuTriggeredForHold;

        public event Action<TrackedHandPose> OnHandPinchStarted;
        public event Action<TrackedHandPose> OnHandPinchEnded;
        public event Action OnPalmMenuGesture;

        public TrackedHandPose LeftHand => _leftHand;
        public TrackedHandPose RightHand => _rightHand;
        public bool AnyHandTracked => _leftHand.IsTracked || _rightHand.IsTracked;
        public string ProviderName => _provider != null ? _provider.ProviderName : "None";
        public HandTrackingProviderStatus ProviderStatus => _provider != null ? _provider.Status : HandTrackingProviderStatus.Uninitialized;
        public string ProviderStatusDetail => _provider != null ? _provider.StatusDetail : "Uninitialized";
        public CameraFrameSource CameraSource => cameraFrameSource;

        public void Initialize(VRStereoRig rig)
        {
            stereoRig = rig;
            EnsureCameraSource();
            SetupProvider();
        }

        private void Start()
        {
            if (stereoRig == null)
            {
                stereoRig = FindFirstObjectByType<VRStereoRig>();
            }

            EnsureCameraSource();
            if (_provider == null)
            {
                SetupProvider();
            }
        }

        private void OnDestroy()
        {
            if (cameraFrameSource != null)
            {
                cameraFrameSource.OnCameraPermissionResult -= HandleCameraPermissionResult;
            }

            _provider?.Dispose();
        }

        private void Update()
        {
            if (_provider == null || stereoRig == null || stereoRig.CenterEyeAnchor == null)
            {
                return;
            }

            float dt = Mathf.Max(Time.unscaledDeltaTime, 0.001f);
            float now = Time.unscaledTime;

            bool sawLeft = false;
            bool sawRight = false;

            if (_provider.TryGetLatestFrame(_workingFrame))
            {
                float hFov = cameraFrameSource != null ? cameraFrameSource.HorizontalFovDegrees : 68f;
                float aspect = cameraFrameSource != null ? cameraFrameSource.AspectRatio : (4f / 3f);
                Transform eyeAnchor = stereoRig.CenterEyeAnchor;

                for (int i = 0; i < _workingFrame.HandCount; i++)
                {
                    RawHandDetection detection = _workingFrame.Hands[i];
                    if (detection.Confidence < 0.2f)
                    {
                        continue;
                    }

                    bool isLeft = detection.Handedness == Handedness.Left;
                    if (isLeft)
                    {
                        sawLeft = true;
                        ProcessHandDetection(detection, _leftMapper, _leftRecognizer, _leftHand, eyeAnchor, hFov, aspect, dt);
                    }
                    else
                    {
                        sawRight = true;
                        ProcessHandDetection(detection, _rightMapper, _rightRecognizer, _rightHand, eyeAnchor, hFov, aspect, dt);
                    }
                }
            }

            UpdateTrackingTimeout(_leftHand, _leftMapper, _leftRecognizer, sawLeft, now);
            UpdateTrackingTimeout(_rightHand, _rightMapper, _rightRecognizer, sawRight, now);

            EvaluatePalmMenuGesture(dt);
        }

        /// <summary>
        /// Allows external Unity MediaPipe plugins (or tests) to feed real packed 21-landmark frames into the manager.
        /// </summary>
        public bool InjectMediaPipePackedFrame(float[] packedBuffer, long timestampMs)
        {
            if (_androidMediaPipeProvider == null)
            {
                _androidMediaPipeProvider = new AndroidMediaPipeHandProvider(cameraFrameSource);
                _provider = _androidMediaPipeProvider;
            }

            return _androidMediaPipeProvider.InjectPackedFrame(packedBuffer, timestampMs);
        }

        /// <summary>
        /// Requests Android camera permission (on Android) or toggles the Editor test hand (in Unity Editor).
        /// </summary>
        public void RequestCameraOrTogglePreview()
        {
            if (Application.platform == RuntimePlatform.Android)
            {
                if (cameraFrameSource != null)
                {
                    cameraFrameSource.RequestCameraPermission();
                }
            }
            else if (_editorHandProvider != null)
            {
                _editorHandProvider.ToggleVisibility();
            }
        }

        public TrackedHandPose GetPrimaryInteractionHand()
        {
            if (_rightHand.IsTracked)
            {
                return _rightHand;
            }

            if (_leftHand.IsTracked)
            {
                return _leftHand;
            }

            return null;
        }

        private void EnsureCameraSource()
        {
            if (cameraFrameSource == null)
            {
                cameraFrameSource = GetComponent<CameraFrameSource>();
                if (cameraFrameSource == null)
                {
                    cameraFrameSource = gameObject.AddComponent<CameraFrameSource>();
                }
            }

            cameraFrameSource.OnCameraPermissionResult -= HandleCameraPermissionResult;
            cameraFrameSource.OnCameraPermissionResult += HandleCameraPermissionResult;
        }

        private void SetupProvider()
        {
            _provider?.Dispose();

            if (Application.platform == RuntimePlatform.Android)
            {
                _androidMediaPipeProvider = new AndroidMediaPipeHandProvider(cameraFrameSource);
                _provider = _androidMediaPipeProvider;
                _provider.Initialize();

                if (cameraFrameSource.HasCameraPermission)
                {
                    _provider.StartTracking();
                }
                else if (requestAndroidCameraPermissionOnStart)
                {
                    cameraFrameSource.RequestCameraPermission();
                }
            }
            else
            {
                _editorHandProvider = new EditorHandInputProvider();
                _provider = _editorHandProvider;
                _provider.Initialize();
                _provider.StartTracking();
            }

            Debug.Log($"[MobileQuestVR] Hand tracking provider initialized: {_provider.ProviderName} ({_provider.StatusDetail})");
        }

        private void HandleCameraPermissionResult(bool granted)
        {
            if (granted && _provider != null)
            {
                _provider.Initialize();
                _provider.StartTracking();
            }
        }

        private void ProcessHandDetection(
            RawHandDetection detection,
            HandSpatialMapper mapper,
            HandGestureRecognizer recognizer,
            TrackedHandPose pose,
            Transform eyeAnchor,
            float hFov,
            float aspect,
            float dt)
        {
            mapper.MapToWorldPose(detection, eyeAnchor, hFov, aspect, dt, pose);
            pose.Gesture = recognizer.Evaluate(pose.WorldJoints, pose.PalmCenter, pose.PalmNormal, eyeAnchor.position);

            if (pose.Gesture.PinchStartedThisFrame)
            {
                OnHandPinchStarted?.Invoke(pose);
            }
            else if (pose.Gesture.PinchEndedThisFrame)
            {
                OnHandPinchEnded?.Invoke(pose);
            }
        }

        private void UpdateTrackingTimeout(
            TrackedHandPose pose,
            HandSpatialMapper mapper,
            HandGestureRecognizer recognizer,
            bool updatedThisFrame,
            float now)
        {
            if (updatedThisFrame || !pose.IsTracked)
            {
                return;
            }

            if (now - pose.LastTrackedTime > handLostTimeoutSeconds)
            {
                bool wasPinching = pose.Gesture.IsPinching;
                pose.IsTracked = false;
                pose.Gesture = default;
                mapper.ResetFilters();
                recognizer.Reset();

                if (wasPinching)
                {
                    OnHandPinchEnded?.Invoke(pose);
                }
            }
        }

        private void EvaluatePalmMenuGesture(float dt)
        {
            bool leftOpenPalmTowardHead = _leftHand.IsTracked
                && _leftHand.Gesture.PrimaryGesture == HandGestureType.OpenPalm
                && _leftHand.Gesture.IsPalmFacingHead;

            bool rightOpenPalmTowardHead = _rightHand.IsTracked
                && _rightHand.Gesture.PrimaryGesture == HandGestureType.OpenPalm
                && _rightHand.Gesture.IsPalmFacingHead;

            if (leftOpenPalmTowardHead || rightOpenPalmTowardHead)
            {
                _palmMenuHoldTimer += dt;
                if (!_palmMenuTriggeredForHold && _palmMenuHoldTimer >= palmMenuHoldSeconds)
                {
                    _palmMenuTriggeredForHold = true;
                    OnPalmMenuGesture?.Invoke();
                }
            }
            else
            {
                _palmMenuHoldTimer = 0f;
                _palmMenuTriggeredForHold = false;
            }
        }
    }
}
