using MobileQuestVR.Core;
using UnityEngine;

namespace MobileQuestVR.Interaction
{
    /// <summary>
    /// Physics-enabled grabbable VR object supporting both Hand Pinch holding and Gaze toggle-carry,
    /// with smooth follow tracking, velocity-based throwing (Unity 6 Rigidbody.linearVelocity), and home-pose reset.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public class VRGrabbableObject : VRInteractableBase
    {
        [Header("Grab Physics")]
        [SerializeField] private float followPositionSpeed = 18f;
        [SerializeField] private float followRotationSpeed = 14f;
        [SerializeField] private float throwVelocityMultiplier = 1.15f;
        [SerializeField] private float maxThrowSpeed = 8.5f;

        private Rigidbody _rigidbody;
        private Transform _grabAnchor;
        private Vector3 _homePosition;
        private Quaternion _homeRotation;
        private Vector3 _lastAnchorPos;
        private Quaternion _lastAnchorRot;
        private Vector3 _smoothedVelocity;
        private Vector3 _smoothedAngularVelocity;
        private bool _isGrabbed;
        private bool _wasKinematic;
        private bool _usedGravity;

        public override bool CanGrab => true;
        public bool IsGrabbed => _isGrabbed;

        protected override void Awake()
        {
            base.Awake();
            _rigidbody = GetComponent<Rigidbody>();
            _homePosition = transform.position;
            _homeRotation = transform.rotation;
        }

        public void RecordHomePose()
        {
            _homePosition = transform.position;
            _homeRotation = transform.rotation;
        }

        public void ResetToHomePose()
        {
            if (_isGrabbed)
            {
                EndGrab(applyThrowVelocity: false);
            }

            if (_rigidbody == null)
            {
                _rigidbody = GetComponent<Rigidbody>();
            }

            if (_rigidbody != null)
            {
                _rigidbody.isKinematic = false;
                _rigidbody.useGravity = true;
                _rigidbody.linearVelocity = Vector3.zero;
                _rigidbody.angularVelocity = Vector3.zero;
            }

            transform.SetPositionAndRotation(_homePosition, _homeRotation);
            ProceduralAudioLibrary.PlayAtPoint(VRSoundEffect.Release, _homePosition, 0.35f);
        }

        public override void OnSelectStart(VRInteractorContext context)
        {
            if (_isGrabbed)
            {
                EndGrab(applyThrowVelocity: true);
                return;
            }

            BeginGrab(context.AttachPoint);
        }

        public override void OnSelectEnd(VRInteractorContext context)
        {
            if (_isGrabbed && context.Mode != VRInteractorMode.Gaze)
            {
                EndGrab(applyThrowVelocity: true);
            }
        }

        public override void OnActivate(VRInteractorContext context)
        {
            // Dwell activation toggles holding the object when using gaze-only mobile headsets
            if (_isGrabbed)
            {
                EndGrab(applyThrowVelocity: true);
            }
            else
            {
                BeginGrab(context.AttachPoint);
            }
        }

        private void BeginGrab(Transform attachPoint)
        {
            if (attachPoint == null)
            {
                return;
            }

            if (_rigidbody == null)
            {
                _rigidbody = GetComponent<Rigidbody>();
            }

            _grabAnchor = attachPoint;
            _isGrabbed = true;
            _wasKinematic = _rigidbody.isKinematic;
            _usedGravity = _rigidbody.useGravity;

            _rigidbody.isKinematic = true;
            _rigidbody.useGravity = false;
            _rigidbody.linearVelocity = Vector3.zero;
            _rigidbody.angularVelocity = Vector3.zero;

            _lastAnchorPos = _grabAnchor.position;
            _lastAnchorRot = _grabAnchor.rotation;
            _smoothedVelocity = Vector3.zero;
            _smoothedAngularVelocity = Vector3.zero;

            ProceduralAudioLibrary.PlayAtPoint(VRSoundEffect.Grab, transform.position, 0.6f);
            onActivated?.Invoke();
        }

        public void EndGrab(bool applyThrowVelocity)
        {
            if (!_isGrabbed)
            {
                return;
            }

            _isGrabbed = false;
            _grabAnchor = null;

            if (_rigidbody != null)
            {
                _rigidbody.isKinematic = _wasKinematic;
                _rigidbody.useGravity = _usedGravity;

                if (applyThrowVelocity && !_rigidbody.isKinematic)
                {
                    Vector3 releaseVel = Vector3.ClampMagnitude(_smoothedVelocity * throwVelocityMultiplier, maxThrowSpeed);
                    _rigidbody.linearVelocity = releaseVel;
                    _rigidbody.angularVelocity = Vector3.ClampMagnitude(_smoothedAngularVelocity, 10f);
                }
            }

            ProceduralAudioLibrary.PlayAtPoint(VRSoundEffect.Release, transform.position, 0.55f);
        }

        protected override void Update()
        {
            base.Update();

            if (!_isGrabbed || _grabAnchor == null)
            {
                return;
            }

            float dt = Mathf.Max(Time.unscaledDeltaTime, 0.001f);
            Vector3 targetPos = _grabAnchor.position;
            Quaternion targetRot = _grabAnchor.rotation;

            float posAlpha = 1f - Mathf.Exp(-followPositionSpeed * dt);
            float rotAlpha = 1f - Mathf.Exp(-followRotationSpeed * dt);
            transform.position = Vector3.Lerp(transform.position, targetPos, posAlpha);
            transform.rotation = Quaternion.Slerp(transform.rotation, targetRot, rotAlpha);

            // Estimate linear and angular velocity for realistic physical tossing on release
            Vector3 instantVel = (targetPos - _lastAnchorPos) / dt;
            _smoothedVelocity = Vector3.Lerp(_smoothedVelocity, instantVel, 0.35f);

            Quaternion deltaRot = targetRot * Quaternion.Inverse(_lastAnchorRot);
            deltaRot.ToAngleAxis(out float angleDeg, out Vector3 axis);
            if (angleDeg > 180f)
            {
                angleDeg -= 360f;
            }

            if (!float.IsNaN(axis.x) && axis.sqrMagnitude > 0.001f)
            {
                Vector3 instantAngVel = axis.normalized * (angleDeg * Mathf.Deg2Rad / dt);
                _smoothedAngularVelocity = Vector3.Lerp(_smoothedAngularVelocity, instantAngVel, 0.3f);
            }

            _lastAnchorPos = targetPos;
            _lastAnchorRot = targetRot;
        }
    }
}
