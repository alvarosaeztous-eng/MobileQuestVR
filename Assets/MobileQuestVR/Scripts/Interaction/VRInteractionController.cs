using MobileQuestVR.Core;
using MobileQuestVR.HandTracking;
using MobileQuestVR.Rendering;
using UnityEngine;
using UnityEngine.InputSystem;

namespace MobileQuestVR.Interaction
{
    /// <summary>
    /// Multi-modal VR Interaction Controller bridging:
    /// 1) MediaPipe Hand Tracking (direct near-field pinch grab + long-range hand pointer ray), and
    /// 2) Universal Mobile VR Gaze + Dwell + Screen-Tap/Click/Spacebar trigger.
    /// </summary>
    public class VRInteractionController : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private VRStereoRig stereoRig;
        [SerializeField] private VRHandTrackingManager handTrackingManager;
        [SerializeField] private VRGazeReticle reticle;

        [Header("Interaction Tuning")]
        [SerializeField] private float maxRayDistance = 10f;
        [SerializeField] private float gazeDwellSeconds = 1.15f;
        [SerializeField] private float directPinchGrabRadius = 0.09f;
        [SerializeField] private float defaultHoldDistance = 1.15f;

        private Transform _grabAttachPoint;
        private LineRenderer _handLaserLine;
        private LayerMask _interactionMask;

        private IVRInteractable _hoveredInteractable;
        private IVRInteractable _activeSelection;
        private VRGrabbableObject _heldGrabbable;
        private VRInteractorMode _activeMode = VRInteractorMode.Gaze;

        private float _dwellTimer;
        private bool _dwellConsumedForTarget;
        private float _currentHoldDistance;
        private bool _handRayWasPinching;

        public string ActiveModeName => _activeMode switch
        {
            VRInteractorMode.DirectHandPinch => "Hand Direct Pinch",
            VRInteractorMode.HandRay => "Hand Pointer Ray",
            _ => "Gaze + Dwell / Tap"
        };

        public string CurrentHoveredLabel => _heldGrabbable != null
            ? $"Holding: {_heldGrabbable.InteractionLabel}"
            : (_hoveredInteractable != null ? _hoveredInteractable.InteractionLabel : "None");

        public bool IsHoldingObject => _heldGrabbable != null;

        public void Initialize(VRStereoRig rig, VRHandTrackingManager handManager)
        {
            stereoRig = rig;
            handTrackingManager = handManager;
            EnsureHelpers();
        }

        private void Start()
        {
            if (stereoRig == null)
            {
                stereoRig = FindFirstObjectByType<VRStereoRig>();
            }

            if (handTrackingManager == null)
            {
                handTrackingManager = FindFirstObjectByType<VRHandTrackingManager>();
            }

            EnsureHelpers();
        }

        private void Update()
        {
            if (stereoRig == null || stereoRig.CenterEyeAnchor == null)
            {
                return;
            }

            EnsureHelpers();

            TrackedHandPose primaryHand = handTrackingManager != null ? handTrackingManager.GetPrimaryInteractionHand() : null;
            if (primaryHand != null && primaryHand.IsTracked)
            {
                UpdateHandInteraction(primaryHand);
            }
            else
            {
                _handRayWasPinching = false;
                if (_handLaserLine != null)
                {
                    _handLaserLine.enabled = false;
                }

                UpdateGazeInteraction();
            }
        }

