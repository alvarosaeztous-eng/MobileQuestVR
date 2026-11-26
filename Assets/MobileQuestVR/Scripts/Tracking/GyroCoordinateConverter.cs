using UnityEngine;

namespace MobileQuestVR.Tracking
{
    /// <summary>
    /// Mathematically verified coordinate transformations between Android right-handed hardware
    /// sensor frames (ENU world / portrait device axes) and Unity's left-handed Y-up frame.
    /// </summary>
    public static class GyroCoordinateConverter
    {
        private static readonly Quaternion WorldEnuToUnity = Quaternion.AngleAxis(90f, Vector3.right);
        private static readonly Quaternion LocalLandscapeLeftFix = Quaternion.AngleAxis(-90f, Vector3.forward);
        private static readonly Quaternion LocalLandscapeRightFix = Quaternion.AngleAxis(90f, Vector3.forward);
        private static readonly Quaternion LocalPortraitUpsideDownFix = Quaternion.AngleAxis(180f, Vector3.forward);

        /// <summary>
        /// Converts a right-handed Android rotation vector quaternion (from AttitudeSensor or Input.gyro.attitude)
        /// into a left-handed Unity camera orientation matching the specified screen orientation.
        /// </summary>
        public static Quaternion AndroidAttitudeToUnity(Quaternion androidAttitude, ScreenOrientation orientation)
        {
            if (IsNearZero(androidAttitude))
            {
                return Quaternion.identity;
            }

            Quaternion normalized = Quaternion.Normalize(androidAttitude);

            // Convert right-handed quaternion to left-handed space by mirroring Z
            Quaternion leftHanded = new Quaternion(normalized.x, normalized.y, -normalized.z, -normalized.w);

            // Align Android ENU world frame (X=East, Y=North, Z=Up) to Unity (X=Right, Y=Up, Z=Forward)
            Quaternion worldAligned = WorldEnuToUnity * leftHanded;

            // Remap device physical frame to match how the phone is mounted in the VR headset
            Quaternion localOrientationFix = GetScreenOrientationFix(orientation);
            return Quaternion.Normalize(worldAligned * localOrientationFix);
        }

        /// <summary>
        /// Remaps Android right-handed hardware gyroscope angular velocity (rad/s) into Unity camera-local axes.
        /// </summary>
        public static Vector3 AndroidGyroRateToUnity(Vector3 androidRateRadSec, ScreenOrientation orientation)
        {
            // Right-handed to left-handed rate flip around X/Y vs Z
            Vector3 portraitUnityRate = new Vector3(-androidRateRadSec.x, -androidRateRadSec.y, androidRateRadSec.z);

            return orientation switch
            {
                ScreenOrientation.LandscapeLeft => new Vector3(portraitUnityRate.y, -portraitUnityRate.x, portraitUnityRate.z),
                ScreenOrientation.LandscapeRight => new Vector3(-portraitUnityRate.y, portraitUnityRate.x, portraitUnityRate.z),
                ScreenOrientation.PortraitUpsideDown => new Vector3(-portraitUnityRate.x, -portraitUnityRate.y, portraitUnityRate.z),
                _ => portraitUnityRate
            };
        }

        /// <summary>
        /// Computes a pure world-Y yaw correction quaternion so that left-multiplying
        /// (yawOffset * currentHeadRotation) points the user's gaze toward +Z while preserving horizon pitch &amp; roll.
        /// Safely falls back to the head's Up vector when looking straight up or straight down.
        /// </summary>
        public static Quaternion ComputeYawRecenterOffset(Quaternion currentHeadRotation)
        {
            Vector3 forward = currentHeadRotation * Vector3.forward;
            Vector3 flatForward = new Vector3(forward.x, 0f, forward.z);

            if (flatForward.sqrMagnitude < 0.0025f)
            {
                // Gimbal pole safeguard: if user is looking nearly straight up/down, derive heading from up vector
                Vector3 up = currentHeadRotation * Vector3.up;
                flatForward = forward.y > 0f
                    ? new Vector3(-up.x, 0f, -up.z)
                    : new Vector3(up.x, 0f, up.z);
            }

            if (flatForward.sqrMagnitude < 0.0001f)
            {
                return Quaternion.identity;
            }

            float yawDegrees = Mathf.Atan2(flatForward.x, flatForward.z) * Mathf.Rad2Deg;
            return Quaternion.AngleAxis(-yawDegrees, Vector3.up);
        }

        /// <summary>
        /// Extracts signed yaw, pitch, and roll Euler telemetry in degrees in [-180, 180].
        /// </summary>
        public static Vector3 GetSignedEulerTelemetry(Quaternion rotation)
        {
            Vector3 euler = rotation.eulerAngles;
            return new Vector3(
                NormalizeSignedAngle(euler.x),
                NormalizeSignedAngle(euler.y),
                NormalizeSignedAngle(euler.z));
        }

        public static float NormalizeSignedAngle(float angleDegrees)
        {
            float wrapped = Mathf.Repeat(angleDegrees + 180f, 360f) - 180f;
            return wrapped;
        }

        private static Quaternion GetScreenOrientationFix(ScreenOrientation orientation)
        {
            return orientation switch
            {
                ScreenOrientation.LandscapeLeft => LocalLandscapeLeftFix,
                ScreenOrientation.LandscapeRight => LocalLandscapeRightFix,
                ScreenOrientation.PortraitUpsideDown => LocalPortraitUpsideDownFix,
                _ => Quaternion.identity
            };
        }

        private static bool IsNearZero(Quaternion q)
        {
            float sqrMag = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
            return sqrMag < 1e-6f;
        }
    }
}
