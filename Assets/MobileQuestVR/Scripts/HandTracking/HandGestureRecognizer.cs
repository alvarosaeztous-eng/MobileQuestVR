using UnityEngine;

namespace MobileQuestVR.HandTracking
{
    /// <summary>
    /// Scale-invariant geometric gesture classifier operating on 3D 21-joint hand skeletons.
    /// Implements hysteresis on Pinch detection to avoid rapid trigger chatter during VR interactions.
    /// </summary>
    public sealed class HandGestureRecognizer
    {
        private readonly float _pinchEnterRatio;
        private readonly float _pinchExitRatio;
        private bool _wasPinching;

        public HandGestureRecognizer(float pinchEnterRatio = 0.38f, float pinchExitRatio = 0.50f)
        {
            _pinchEnterRatio = Mathf.Clamp(pinchEnterRatio, 0.15f, 0.65f);
            _pinchExitRatio = Mathf.Clamp(pinchExitRatio, _pinchEnterRatio + 0.05f, 0.85f);
        }

        public void Reset()
        {
            _wasPinching = false;
        }

        /// <summary>
        /// Evaluates continuous finger curls, pinch state, palm orientation, and discrete VR gestures.
        /// </summary>
        public HandGestureState Evaluate(Vector3[] worldJoints, Vector3 palmCenter, Vector3 palmNormal, Vector3 headPosition)
        {
            HandGestureState state = default;
            if (worldJoints == null || worldJoints.Length < HandSkeletonTopology.LandmarkCount)
            {
                _wasPinching = false;
                return state;
            }

            Vector3 wrist = worldJoints[(int)HandLandmarkId.Wrist];
            Vector3 middleMcp = worldJoints[(int)HandLandmarkId.MiddleMcp];
            float palmScale = Mathf.Max(0.04f, Vector3.Distance(wrist, middleMcp));

            // Continuous curl metrics (0 = straight/extended, 1 = fully curled)
            state.ThumbCurl = ComputeThumbCurl(worldJoints);
            state.IndexCurl = ComputeFingerCurl(worldJoints, HandLandmarkId.IndexMcp, HandLandmarkId.IndexPip, HandLandmarkId.IndexTip, wrist);
            state.MiddleCurl = ComputeFingerCurl(worldJoints, HandLandmarkId.MiddleMcp, HandLandmarkId.MiddlePip, HandLandmarkId.MiddleTip, wrist);
            state.RingCurl = ComputeFingerCurl(worldJoints, HandLandmarkId.RingMcp, HandLandmarkId.RingPip, HandLandmarkId.RingTip, wrist);
            state.PinkyCurl = ComputeFingerCurl(worldJoints, HandLandmarkId.PinkyMcp, HandLandmarkId.PinkyPip, HandLandmarkId.PinkyTip, wrist);

            // Pinch distance normalized by palm scale
            float pinchDistance = Vector3.Distance(
                worldJoints[(int)HandLandmarkId.ThumbTip],
                worldJoints[(int)HandLandmarkId.IndexTip]);
            float pinchRatio = pinchDistance / palmScale;

            state.PinchStrength = Mathf.Clamp01(Mathf.InverseLerp(0.85f, _pinchEnterRatio * 0.75f, pinchRatio));

            bool isPinching = _wasPinching
                ? pinchRatio <= _pinchExitRatio
                : pinchRatio <= _pinchEnterRatio;

            state.IsPinching = isPinching;
            state.PinchStartedThisFrame = isPinching && !_wasPinching;
            state.PinchEndedThisFrame = !isPinching && _wasPinching;
            _wasPinching = isPinching;

            bool indexExtended = state.IndexCurl < 0.35f;
            bool middleExtended = state.MiddleCurl < 0.38f;
            bool ringExtended = state.RingCurl < 0.40f;
            bool pinkyExtended = state.PinkyCurl < 0.42f;
            bool thumbExtended = state.ThumbCurl < 0.40f;

            bool fourFingersCurled = state.IndexCurl > 0.62f && state.MiddleCurl > 0.62f
                && state.RingCurl > 0.62f && state.PinkyCurl > 0.62f;

            state.IsGrabbing = fourFingersCurled && !isPinching;
            state.IsPointing = indexExtended && !middleExtended && !ringExtended && !pinkyExtended;

            Vector3 toHead = (headPosition - palmCenter);
            state.IsPalmFacingHead = toHead.sqrMagnitude > 1e-4f
                && Vector3.Dot(palmNormal.normalized, toHead.normalized) > 0.55f;

            if (isPinching)
            {
                state.PrimaryGesture = HandGestureType.Pinch;
            }
            else if (fourFingersCurled && thumbExtended)
            {
                state.PrimaryGesture = HandGestureType.ThumbsUp;
            }
            else if (fourFingersCurled)
            {
                state.PrimaryGesture = HandGestureType.FistGrab;
            }
            else if (state.IsPointing)
            {
                state.PrimaryGesture = HandGestureType.Point;
            }
            else if (indexExtended && middleExtended && ringExtended && pinkyExtended)
            {
                state.PrimaryGesture = HandGestureType.OpenPalm;
            }
            else
            {
                state.PrimaryGesture = HandGestureType.None;
            }

            return state;
        }

        private static float ComputeFingerCurl(
            Vector3[] joints,
            HandLandmarkId mcpId,
            HandLandmarkId pipId,
            HandLandmarkId tipId,
            Vector3 wrist)
        {
            Vector3 mcp = joints[(int)mcpId];
            Vector3 pip = joints[(int)pipId];
            Vector3 tip = joints[(int)tipId];

            Vector3 bone1 = (pip - mcp);
            Vector3 bone2 = (tip - pip);
            float bendScore = 0.5f;

            if (bone1.sqrMagnitude > 1e-6f && bone2.sqrMagnitude > 1e-6f)
            {
                float cosAngle = Mathf.Clamp(Vector3.Dot(bone1.normalized, bone2.normalized), -1f, 1f);
                // cosAngle = 1 -> straight (0 curl), cosAngle = -0.3 -> tightly curled (1 curl)
                bendScore = Mathf.InverseLerp(0.95f, -0.25f, cosAngle);
            }

            float distMcp = Vector3.Distance(wrist, mcp);
            float distTip = Vector3.Distance(wrist, tip);
            float extensionRatio = distMcp > 1e-4f ? distTip / distMcp : 1.5f;
            float distanceScore = Mathf.InverseLerp(1.85f, 1.05f, extensionRatio);

            return Mathf.Clamp01(bendScore * 0.6f + distanceScore * 0.4f);
        }

        private static float ComputeThumbCurl(Vector3[] joints)
        {
            Vector3 cmc = joints[(int)HandLandmarkId.ThumbCmc];
            Vector3 mcp = joints[(int)HandLandmarkId.ThumbMcp];
            Vector3 ip = joints[(int)HandLandmarkId.ThumbIp];
            Vector3 tip = joints[(int)HandLandmarkId.ThumbTip];

            Vector3 v1 = mcp - cmc;
            Vector3 v2 = tip - ip;
            if (v1.sqrMagnitude < 1e-6f || v2.sqrMagnitude < 1e-6f)
            {
                return 0.5f;
            }

            float cosAngle = Mathf.Clamp(Vector3.Dot(v1.normalized, v2.normalized), -1f, 1f);
            return Mathf.Clamp01(Mathf.InverseLerp(0.92f, 0.10f, cosAngle));
        }
    }
}