        private void UpdateHandInteraction(TrackedHandPose hand)
        {
            bool pinchDown = hand.Gesture.PinchStartedThisFrame || (hand.Gesture.IsPinching && !_handRayWasPinching);
            bool pinchUp = hand.Gesture.PinchEndedThisFrame || (!hand.Gesture.IsPinching && _handRayWasPinching);
            _handRayWasPinching = hand.Gesture.IsPinching;

            // If already holding a grabbable via hand, keep anchor synced until pinch ends
            if (_heldGrabbable != null)
            {
                if (_activeMode == VRInteractorMode.DirectHandPinch)
                {
                    _grabAttachPoint.position = hand.PinchPoint;
                    _grabAttachPoint.rotation = Quaternion.LookRotation(hand.AimRay.direction, Vector3.up);
                }
                else
                {
                    _grabAttachPoint.position = hand.AimRay.GetPoint(_currentHoldDistance);
                    _grabAttachPoint.rotation = Quaternion.LookRotation(hand.AimRay.direction, Vector3.up);
                }

                UpdateLaserVisual(hand.AimRay.origin, _grabAttachPoint.position, true);
                reticle?.SetVisible(false);

                if (pinchUp)
                {
                    ReleaseActiveSelection(BuildContext(_activeMode, hand.AimRay, _grabAttachPoint.position, -hand.AimRay.direction, _currentHoldDistance));
                }

                return;
            }

            // Priority 1A: Direct near-field pinch check around thumb/index pinch midpoint
            Collider[] nearby = Physics.OverlapSphere(hand.PinchPoint, directPinchGrabRadius, _interactionMask, QueryTriggerInteraction.Collide);
            IVRInteractable directCandidate = FindClosestInteractable(nearby, hand.PinchPoint);
            if (directCandidate != null)
            {
                _activeMode = VRInteractorMode.DirectHandPinch;
                if (_handLaserLine != null)
                {
                    _handLaserLine.enabled = false;
                }

                reticle?.SetVisible(false);

                Vector3 hitPos = directCandidate.Transform.position;
                VRInteractorContext ctx = BuildContext(VRInteractorMode.DirectHandPinch, hand.AimRay, hitPos, -hand.AimRay.direction, Vector3.Distance(hand.PinchPoint, hitPos));
                UpdateHoverTarget(directCandidate, ctx);

                if (pinchDown)
                {
                    _grabAttachPoint.position = hand.PinchPoint;
                    _grabAttachPoint.rotation = Quaternion.LookRotation(hand.AimRay.direction, Vector3.up);
                    BeginSelection(directCandidate, ctx);
                }

                return;
            }

            // Priority 1B: Distance hand raycast pointer
            _activeMode = VRInteractorMode.HandRay;
            Ray ray = hand.AimRay;
            bool hitSomething = Physics.Raycast(ray, out RaycastHit hit, maxRayDistance, _interactionMask, QueryTriggerInteraction.Collide);
            IVRInteractable rayTarget = hitSomething ? hit.collider.GetComponentInParent<IVRInteractable>() : null;

            Vector3 rayEnd = hitSomething ? hit.point : ray.GetPoint(4.5f);
            UpdateLaserVisual(ray.origin, rayEnd, rayTarget != null);

            VRInteractorContext rayCtx = BuildContext(
                VRInteractorMode.HandRay,
                ray,
                rayEnd,
                hitSomething ? hit.normal : -ray.direction,
                hitSomething ? hit.distance : maxRayDistance);

            UpdateHoverTarget(rayTarget, rayCtx);

            if (reticle != null)
            {
                reticle.SetVisible(true);
                reticle.UpdateReticle(ray, hitSomething, rayEnd, rayCtx.HitNormal, rayTarget != null, hand.Gesture.PinchStrength);
            }

            if (pinchDown && rayTarget != null)
            {
                _currentHoldDistance = Mathf.Clamp(rayCtx.HitDistance, 0.65f, 2.2f);
                _grabAttachPoint.position = ray.GetPoint(_currentHoldDistance);
                _grabAttachPoint.rotation = Quaternion.LookRotation(ray.direction, Vector3.up);
                BeginSelection(rayTarget, rayCtx);
            }
            else if (pinchUp && _activeSelection != null)
            {
                ReleaseActiveSelection(rayCtx);
            }
        }

