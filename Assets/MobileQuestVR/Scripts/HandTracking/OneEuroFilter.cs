using UnityEngine;

namespace MobileQuestVR.HandTracking
{
    /// <summary>
    /// Casiez, Roussel &amp; Vogel (2012) One-Euro adaptive low-pass filter.
    /// Provides strong jitter suppression when hands are still while scaling up cutoff frequency
    /// dynamically during fast hand movement to eliminate perceptible VR lag.
    /// </summary>
    public sealed class OneEuroFilterFloat
    {
        private readonly float _minCutoff;
        private readonly float _beta;
        private readonly float _dCutoff;

        private bool _initialized;
        private float _prevValue;
        private float _prevDerivative;

        public OneEuroFilterFloat(float minCutoff = 1.6f, float beta = 0.04f, float dCutoff = 1.0f)
        {
            _minCutoff = Mathf.Max(0.01f, minCutoff);
            _beta = Mathf.Max(0f, beta);
            _dCutoff = Mathf.Max(0.01f, dCutoff);
        }

        public void Reset()
        {
            _initialized = false;
            _prevValue = 0f;
            _prevDerivative = 0f;
        }

        public float Filter(float value, float deltaTime)
        {
            if (!_initialized || deltaTime <= 1e-5f)
            {
                _initialized = true;
                _prevValue = value;
                _prevDerivative = 0f;
                return value;
            }

            float rawDerivative = (value - _prevValue) / deltaTime;
            float alphaD = ComputeAlpha(_dCutoff, deltaTime);
            float filteredDerivative = Mathf.Lerp(_prevDerivative, rawDerivative, alphaD);

            float adaptiveCutoff = _minCutoff + _beta * Mathf.Abs(filteredDerivative);
            float alpha = ComputeAlpha(adaptiveCutoff, deltaTime);
            float filteredValue = Mathf.Lerp(_prevValue, value, alpha);

            _prevValue = filteredValue;
            _prevDerivative = filteredDerivative;
            return filteredValue;
        }

        private static float ComputeAlpha(float cutoffHz, float dt)
        {
            float tau = 1f / (2f * Mathf.PI * cutoffHz);
            return 1f / (1f + tau / dt);
        }
    }

    /// <summary>
    /// 3D vector wrapper around three synchronized OneEuroFilterFloat channels for VR landmark filtering.
    /// </summary>
    public sealed class OneEuroFilterVector3
    {
        private readonly OneEuroFilterFloat _x;
        private readonly OneEuroFilterFloat _y;
        private readonly OneEuroFilterFloat _z;

        public OneEuroFilterVector3(float minCutoff = 1.8f, float beta = 0.08f, float dCutoff = 1.0f)
        {
            _x = new OneEuroFilterFloat(minCutoff, beta, dCutoff);
            _y = new OneEuroFilterFloat(minCutoff, beta, dCutoff);
            _z = new OneEuroFilterFloat(minCutoff, beta, dCutoff);
        }

        public void Reset()
        {
            _x.Reset();
            _y.Reset();
            _z.Reset();
        }

        public Vector3 Filter(Vector3 value, float deltaTime)
        {
            return new Vector3(
                _x.Filter(value.x, deltaTime),
                _y.Filter(value.y, deltaTime),
                _z.Filter(value.z, deltaTime));
        }
    }
}
