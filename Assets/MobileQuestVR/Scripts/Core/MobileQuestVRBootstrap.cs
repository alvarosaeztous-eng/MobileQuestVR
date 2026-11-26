using MobileQuestVR.Environment;
using MobileQuestVR.HandTracking;
using MobileQuestVR.Interaction;
using MobileQuestVR.Rendering;
using MobileQuestVR.Tracking;
using MobileQuestVR.UI;
using UnityEngine;

namespace MobileQuestVR.Core
{
    /// <summary>
    /// Root scene bootstrapper for MobileQuestVR.
    /// Ensures the stereoscopic VR rig, gyroscope head tracker, 3D virtual room,
    /// MediaPipe hand tracking architecture, interaction controller, floating menu,
    /// and telemetry board are cleanly initialized both at runtime and when baked in Edit Mode.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public class MobileQuestVRBootstrap : MonoBehaviour
    {
        [Header("Headset Optics Profile (Optional — uses default if unassigned)")]
        [SerializeField] private VRHeadsetProfile headsetProfile;

        [Header("Startup Options")]
        [SerializeField] private bool startInStereoOnDesktopEditor = true;
        [SerializeField] private bool enableBarrelDistortionOnStartup = true;

        public AndroidPerformanceConfigurator PerformanceConfigurator { get; private set; }
        public VRStereoRig StereoRig { get; private set; }
        public VRHeadTracker HeadTracker { get; private set; }
        public VirtualRoomBuilder RoomBuilder { get; private set; }
        public VRHandTrackingManager HandTrackingManager { get; private set; }
        public VRHandVisualizer HandVisualizer { get; private set; }
        public VRInteractionController InteractionController { get; private set; }
        public VRFloatingMenu FloatingMenu { get; private set; }
        public VRTelemetryBoard TelemetryBoard { get; private set; }

        private bool _initialized;

        private void Awake()
        {
            InitializeAllSystems();
        }

        /// <summary>
        /// Builds or binds the complete MobileQuestVR hierarchy. Safe to invoke at runtime or from the Editor Scene Builder.
        /// </summary>
        public void InitializeAllSystems()
        {
            if (_initialized && Application.isPlaying)
            {
                return;
            }

            if (headsetProfile == null)
            {
                headsetProfile = VRHeadsetProfile.CreateRuntimeDefault();
            }

            // 1. Android / Mobile display & frame pacing configuration
            PerformanceConfigurator = GetOrAddChildComponent<AndroidPerformanceConfigurator>("AndroidPerformance");
            if (Application.isPlaying)
            {
                PerformanceConfigurator.ApplySettings();
            }

            // 2. Stereoscopic VR Camera Rig
            StereoRig = GetOrAddChildComponent<VRStereoRig>("VRStereoRig");
            StereoRig.EnsureInitialized(headsetProfile);
            bool enableStereo = Application.isMobilePlatform || startInStereoOnDesktopEditor;
            StereoRig.SetStereoEnabled(enableStereo);
            StereoRig.SetBarrelDistortionEnabled(enableBarrelDistortionOnStartup && enableStereo);

            // 3. 3D Virtual Room & Interactive Objects
            RoomBuilder = GetOrAddChildComponent<VirtualRoomBuilder>("VirtualRoom");
            RoomBuilder.BuildOrBindRoom(StereoRig);

            // 4. Gyroscope / IMU Head Tracking
            HeadTracker = GetOrAddChildComponent<VRHeadTracker>("VRHeadTracker");
            if (Application.isPlaying)
            {
                HeadTracker.Initialize(StereoRig);
            }

            // 5. MediaPipe Hand Tracking Architecture & 3D Hand Skeleton Visualizer
            HandTrackingManager = GetOrAddChildComponent<VRHandTrackingManager>("VRHandTracking");
            HandVisualizer = GetOrAddChildComponent<VRHandVisualizer>("VRHandVisualizer");
            if (Application.isPlaying)
            {
                HandTrackingManager.Initialize(StereoRig);
                HandVisualizer.Initialize(HandTrackingManager);
            }

            // 6. Multi-Modal Interaction System (Hand Pinch/Ray + Gaze/Dwell/Tap)
            InteractionController = GetOrAddChildComponent<VRInteractionController>("VRInteractionController");
            if (Application.isPlaying)
            {
                InteractionController.Initialize(StereoRig, HandTrackingManager);
            }

            // 7. World-Space Floating VR Control Menu
            FloatingMenu = GetOrAddChildComponent<VRFloatingMenu>("VRFloatingMenu");
            FloatingMenu.Initialize(StereoRig, HeadTracker, HandTrackingManager, RoomBuilder);

            // 8. Wall-Mounted Live Telemetry Display
            TelemetryBoard = GetOrAddChildComponent<VRTelemetryBoard>("VRTelemetryBoard");
            TelemetryBoard.Initialize(StereoRig, HeadTracker, HandTrackingManager, InteractionController, RoomBuilder.TelemetryMountPoint);

            _initialized = true;
            Debug.Log("[MobileQuestVR] All VR subsystems initialized successfully.");
        }

        private T GetOrAddChildComponent<T>(string childName) where T : Component
        {
            Transform child = transform.Find(childName);
            if (child == null)
            {
                GameObject go = new GameObject(childName);
                go.transform.SetParent(transform, false);
                child = go.transform;
            }

            T component = child.GetComponent<T>();
            if (component == null)
            {
                component = child.gameObject.AddComponent<T>();
            }

            return component;
        }
    }
}