        private void UpdateGazeInteraction()
        {
            _activeMode = VRInteractorMode.Gaze;
            Transform eye = stereoRig.CenterEyeAnchor;
            Ray gazeRay = new Ray(eye.position, eye.forward);

            bool triggerPressed = WasManualTriggerPressed();

            // Update carry anchor if currently carrying an object in gaze mode
            if (_heldGrabbable != null)
            {
                _grabAttachPoint.position = gazeRay.GetPoint(_currentHoldDistance);
                _grabAttachPoint.rotation = Quaternion.LookRotation(eye.forward, eye.up);

                if (reticle != null)
                {
                    reticle.SetVisible(true);
                    reticle.UpdateReticle(gazeRay, true, _grabAttachPoint.position, -eye.forward, true, 0f);
                }

                if (triggerPressed)
                {
                    ReleaseActiveSelection(BuildContext(VRInteractorMode.Gaze, gazeRay, _grabAttachPoint.position, -eye.forward, _currentHoldDistance));
                }
                return;
            }

            bool hitSomething = Physics.Raycast(gazeRay, out RaycastHit hit, maxRayDistance, _interactionMask, QueryTriggerInteraction.Collide);
            IVRInteractable target = hitSomething ? hit.collider.GetComponentInParent<IVRInteractable>() : null;

            VRInteractorContext ctx = BuildContext(
                VRInteractorMode.Gaze,
                gazeRay,
                hitSomething ? hit.point : gazeRay.GetPoint(defaultHoldDistance),
                hitSomething ? hit.normal : -gazeRay.direction,
                hitSomething ? hit.distance : defaultHoldDistance);

            UpdateHoverTarget(target, ctx);

            float dwellProgress = 0f;
            if (target != null && target.SupportsDwellActivation)
            {
                if (!_dwellConsumedForTarget)
                {
                    _dwellTimer += Time.unscaledDeltaTime;
                    dwellProgress = Mathf.Clamp01(_dwellTimer / Mathf.Max(0.25f, gazeDwellSeconds));

                    if (_dwellTimer >= gazeDwellSeconds)
                    {
                        _dwellConsumedForTarget = true;
                        _currentHoldDistance = Mathf.Clamp(ctx.HitDistance, 0.85f, 1.8f);
                        _grabAttachPoint.position = gazeRay.GetPoint(_currentHoldDistance);
                        _grabAttachPoint.rotation = Quaternion.LookRotation(eye.forward, eye.up);
                        ActivateOrGrabTarget(target, ctx);
                    }
                }
            }
            else
            {
                _dwellTimer = 0f;
                _dwellConsumedForTarget = false;
            }

            if (triggerPressed && target != null)
            {
                _dwellTimer = 0f;
                _dwellConsumedForTarget = true;
                _currentHoldDistance = Mathf.Clamp(ctx.HitDistance, 0.85f, 1.8f);
                _grabAttachPoint.position = gazeRay.GetPoint(_currentHoldDistance);
                _grabAttachPoint.rotation = Quaternion.LookRotation(eye.forward, eye.up);
                ActivateOrGrabTarget(target, ctx);
            }

            if (reticle != null)
            {
                reticle.SetVisible(true);
                reticle.UpdateReticle(
                    gazeRay,
                    hitSomething,
                    ctx.HitPoint,
                    ctx.HitNormal,
                    target != null,
                    dwellProgress);
            }
        }

        private void ActivateOrGrabTarget(IVRInteractable target, VRInteractorContext ctx)
        {
            if (target is VRGrabbableObject grabbable)
            {
                _heldGrabbable = grabbable;
                _activeSelection = target;
                grabbable.OnActivate(ctx);
                if (!grabbable.IsGrabbed)
                {
                    _heldGrabbable = null;
                    _activeSelection = null;
                }
            }
            else
            {
                target.OnActivate(ctx);
            }
        }

        private void BeginSelection(IVRInteractable target, VRInteractorContext ctx)
        {
            _activeSelection = target;
            if (target is VRGrabbableObject grabbable)
            {
                _heldGrabbable = grabbable;
            }

            target.OnSelectStart(ctx);

            if (_heldGrabbable != null && !_heldGrabbable.IsGrabbed)
            {
                _heldGrabbable = null;
            }
        }

        private void ReleaseActiveSelection(VRInteractorContext ctx)
        {
            if (_heldGrabbable != null)
            {
                _heldGrabbable.EndGrab(applyThrowVelocity: true);
                _heldGrabbable = null;
            }

            if (_activeSelection != null)
            {
                _activeSelection.OnSelectEnd(ctx);
                _activeSelection = null;
            }
        }

