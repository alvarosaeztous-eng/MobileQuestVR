using System;
using UnityEngine;

namespace MobileQuestVR.HandTracking
{
    /// <summary>
    /// Real Android MediaPipe Hand Landmarker bridge over Unity JNI (AndroidJavaObject + AndroidJavaProxy).
    /// Connects directly to com.mobilequestvr.handtracking.MediaPipeHandBridge (CameraX + MediaPipe Tasks Vision)
    /// when packaged in the Android APK, and also exposes InjectPackedFrame / InjectExternalFrame for
    /// C#/C++ Unity MediaPipe plugins (such as homuler/MediaPipeUnityPlugin).
    /// </summary>
    public sealed class AndroidMediaPipeHandProvider : IHandTrackingProvider
    {
        public const string JavaBridgeClassName = "com.mobilequestvr.handtracking.MediaPipeHandBridge";
        public const string JavaCallbackInterfaceName = "com.mobilequestvr.handtracking.HandLandmarkCallback";
        public const int HeaderFloats = 2;
        public const int FloatsPerHand = 2 + (HandSkeletonTopology.LandmarkCount * 3) + (HandSkeletonTopology.LandmarkCount * 3); // 128

        private readonly object _frameLock = new object();
        private readonly RawHandTrackingFrame _pendingFrame = new RawHandTrackingFrame();
        private bool _hasUnreadFrame;

        private readonly CameraFrameSource _cameraSource;

#if UNITY_ANDROID && !UNITY_EDITOR
        private AndroidJavaObject _javaBridge;
        private AndroidLandmarkCallbackProxy _callbackProxy;
#endif

        public string ProviderName => "Android MediaPipe HandLandmarker (JNI)";
        public HandTrackingProviderStatus Status { get; private set; } = HandTrackingProviderStatus.Uninitialized;
        public string StatusDetail { get; private set; } = "Not initialized";
        public bool IsRunning => Status == HandTrackingProviderStatus.Running;

        public AndroidMediaPipeHandProvider(CameraFrameSource cameraSource = null)
        {
            _cameraSource = cameraSource;
        }

        public void Initialize()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (_cameraSource != null && !_cameraSource.HasCameraPermission)
            {
                Status = HandTrackingProviderStatus.AwaitingCameraPermission;
                StatusDetail = "Camera permission required for MediaPipe Hand Tracking";
                return;
            }

            try
            {
                using (AndroidJavaClass unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (AndroidJavaObject activity = unityPlayer.GetStatic<AndroidJavaObject>("currentActivity"))
                {
                    if (activity == null)
                    {
                        Status = HandTrackingProviderStatus.Error;
                        StatusDetail = "Unity Android currentActivity unavailable";
                        return;
                    }

                    _callbackProxy = new AndroidLandmarkCallbackProxy(this);
                    _javaBridge = new AndroidJavaObject(JavaBridgeClassName, activity, _callbackProxy);
                    Status = HandTrackingProviderStatus.Stopped;
                    StatusDetail = "MediaPipeHandBridge JNI loaded and ready";
                }
            }
            catch (Exception ex)
            {
                // Graceful state when the APK was built before installing the MediaPipe AAR/Gradle dependencies
                _javaBridge = null;
                _callbackProxy = null;
                Status = HandTrackingProviderStatus.ReadyAwaitingNativePlugin;
                StatusDetail = "Architecture ready — install MediaPipe Android plugin via MobileQuestVR > MediaPipe Setup";
                Debug.Log($"[MobileQuestVR] MediaPipe Java bridge not packaged in APK yet ({ex.Message}).");
            }
#else
            Status = HandTrackingProviderStatus.ReadyAwaitingNativePlugin;
            StatusDetail = "Android JNI bridge active on Android device builds (External injection supported)";
#endif
        }

        public void StartTracking()
        {
            if (Status == HandTrackingProviderStatus.Uninitialized || Status == HandTrackingProviderStatus.AwaitingCameraPermission)
            {
                Initialize();
            }

#if UNITY_ANDROID && !UNITY_EDITOR
            if (_javaBridge == null)
            {
                return;
            }

            try
            {
                bool started = _javaBridge.Call<bool>("startTracking", 2, 0.55f, 0.55f, 0.55f);
                if (started)
                {
                    Status = HandTrackingProviderStatus.Running;
                    StatusDetail = "MediaPipe HandLandmarker LIVE_STREAM active";
                }
                else
                {
                    Status = HandTrackingProviderStatus.Error;
                    StatusDetail = "MediaPipeHandBridge.startTracking returned false (check hand_landmarker.task in StreamingAssets/assets)";
                }
            }
            catch (Exception ex)
            {
                Status = HandTrackingProviderStatus.Error;
                StatusDetail = $"Failed to start MediaPipe bridge: {ex.Message}";
                Debug.LogError($"[MobileQuestVR] {StatusDetail}");
            }
#endif
        }

        public void StopTracking()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (_javaBridge != null)
            {
                try
                {
                    _javaBridge.Call("stopTracking");
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[MobileQuestVR] Error stopping MediaPipe bridge: {ex.Message}");
                }
            }
#endif
            if (Status == HandTrackingProviderStatus.Running)
            {
                Status = HandTrackingProviderStatus.Stopped;
                StatusDetail = "MediaPipe HandLandmarker paused";
            }
        }

