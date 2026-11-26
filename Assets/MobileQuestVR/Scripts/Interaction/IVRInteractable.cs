using UnityEngine;

namespace MobileQuestVR.Interaction
{
    public enum VRInteractorMode
    {
        Gaze,
        HandRay,
        DirectHandPinch
    }

    public struct VRInteractorContext
    {
        public VRInteractorMode Mode;
        public Ray Ray;
        public Vector3 HitPoint;
        public Vector3 HitNormal;
        public float HitDistance;
        public Transform AttachPoint;
    }

    /// <summary>
    /// Common contract for all interactive 3D objects and floating UI controls in MobileQuestVR.
    /// </summary>
    public interface IVRInteractable
    {
        string InteractionLabel { get; }
        bool CanGrab { get; }
        bool SupportsDwellActivation { get; }
        Transform Transform { get; }

        void OnHoverEnter(VRInteractorContext context);
        void OnHoverExit(VRInteractorContext context);
        void OnSelectStart(VRInteractorContext context);
        void OnSelectEnd(VRInteractorContext context);
        void OnActivate(VRInteractorContext context);
    }
}
