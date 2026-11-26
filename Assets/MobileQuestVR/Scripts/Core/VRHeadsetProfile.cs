using UnityEngine;

namespace MobileQuestVR.Core
{
    /// <summary>
    /// Optical and ergonomic calibration profile for a mobile VR headset (e.g., Cardboard v2,
    /// generic 6.1"-6.7" Android VR viewer, or custom optics).
    /// </summary>
    [CreateAssetMenu(fileName = "DefaultVRHeadsetProfile", menuName = "MobileQuestVR/VR Headset Profile")]
    public class VRHeadsetProfile : ScriptableObject
    {
        [Header("Optics & Stereo Geometry")]
        [Tooltip("Interpupillary distance in meters (typical adult range: 0.056m - 0.074m).")]
        [Range(0.050f, 0.080f)]
        public float interpupillaryDistance = 0.064f;

        [Tooltip("Vertical field of view per eye in degrees.")]
        [Range(60f, 110f)]
        public float verticalFov = 86f;

        [Tooltip("Near clipping plane in meters.")]
        [Range(0.01f, 0.2f)]
        public float nearClipPlane = 0.04f;

        [Tooltip("Far clipping plane in meters.")]
        [Range(20f, 500f)]
        public float farClipPlane = 120f;

        [Tooltip("Off-axis stereo convergence distance in meters (0 = parallel optical infinity).")]
        [Range(0f, 20f)]
        public float convergenceDistance = 0f;

        [Tooltip("Horizontal lens optical center offset in normalized eye coordinates (-0.1 to +0.1).")]
        [Range(-0.12f, 0.12f)]
        public float lensCenterOffsetX = 0.0f;

        [Header("Brown-Conrady Barrel Distortion")]
        public bool enableBarrelDistortion = true;

        [Range(-0.5f, 1.0f)]
        public float distortionK1 = 0.22f;

        [Range(-0.5f, 1.0f)]
        public float distortionK2 = 0.14f;

        [Range(0.6f, 1.4f)]
        public float zoomScale = 0.94f;

        [Range(0f, 0.03f)]
        public float chromaticAberration = 0.008f;

        [Range(0f, 1f)]
        public float vignetteStrength = 0.42f;

        [Range(0.4f, 1.2f)]
        public float vignetteRadius = 0.90f;

        [Header("Ergonomics & Biomechanical Neck Model")]
        [Tooltip("Standing eye height in meters above the virtual floor.")]
        [Range(1.0f, 2.1f)]
        public float eyeHeightMeters = 1.62f;

        [Tooltip("Applies a subtle anatomical neck pivot offset so head pitch/yaw feels natural in 3DoF.")]
        public bool enableNeckModel = true;

        [Tooltip("Vertical distance from neck pivot to eye line in meters.")]
        [Range(0f, 0.15f)]
        public float neckHeightOffset = 0.075f;

        [Tooltip("Forward distance from neck pivot to eye plane in meters.")]
        [Range(0f, 0.15f)]
        public float neckForwardOffset = 0.08f;

        /// <summary>
        /// Creates an in-memory default headset profile tuned for modern 6.2"-6.7" Android phones.
        /// </summary>
        public static VRHeadsetProfile CreateRuntimeDefault()
        {
            VRHeadsetProfile profile = CreateInstance<VRHeadsetProfile>();
            profile.name = "RuntimeDefaultHeadsetProfile";
            return profile;
        }
    }
}
