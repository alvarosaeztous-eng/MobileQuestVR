using UnityEngine;

namespace MobileQuestVR.Tracking
{
    /// <summary>
    /// Fallback complementary sensor fusion filter combining gyroscope angular velocity integration
    /// with gravity vector tilt correction for Android phones lacking a hardware rotation vector sensor.
    /// </summary>
    public class ComplementaryOrientationFilter
    {
        private readonly float _gravityCorrectionGain;
        private Quaternion _orientation = Quaternion.identity;
        private bool _initialized;

        public Quaternion Orientation => _orientation;

        public ComplementaryOrientationFilter(float gravityCorrectionGain = 0.03f)
        {
            _gravityCorrectionGain = Mathf.Clamp(gravityCorrectionGain, 0.001f, 0.25f);
        }

        public void Reset(Quaternion initialOrientation)
        {
            _orientation = Quaternion.Normalize(initialOrientation);
            _initialized = true;
        }

        /// <summary>
        /// Integrates camera-local angular velocity (rad/s) over deltaTime and applies tilt drift correction
        /// using the measured camera-local gravity direction (pointing down in device/camera space).
        /// </summary>
        public Quaternion Update(Vector3 localAngularVelocityRadSec, Vector3 localGravityDown, float deltaTime)
        {
            if (deltaTime <= 0f || deltaTime > 0.25f)
            {
                return _orientation;
            }

            if (!_initialized)
            {
                if (localGravityDown.sqrMagnitude > 0.01f)
                {
                    Vector3 measuredDown = localGravityDown.normalized;
                    Quaternion alignTilt = Quaternion.FromToRotation(measuredDown, Vector3.down);
                    _orientation = Quaternion.Normalize(alignTilt);
                }
                else
                {
                    _orientation = Quaternion.identity;
                }

                _initialized = true;
            }

            // Step 1: Integrate gyroscope rate (exact exponential map via axis-angle)
            float omegaMag = localAngularVelocityRadSec.magnitude;
            if (omegaMag > 1e-5f)
            {
                float angleDeg = omegaMag * deltaTime * Mathf.Rad2Deg;
                Vector3 axis = localAngularVelocityRadSec / omegaMag;
                Quaternion deltaQ = Quaternion.AngleAxis(angleDeg, axis);
                _orientation = Quaternion.Normalize(_orientation * deltaQ);
            }

            // Step 2: Apply gentle accelerometer/gravity tilt correction to eliminate pitch/roll drift
            float gravMag = localGravityDown.magnitude;
            if (gravMag > 0.5f && gravMag < 1.5f)
            {
                Vector3 predictedLocalDown = Quaternion.Inverse(_orientation) * Vector3.down;
                Vector3 measuredLocalDown = localGravityDown / gravMag;
                Quaternion tiltError = Quaternion.FromToRotation(predictedLocalDown, measuredLocalDown);
                Quaternion correction = Quaternion.Slerp(Quaternion.identity, tiltError, _gravityCorrectionGain);
                _orientation = Quaternion.Normalize(_orientation * Quaternion.Inverse(correction));
            }

            return _orientation;
        }
    }
}
