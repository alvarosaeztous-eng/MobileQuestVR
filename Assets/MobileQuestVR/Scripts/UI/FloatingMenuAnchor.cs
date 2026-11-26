using UnityEngine;

namespace MobileQuestVR.UI
{
    /// <summary>
    /// Ergonomic lazy-follow / pinnable world-space anchor for floating VR menus.
    /// Keeps the menu completely steady while you look at its buttons, then smoothly glides back
    /// into view when you turn far away or summon the menu.
    /// </summary>
    public class FloatingMenuAnchor : MonoBehaviour
    {
        [Header("Anchor Placement")]
        [SerializeField] private Transform headReference;
        [SerializeField] private float followDistance = 1.68f;
        [SerializeField] private float verticalOffset = -0.10f;
        [SerializeField] private float horizontalYawOffsetDegrees = 22f;
        [SerializeField] private float deadzoneAngleDegrees = 38f;
        [SerializeField] private float positionLerpSpeed = 5.5f;
        [SerializeField] private float rotationLerpSpeed = 6.5f;
        [SerializeField] private bool isPinned = true;

        private Vector3 _targetPosition;
        private Quaternion _targetRotation;
        private bool _initialized;

        public bool IsPinned
        {
            get => isPinned;
            set => isPinned = value;
        }

        public void Initialize(Transform centerEyeAnchor, bool startPinned = true)
        {
            headReference = centerEyeAnchor;
            isPinned = startPinned;
            SnapToComfortablePose(horizontalYawOffsetDegrees);
        }

        public void TogglePinned()
        {
            isPinned = !isPinned;
            if (!isPinned)
            {
                ComputeDesiredPose(0f, out _targetPosition, out _targetRotation);
            }
        }

        public void SnapInFrontOfHead()
        {
            SnapToComfortablePose(0f);
        }

        public void SnapToComfortablePose(float yawOffsetDeg)
        {
            if (headReference == null)
            {
                return;
            }

            ComputeDesiredPose(yawOffsetDeg, out _targetPosition, out _targetRotation);
            transform.SetPositionAndRotation(_targetPosition, _targetRotation);
            _initialized = true;
        }

        private void LateUpdate()
        {
            if (headReference == null)
            {
                return;
            }

            if (!_initialized)
            {
                SnapToComfortablePose(horizontalYawOffsetDegrees);
                return;
            }

            if (isPinned)
            {
                return;
            }

            Vector3 flatForward = GetHorizontalForward(headReference);
            Vector3 toMenu = transform.position - headReference.position;
            toMenu.y = 0f;

            float angle = toMenu.sqrMagnitude > 0.01f
                ? Vector3.Angle(flatForward, toMenu.normalized)
                : 180f;

            if (angle > deadzoneAngleDegrees)
            {
                ComputeDesiredPose(0f, out _targetPosition, out _targetRotation);
            }

            float dt = Time.unscaledDeltaTime;
            transform.position = Vector3.Lerp(transform.position, _targetPosition, 1f - Mathf.Exp(-positionLerpSpeed * dt));
            transform.rotation = Quaternion.Slerp(transform.rotation, _targetRotation, 1f - Mathf.Exp(-rotationLerpSpeed * dt));
        }

        private void ComputeDesiredPose(float yawOffsetDeg, out Vector3 position, out Quaternion rotation)
        {
            Vector3 flatForward = GetHorizontalForward(headReference);
            Vector3 rotatedDir = Quaternion.AngleAxis(yawOffsetDeg, Vector3.up) * flatForward;

            position = headReference.position + rotatedDir * followDistance + Vector3.up * verticalOffset;
            position.y = Mathf.Clamp(position.y, 1.08f, 2.25f);

            Vector3 lookDir = position - headReference.position;
            lookDir.y *= 0.25f; // Gentle tilt toward eyes without extreme pitch distortion
            rotation = lookDir.sqrMagnitude > 0.001f
                ? Quaternion.LookRotation(lookDir.normalized, Vector3.up)
                : Quaternion.identity;
        }

        private static Vector3 GetHorizontalForward(Transform reference)
        {
            Vector3 f = reference.forward;
            f.y = 0f;
            return f.sqrMagnitude > 0.001f ? f.normalized : Vector3.forward;
        }
    }
}