        private void UpdateHoverTarget(IVRInteractable newTarget, VRInteractorContext ctx)
        {
            if (ReferenceEquals(newTarget, _hoveredInteractable))
            {
                return;
            }

            if (_hoveredInteractable != null)
            {
                _hoveredInteractable.OnHoverExit(ctx);
            }

            _hoveredInteractable = newTarget;
            _dwellTimer = 0f;
            _dwellConsumedForTarget = false;

            if (_hoveredInteractable != null)
            {
                _hoveredInteractable.OnHoverEnter(ctx);
            }
        }

        private VRInteractorContext BuildContext(VRInteractorMode mode, Ray ray, Vector3 hitPoint, Vector3 hitNormal, float distance)
        {
            return new VRInteractorContext
            {
                Mode = mode,
                Ray = ray,
                HitPoint = hitPoint,
                HitNormal = hitNormal,
                HitDistance = distance,
                AttachPoint = _grabAttachPoint
            };
        }

        private static IVRInteractable FindClosestInteractable(Collider[] colliders, Vector3 origin)
        {
            IVRInteractable best = null;
            float bestSqrDist = float.MaxValue;

            for (int i = 0; i < colliders.Length; i++)
            {
                IVRInteractable candidate = colliders[i].GetComponentInParent<IVRInteractable>();
                if (candidate == null)
                {
                    continue;
                }

                float sqrDist = (candidate.Transform.position - origin).sqrMagnitude;
                if (sqrDist < bestSqrDist)
                {
                    bestSqrDist = sqrDist;
                    best = candidate;
                }
            }

            return best;
        }

        private static bool WasManualTriggerPressed()
        {
            Touchscreen touch = Touchscreen.current;
            if (touch != null)
            {
                // Single-finger tap activates; multi-finger tap is reserved for Recenter
                int activeCount = 0;
                bool primaryJustPressed = touch.primaryTouch.press.wasPressedThisFrame;
                for (int i = 0; i < touch.touches.Count; i++)
                {
                    if (touch.touches[i].press.isPressed)
                    {
                        activeCount++;
                    }
                }

                if (primaryJustPressed && activeCount == 1)
                {
                    return true;
                }
            }

            Keyboard kb = Keyboard.current;
            if (kb != null && (kb.spaceKey.wasPressedThisFrame || kb.enterKey.wasPressedThisFrame))
            {
                return true;
            }

            Mouse mouse = Mouse.current;
            if (mouse != null && mouse.leftButton.wasPressedThisFrame)
            {
                return true;
            }

            return false;
        }

        private void UpdateLaserVisual(Vector3 start, Vector3 end, bool highlighted)
        {
            if (_handLaserLine == null)
            {
                return;
            }

            _handLaserLine.enabled = true;
            _handLaserLine.SetPosition(0, start);
            _handLaserLine.SetPosition(1, end);

            Color c = highlighted ? new Color(0.20f, 1.0f, 0.65f, 0.95f) : new Color(0.25f, 0.78f, 1.0f, 0.65f);
            _handLaserLine.startColor = c;
            _handLaserLine.endColor = new Color(c.r, c.g, c.b, 0.15f);
        }

        private void EnsureHelpers()
        {
            _interactionMask = VRRuntimeConfig.GetInteractionLayerMask();

            if (_grabAttachPoint == null)
            {
                GameObject anchor = new GameObject("VRGrabAttachPoint");
                anchor.transform.SetParent(transform, false);
                _grabAttachPoint = anchor.transform;
            }

            if (reticle == null)
            {
                GameObject reticleGo = new GameObject("VRGazeReticle");
                reticleGo.transform.SetParent(transform, false);
                reticle = reticleGo.AddComponent<VRGazeReticle>();
            }

            if (_handLaserLine == null)
            {
                GameObject laserGo = new GameObject("VRHandPointerRay");
                laserGo.transform.SetParent(transform, false);
                _handLaserLine = laserGo.AddComponent<LineRenderer>();
                _handLaserLine.positionCount = 2;
                _handLaserLine.startWidth = 0.0055f;
                _handLaserLine.endWidth = 0.002f;
                _handLaserLine.useWorldSpace = true;
                _handLaserLine.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                _handLaserLine.receiveShadows = false;

                Shader lineShader = Shader.Find("Sprites/Default");
                if (lineShader != null)
                {
                    _handLaserLine.sharedMaterial = new Material(lineShader);
                }

                _handLaserLine.enabled = false;
            }
        }
    }
}
