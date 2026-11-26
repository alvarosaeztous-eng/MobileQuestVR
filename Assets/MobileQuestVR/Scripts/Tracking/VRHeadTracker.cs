using System;
using MobileQuestVR.Core;
using MobileQuestVR.Rendering;
using UnityEngine;
using UnityEngine.InputSystem;

namespace MobileQuestVR.Tracking
{
    /// <summary>
    /// Applies real-time 3DoF gyroscope head tracking to the VRStereoRig with:
    /// - Velocity-adaptive SLERP filtering (jitter-free while steady, instant response on fast head turns),
    /// - Horizon-preserving yaw recentering,
    /// - Biomechanical neck pivot offset model,
    /// - Optional WASD room exploration in desktop Editor mode.
    /// </summary>
    public class VRHeadTracker : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private VRStereoRig stereoRig;

        [Header("Smoothing & Comfort")]
        [Tooltip("Base filter responsiveness when head is stationary (higher = less smoothing).")]
        [Range(4f, 40f)]
        [SerializeField] private float restingSmoothingSpeed = 14f;

        [Tooltip("High-velocity responsiveness when turning head rapidly.")]
        [Range(20f, 90f)]
        [SerializeField] private float fastTurnSmoothingSpeed = 55f;

        [Tooltip("Angular speed (rad/s) where smoothing ramps up to fastTurnSmoothingSpeed.")]
        [SerializeField] private float fastTurnThresholdRadSec = 1.2f;

        [SerializeField] private bool autoRecenterOnFirstSample = true;

        [Header("Desktop Preview Locomotion (Editor Only)")]
        [SerializeField] private float desktopMoveSpeed = 1.8f;

        private IHeadTrackingSource _trackingSource;
        private Quaternion _yawRecenterOffset = Quaternion.identity;
        private Quaternion _rawOrientation = Quaternion.identity;
        private Quaternion _filteredOrientation = Quaternion.identity;
        private Vector3 _angularVelocityRadSec;
        private bool _hasReceivedFirstSample;
        private float _recenterCooldown;

        public event Action OnRecentered;

        public string ActiveSourceName => _trackingSource != null ? _trackingSource.SourceName : "None";
        public bool IsTracking => _trackingSource != null && _trackingSource.IsTracking;
        public Quaternion HeadWorldRotation => stereoRig != null && stereoRig.HeadPivot != null
            ? stereoRig.HeadPivot.rotation
            : _filteredOrientation;
        public Vector3 AngularVelocityRadSec => _angularVelocityRadSec;
        public Vector3 SignedEulerTelemetry => GyroCoordinateConverter.GetSignedEulerTelemetry(_filteredOrientation);

        public void Initialize(VRStereoRig rig)
        {
            stereoRig = rig;
            InitializeTrackingSource();
        }

        private void Start()
        {
            if (stereoRig == null)
            {
                stereoRig = FindFirstObjectByType<VRStereoRig>();
            }

            if (_trackingSource == null)
            {
                InitializeTrackingSource();
            }
        }

        private void OnDestroy()
        {
            _trackingSource?.Shutdown();
        }

        private void Update()
        {
            if (_trackingSource == null || stereoRig == null || stereoRig.HeadPivot == null)
            {
                return;
            }

            float dt = Time.unscaledDeltaTime;
            if (_recenterCooldown > 0f)
            {
                _recenterCooldown -= dt;
            }

            HandleRecenterShortcuts();

            if (_trackingSource.TrySampleOrientation(dt, out Quaternion sampledRotation, out Vector3 angularVelocity))
            {
                _rawOrientation = sampledRotation;
                _angularVelocityRadSec = angularVelocity;

                if (!_hasReceivedFirstSample)
                {
                    _hasReceivedFirstSample = true;
                    if (autoRecenterOnFirstSample && Application.isMobilePlatform)
                    {
                        _yawRecenterOffset = GyroCoordinateConverter.ComputeYawRecenterOffset(_rawOrientation);
                    }

                    _filteredOrientation = _yawRecenterOffset * _rawOrientation;
                }
                else
                {
                    Quaternion targetOrientation = _yawRecenterOffset * _rawOrientation;
                    float speedFactor = Mathf.Clamp01(angularVelocity.magnitude / Mathf.Max(0.1f, fastTurnThresholdRadSec));
                    float smoothingRate = Mathf.Lerp(restingSmoothingSpeed, fastTurnSmoothingSpeed, speedFactor);
                    float alpha = 1f - Mathf.Exp(-smoothingRate * Mathf.Max(dt, 0.001f));
                    _filteredOrientation = Quaternion.Slerp(_filteredOrientation, targetOrientation, alpha);
                }

                ApplyHeadPose(_filteredOrientation);
            }

            HandleDesktopMovement(dt);
        }

