using UnityEngine;
using UnityEngine.InputSystem;
using InputSystemGyro = UnityEngine.InputSystem.Gyroscope;

namespace MobileQuestVR.Tracking
{
    /// <summary>
    /// Real Android gyroscope/IMU head tracking provider supporting three automatic hardware tiers:
    /// 1) Unity 6 Input System AttitudeSensor (Android TYPE_ROTATION_VECTOR),
    /// 2) UnityEngine.Input.gyro (legacy Android sensor bridge),
    /// 3) Raw Gyroscope + Gravity/Accelerometer fused via ComplementaryOrientationFilter.
    /// </summary>
    public class AndroidGyroTrackingSource : IHeadTrackingSource
    {
        private enum ActiveBackend
        {
            None,
            InputSystemAttitude,
            LegacyInputGyro,
            RawGyroComplementary
        }

        private readonly ComplementaryOrientationFilter _complementaryFilter = new ComplementaryOrientationFilter(0.035f);
        private ActiveBackend _backend = ActiveBackend.None;
        private Quaternion _lastValidOrientation = Quaternion.identity;

        public string SourceName => _backend switch
        {
            ActiveBackend.InputSystemAttitude => "Android AttitudeSensor (InputSystem)",
            ActiveBackend.LegacyInputGyro => "Android Gyroscope (Input.gyro)",
            ActiveBackend.RawGyroComplementary => "Android Raw Gyro + Gravity Fusion",
            _ => "Android IMU (Unavailable)"
        };

        public bool IsAvailable => _backend != ActiveBackend.None;
        public bool IsTracking { get; private set; }

        public void Initialize()
        {
            _backend = ActiveBackend.None;
            IsTracking = false;

            // Tier 1: Unity 6 Input System AttitudeSensor (hardware-fused rotation vector)
            if (AttitudeSensor.current != null)
            {
                InputSystem.EnableDevice(AttitudeSensor.current);
                if (InputSystemGyro.current != null)
                {
                    InputSystem.EnableDevice(InputSystemGyro.current);
                }

                if (AttitudeSensor.current.enabled)
                {
                    _backend = ActiveBackend.InputSystemAttitude;
                    IsTracking = true;
                    return;
                }
            }

            // Tier 2: Unity Legacy Gyroscope API (also reads Android TYPE_ROTATION_VECTOR)
            if (SystemInfo.supportsGyroscope)
            {
                Input.gyro.enabled = true;
                Input.gyro.updateInterval = 1f / 100f;
                if (Input.gyro.enabled)
                {
                    _backend = ActiveBackend.LegacyInputGyro;
                    IsTracking = true;
                    return;
                }
            }

            // Tier 3: Raw Gyroscope + GravitySensor/Accelerometer complementary fusion
            if (InputSystemGyro.current != null)
            {
                InputSystem.EnableDevice(InputSystemGyro.current);
                if (GravitySensor.current != null)
                {
                    InputSystem.EnableDevice(GravitySensor.current);
                }
                else if (Accelerometer.current != null)
                {
                    InputSystem.EnableDevice(Accelerometer.current);
                }

                if (InputSystemGyro.current.enabled)
                {
                    _backend = ActiveBackend.RawGyroComplementary;
                    IsTracking = true;
                }
            }
        }

        public void Shutdown()
        {
            IsTracking = false;

            if (AttitudeSensor.current != null && AttitudeSensor.current.enabled)
            {
                InputSystem.DisableDevice(AttitudeSensor.current);
            }

            if (InputSystemGyro.current != null && InputSystemGyro.current.enabled)
            {
                InputSystem.DisableDevice(InputSystemGyro.current);
            }

            if (SystemInfo.supportsGyroscope && Input.gyro.enabled)
            {
                Input.gyro.enabled = false;
            }
        }

        public bool TrySampleOrientation(float deltaTime, out Quaternion unityOrientation, out Vector3 angularVelocityRadSec)
        {
            ScreenOrientation orientation = ResolveEffectiveOrientation();

            switch (_backend)
            {
                case ActiveBackend.InputSystemAttitude:
                {
                    if (AttitudeSensor.current == null || !AttitudeSensor.current.enabled)
                    {
                        break;
                    }

                    Quaternion rawAttitude = AttitudeSensor.current.attitude.ReadValue();
                    Vector3 rawRate = InputSystemGyro.current != null && InputSystemGyro.current.enabled
                        ? InputSystemGyro.current.angularVelocity.ReadValue()
                        : Vector3.zero;

                    if (IsValidQuaternion(rawAttitude))
                    {
                        _lastValidOrientation = GyroCoordinateConverter.AndroidAttitudeToUnity(rawAttitude, orientation);
                        unityOrientation = _lastValidOrientation;
                        angularVelocityRadSec = GyroCoordinateConverter.AndroidGyroRateToUnity(rawRate, orientation);
                        return true;
                    }
                    break;
                }

                case ActiveBackend.LegacyInputGyro:
                {
                    if (!Input.gyro.enabled)
                    {
                        break;
                    }

                    Quaternion rawAttitude = Input.gyro.attitude;
                    Vector3 rawRate = Input.gyro.rotationRateUnbiased;

                    if (IsValidQuaternion(rawAttitude))
                    {
                        _lastValidOrientation = GyroCoordinateConverter.AndroidAttitudeToUnity(rawAttitude, orientation);
                        unityOrientation = _lastValidOrientation;
                        angularVelocityRadSec = GyroCoordinateConverter.AndroidGyroRateToUnity(rawRate, orientation);
                        return true;
                    }
                    break;
                }

                case ActiveBackend.RawGyroComplementary:
                {
                    if (InputSystemGyro.current == null || !InputSystemGyro.current.enabled)
                    {
                        break;
                    }

                    Vector3 rawRate = InputSystemGyro.current.angularVelocity.ReadValue();
                    Vector3 unityRate = GyroCoordinateConverter.AndroidGyroRateToUnity(rawRate, orientation);

                    Vector3 rawGravity = Vector3.down;
                    if (GravitySensor.current != null && GravitySensor.current.enabled)
                    {
                        rawGravity = GravitySensor.current.gravity.ReadValue();
                    }
                    else if (Accelerometer.current != null && Accelerometer.current.enabled)
                    {
                        rawGravity = Accelerometer.current.acceleration.ReadValue();
                    }

                    Vector3 unityGravity = GyroCoordinateConverter.AndroidGyroRateToUnity(rawGravity, orientation);
                    _lastValidOrientation = _complementaryFilter.Update(unityRate, unityGravity, deltaTime);
                    unityOrientation = _lastValidOrientation;
                    angularVelocityRadSec = unityRate;
                    return true;
                }
            }

            unityOrientation = _lastValidOrientation;
            angularVelocityRadSec = Vector3.zero;
            return false;
        }

        private static ScreenOrientation ResolveEffectiveOrientation()
        {
            ScreenOrientation current = Screen.orientation;
            if (current == ScreenOrientation.LandscapeLeft ||
                current == ScreenOrientation.LandscapeRight ||
                current == ScreenOrientation.Portrait ||
                current == ScreenOrientation.PortraitUpsideDown)
            {
                return current;
            }

            return Screen.width >= Screen.height ? ScreenOrientation.LandscapeLeft : ScreenOrientation.Portrait;
        }

        private static bool IsValidQuaternion(Quaternion q)
        {
            float sqrMag = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
            return sqrMag > 0.01f && !float.IsNaN(sqrMag) && !float.IsInfinity(sqrMag);
        }
    }
}