        public void Dispose()
        {
            StopTracking();
#if UNITY_ANDROID && !UNITY_EDITOR
            if (_javaBridge != null)
            {
                try
                {
                    _javaBridge.Call("release");
                    _javaBridge.Dispose();
                }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[MobileQuestVR] Error releasing MediaPipe bridge: {ex.Message}");
                }
                _javaBridge = null;
            }
            _callbackProxy = null;
#endif
        }

        public bool TryGetLatestFrame(RawHandTrackingFrame targetFrame)
        {
            if (targetFrame == null)
            {
                return false;
            }

            lock (_frameLock)
            {
                if (!_hasUnreadFrame)
                {
                    return false;
                }

                targetFrame.CopyFrom(_pendingFrame);
                _hasUnreadFrame = false;
                return true;
            }
        }

        /// <summary>
        /// Thread-safe entry point invoked by the Android JNI callback OR external MediaPipe plugins
        /// to deliver a packed float[] frame: [handCount, hasWorldFlag, hand0(128 floats), hand1(128 floats)].
        /// </summary>
        public bool InjectPackedFrame(float[] packedBuffer, long timestampMs)
        {
            if (!TryDecodePackedBuffer(packedBuffer, timestampMs, _pendingFrame, _frameLock, out bool decoded))
            {
                return false;
            }

            if (decoded)
            {
                lock (_frameLock)
                {
                    _hasUnreadFrame = true;
                }

                if (Status != HandTrackingProviderStatus.Running)
                {
                    Status = HandTrackingProviderStatus.Running;
                    StatusDetail = "Receiving live MediaPipe hand landmarks";
                }
            }

            return decoded;
        }

        /// <summary>
        /// Pure decoder for the packed MediaPipe landmark buffer protocol. Exposed statically for unit testing.
        /// </summary>
        public static bool DecodePackedBuffer(float[] packedBuffer, long timestampMs, RawHandTrackingFrame destination)
        {
            if (packedBuffer == null || destination == null || packedBuffer.Length < HeaderFloats)
            {
                return false;
            }

            int handCount = Mathf.Clamp(Mathf.RoundToInt(packedBuffer[0]), 0, destination.Hands.Length);
            bool hasWorld = packedBuffer[1] > 0.5f;
            int requiredLength = HeaderFloats + handCount * FloatsPerHand;
            if (packedBuffer.Length < requiredLength)
            {
                return false;
            }

            destination.TimestampMs = timestampMs;
            destination.HandCount = handCount;

            for (int h = 0; h < handCount; h++)
            {
                int offset = HeaderFloats + h * FloatsPerHand;
                RawHandDetection hand = destination.Hands[h];

                int handednessCode = Mathf.RoundToInt(packedBuffer[offset]);
                hand.Handedness = handednessCode switch
                {
                    1 => Handedness.Left,
                    2 => Handedness.Right,
                    _ => Handedness.Unknown
                };
                hand.Confidence = Mathf.Clamp01(packedBuffer[offset + 1]);
                hand.HasWorldLandmarks = hasWorld;

                int normStart = offset + 2;
                int worldStart = normStart + HandSkeletonTopology.LandmarkCount * 3;

                for (int i = 0; i < HandSkeletonTopology.LandmarkCount; i++)
                {
                    int nIdx = normStart + i * 3;
                    hand.NormalizedLandmarks[i] = new Vector3(
                        packedBuffer[nIdx],
                        packedBuffer[nIdx + 1],
                        packedBuffer[nIdx + 2]);

                    int wIdx = worldStart + i * 3;
                    hand.WorldLandmarks[i] = new Vector3(
                        packedBuffer[wIdx],
                        packedBuffer[wIdx + 1],
                        packedBuffer[wIdx + 2]);
                }
            }

            return true;
        }

        private static bool TryDecodePackedBuffer(
            float[] packedBuffer,
            long timestampMs,
            RawHandTrackingFrame destination,
            object syncLock,
            out bool decoded)
        {
            lock (syncLock)
            {
                decoded = DecodePackedBuffer(packedBuffer, timestampMs, destination);
                return decoded;
            }
        }

        private void OnNativeError(string message)
        {
            Status = HandTrackingProviderStatus.Error;
            StatusDetail = message;
            Debug.LogError($"[MobileQuestVR] MediaPipe native error: {message}");
        }

#if UNITY_ANDROID && !UNITY_EDITOR
        private sealed class AndroidLandmarkCallbackProxy : AndroidJavaProxy
        {
            private readonly AndroidMediaPipeHandProvider _owner;

            public AndroidLandmarkCallbackProxy(AndroidMediaPipeHandProvider owner)
                : base(JavaCallbackInterfaceName)
            {
                _owner = owner;
            }

            // Called from Android MediaPipe LIVE_STREAM executor thread
            public void onLandmarksDetected(float[] packedLandmarks, long timestampMs)
            {
                _owner.InjectPackedFrame(packedLandmarks, timestampMs);
            }

            public void onError(string errorMessage)
            {
                _owner.OnNativeError(errorMessage);
            }
        }
#endif
    }
}