        /// <summary>
        /// Aligns the user's current horizontal facing direction to room forward (+Z) without disturbing horizon pitch/roll.
        /// </summary>
        public void RecenterYaw()
        {
            if (_trackingSource is EditorMouseHeadSource editorSource)
            {
                editorSource.ResetAngles();
                _yawRecenterOffset = Quaternion.identity;
                _filteredOrientation = Quaternion.identity;
            }
            else
            {
                _yawRecenterOffset = GyroCoordinateConverter.ComputeYawRecenterOffset(_rawOrientation);
                _filteredOrientation = _yawRecenterOffset * _rawOrientation;
            }

            ApplyHeadPose(_filteredOrientation);

            if (stereoRig != null && stereoRig.CenterEyeAnchor != null)
            {
                ProceduralAudioLibrary.PlayAtPoint(VRSoundEffect.Recenter, stereoRig.CenterEyeAnchor.position, 0.55f);
            }

            OnRecentered?.Invoke();
        }

        private void InitializeTrackingSource()
        {
            _trackingSource?.Shutdown();
            _hasReceivedFirstSample = false;

            AndroidGyroTrackingSource androidGyro = new AndroidGyroTrackingSource();
            androidGyro.Initialize();

            if (androidGyro.IsAvailable)
            {
                _trackingSource = androidGyro;
            }
            else
            {
                androidGyro.Shutdown();
                EditorMouseHeadSource desktopSource = new EditorMouseHeadSource();
                desktopSource.Initialize();
                _trackingSource = desktopSource;
            }

            Debug.Log($"[MobileQuestVR] Head tracking initialized with source: {_trackingSource.SourceName}");
        }

        private void ApplyHeadPose(Quaternion headLocalRotation)
        {
            Transform headPivot = stereoRig.HeadPivot;
            headPivot.localRotation = headLocalRotation;

            VRHeadsetProfile profile = stereoRig.HeadsetProfile;
            if (profile != null && profile.enableNeckModel && stereoRig.CenterEyeAnchor != null)
            {
                // Biomechanical neck model: eyes sit slightly above and forward of the cervical pivot
                Vector3 localNeckToEyes = new Vector3(0f, profile.neckHeightOffset, profile.neckForwardOffset);
                Vector3 neutralOffset = new Vector3(0f, profile.neckHeightOffset, 0f);
                headPivot.localPosition = (headLocalRotation * localNeckToEyes) - neutralOffset;
                stereoRig.CenterEyeAnchor.localPosition = Vector3.zero;
            }
            else if (headPivot != null)
            {
                headPivot.localPosition = Vector3.zero;
            }
        }

        private void HandleRecenterShortcuts()
        {
            if (_recenterCooldown > 0f)
            {
                return;
            }

            Keyboard kb = Keyboard.current;
            if (kb != null && kb.rKey.wasPressedThisFrame)
            {
                _recenterCooldown = 0.4f;
                RecenterYaw();
                return;
            }

            // Three-finger tap on Android touchscreen triggers instant recenter
            Touchscreen touch = Touchscreen.current;
            if (touch != null)
            {
                int activeTouches = 0;
                for (int i = 0; i < touch.touches.Count; i++)
                {
                    if (touch.touches[i].press.isPressed)
                    {
                        activeTouches++;
                    }
                }

                if (activeTouches >= 3)
                {
                    _recenterCooldown = 0.8f;
                    RecenterYaw();
                }
            }
        }

        private void HandleDesktopMovement(float dt)
        {
            if (Application.isMobilePlatform || stereoRig == null || stereoRig.TrackingOrigin == null)
            {
                return;
            }

            Keyboard kb = Keyboard.current;
            if (kb == null)
            {
                return;
            }

            Vector2 moveInput = Vector2.zero;
            if (kb.wKey.isPressed) moveInput.y += 1f;
            if (kb.sKey.isPressed) moveInput.y -= 1f;
            if (kb.dKey.isPressed) moveInput.x += 1f;
            if (kb.aKey.isPressed) moveInput.x -= 1f;

            if (moveInput.sqrMagnitude < 0.001f)
            {
                return;
            }

            Vector3 forward = stereoRig.HeadPivot.forward;
            forward.y = 0f;
            forward = forward.sqrMagnitude > 0.001f ? forward.normalized : Vector3.forward;

            Vector3 right = stereoRig.HeadPivot.right;
            right.y = 0f;
            right = right.sqrMagnitude > 0.001f ? right.normalized : Vector3.right;

            Vector3 delta = (forward * moveInput.y + right * moveInput.x).normalized * (desktopMoveSpeed * dt);
            Vector3 nextPos = stereoRig.TrackingOrigin.localPosition + delta;

            // Keep player comfortably inside the 6m x 6m virtual room bounds
            nextPos.x = Mathf.Clamp(nextPos.x, -2.4f, 2.4f);
            nextPos.z = Mathf.Clamp(nextPos.z, -2.4f, 2.4f);
            stereoRig.TrackingOrigin.localPosition = nextPos;
        }
    }
}
