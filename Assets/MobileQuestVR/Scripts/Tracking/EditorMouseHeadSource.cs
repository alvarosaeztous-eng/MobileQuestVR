using UnityEngine;
using UnityEngine.InputSystem;

namespace MobileQuestVR.Tracking
{
    /// <summary>
    /// Desktop / Unity Editor head look input source (hold right mouse button to look around,
    /// Q/E for head roll, Arrow keys for fine rotation) so the full VR pipeline can be tested in Play Mode
    /// without an attached Android device.
    /// </summary>
    public class EditorMouseHeadSource : IHeadTrackingSource
    {
        private readonly float _mouseSensitivity;
        private readonly float _keyYawPitchSpeed;
        private readonly float _rollSpeed;

        private float _yawDegrees;
        private float _pitchDegrees;
        private float _rollDegrees;

        public string SourceName => "Desktop Mouse/Keyboard Head Preview";
        public bool IsAvailable => Mouse.current != null || Keyboard.current != null;
        public bool IsTracking { get; private set; }

        public EditorMouseHeadSource(float mouseSensitivity = 0.22f, float keyYawPitchSpeed = 75f, float rollSpeed = 60f)
        {
            _mouseSensitivity = mouseSensitivity;
            _keyYawPitchSpeed = keyYawPitchSpeed;
            _rollSpeed = rollSpeed;
        }

        public void Initialize()
        {
            _yawDegrees = 0f;
            _pitchDegrees = 0f;
            _rollDegrees = 0f;
            IsTracking = true;
        }

        public void Shutdown()
        {
            IsTracking = false;
        }

        public void ResetAngles()
        {
            _yawDegrees = 0f;
            _pitchDegrees = 0f;
            _rollDegrees = 0f;
        }

        public bool TrySampleOrientation(float deltaTime, out Quaternion unityOrientation, out Vector3 angularVelocityRadSec)
        {
            float prevYaw = _yawDegrees;
            float prevPitch = _pitchDegrees;
            float prevRoll = _rollDegrees;

            Mouse mouse = Mouse.current;
            if (mouse != null && (mouse.rightButton.isPressed || Cursor.lockState == CursorLockMode.Locked))
            {
                Vector2 delta = mouse.delta.ReadValue();
                _yawDegrees += delta.x * _mouseSensitivity;
                _pitchDegrees = Mathf.Clamp(_pitchDegrees - delta.y * _mouseSensitivity, -85f, 85f);
            }

            Keyboard kb = Keyboard.current;
            if (kb != null)
            {
                if (kb.leftArrowKey.isPressed)
                {
                    _yawDegrees -= _keyYawPitchSpeed * deltaTime;
                }
                if (kb.rightArrowKey.isPressed)
                {
                    _yawDegrees += _keyYawPitchSpeed * deltaTime;
                }
                if (kb.upArrowKey.isPressed)
                {
                    _pitchDegrees = Mathf.Clamp(_pitchDegrees - _keyYawPitchSpeed * deltaTime, -85f, 85f);
                }
                if (kb.downArrowKey.isPressed)
                {
                    _pitchDegrees = Mathf.Clamp(_pitchDegrees + _keyYawPitchSpeed * deltaTime, -85f, 85f);
                }

                if (kb.qKey.isPressed)
                {
                    _rollDegrees = Mathf.Clamp(_rollDegrees + _rollSpeed * deltaTime, -45f, 45f);
                }
                else if (kb.eKey.isPressed)
                {
                    _rollDegrees = Mathf.Clamp(_rollDegrees - _rollSpeed * deltaTime, -45f, 45f);
                }
                else
                {
                    _rollDegrees = Mathf.MoveTowards(_rollDegrees, 0f, _rollSpeed * 1.5f * deltaTime);
                }
            }

            unityOrientation = Quaternion.Euler(_pitchDegrees, _yawDegrees, _rollDegrees);

            float invDt = deltaTime > 1e-4f ? 1f / deltaTime : 0f;
            angularVelocityRadSec = new Vector3(
                (_pitchDegrees - prevPitch) * Mathf.Deg2Rad * invDt,
                (_yawDegrees - prevYaw) * Mathf.Deg2Rad * invDt,
                (_rollDegrees - prevRoll) * Mathf.Deg2Rad * invDt);

            return true;
        }
    }
}
