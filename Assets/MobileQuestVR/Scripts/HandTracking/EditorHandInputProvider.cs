using UnityEngine;
using UnityEngine.InputSystem;

namespace MobileQuestVR.HandTracking
{
    /// <summary>
    /// Unity Editor diagnostic hand provider that synthesizes a valid 21-landmark MediaPipe packet
    /// controlled by mouse position + mouse left button (pinch) / G (fist) / P (open palm) when toggled via 'H'.
    /// Enables end-to-end validation of HandSpatialMapper, OneEuroFilter, HandGestureRecognizer,
    /// VRHandVisualizer, and pinch interaction directly in the Unity Editor.
    /// </summary>
    public sealed class EditorHandInputProvider : IHandTrackingProvider
    {
        private bool _isRunning;
        private bool _handVisible;
        private float _handDepthOffset;

        public string ProviderName => "Editor 21-Landmark Pipeline Tester (Press H)";
        public HandTrackingProviderStatus Status => _isRunning
            ? (_handVisible ? HandTrackingProviderStatus.Running : HandTrackingProviderStatus.Stopped)
            : HandTrackingProviderStatus.Uninitialized;
        public string StatusDetail => _handVisible
            ? "Active in Editor (Mouse move, Left-Click=Pinch, G=Grab, Scroll=Depth, H=Toggle)"
            : "Press 'H' in Play Mode to test 21-landmark Hand Tracking pipeline";
        public bool IsRunning => _isRunning;
        public bool IsHandVisible => _handVisible;

        public void Initialize()
        {
            _isRunning = true;
            _handVisible = false;
            _handDepthOffset = 0f;
        }

        public void StartTracking()
        {
            _isRunning = true;
        }

        public void StopTracking()
        {
            _isRunning = false;
            _handVisible = false;
        }

        public void Dispose()
        {
            StopTracking();
        }

        public void ToggleVisibility()
        {
            _handVisible = !_handVisible;
        }

        public bool TryGetLatestFrame(RawHandTrackingFrame targetFrame)
        {
            if (!_isRunning || targetFrame == null)
            {
                return false;
            }

            Keyboard kb = Keyboard.current;
            if (kb != null && kb.hKey.wasPressedThisFrame)
            {
                _handVisible = !_handVisible;
            }

            targetFrame.TimestampMs = (long)(Time.unscaledTimeAsDouble * 1000.0);

            if (!_handVisible)
            {
                targetFrame.HandCount = 0;
                return true;
            }

            Mouse mouse = Mouse.current;
            Vector2 screenNorm = new Vector2(0.58f, 0.56f);
            bool pinch = false;
            bool grab = kb != null && kb.gKey.isPressed;
            bool point = kb != null && kb.pKey.isPressed;

            if (mouse != null)
            {
                Vector2 mousePos = mouse.position.ReadValue();
                screenNorm.x = Mathf.Clamp(mousePos.x / Mathf.Max(1f, Screen.width), 0.15f, 0.85f);
                screenNorm.y = Mathf.Clamp(1f - (mousePos.y / Mathf.Max(1f, Screen.height)), 0.15f, 0.85f);
                pinch = mouse.leftButton.isPressed;

                float scrollY = mouse.scroll.ReadValue().y;
                if (Mathf.Abs(scrollY) > 0.01f)
                {
                    _handDepthOffset = Mathf.Clamp(_handDepthOffset + Mathf.Sign(scrollY) * 0.025f, -0.18f, 0.25f);
                }
            }

            targetFrame.HandCount = 1;
            RawHandDetection hand = targetFrame.Hands[0];
            hand.Handedness = Handedness.Right;
            hand.Confidence = 0.98f;
            hand.HasWorldLandmarks = true;

            PopulateAnatomicalRightHand(hand, screenNorm, _handDepthOffset, pinch, grab, point);
            return true;
        }

        private static void PopulateAnatomicalRightHand(
            RawHandDetection hand,
            Vector2 wristUv,
            float depthAdjust,
            bool pinch,
            bool grab,
            bool point)
        {
            // Metric 3D hand skeleton in MediaPipe world coordinates (+X right, +Y down, +Z away from camera)
            Vector3[] w = hand.WorldLandmarks;
            w[(int)HandLandmarkId.Wrist] = new Vector3(0f, 0.05f, 0f);

            // Base MCP knuckle arch
            w[(int)HandLandmarkId.ThumbCmc] = new Vector3(-0.024f, 0.028f, -0.006f);
            w[(int)HandLandmarkId.ThumbMcp] = new Vector3(-0.040f, 0.005f, -0.014f);
            w[(int)HandLandmarkId.IndexMcp] = new Vector3(-0.026f, -0.036f, 0.002f);
            w[(int)HandLandmarkId.MiddleMcp] = new Vector3(-0.003f, -0.042f, 0.004f);
            w[(int)HandLandmarkId.RingMcp] = new Vector3(0.019f, -0.038f, 0.004f);
            w[(int)HandLandmarkId.PinkyMcp] = new Vector3(0.039f, -0.028f, 0.002f);

            float indexCurl = grab ? 0.95f : (pinch ? 0.45f : 0.08f);
            float middleCurl = (grab || point) ? 0.95f : 0.08f;
            float ringCurl = (grab || point) ? 0.95f : 0.10f;
            float pinkyCurl = (grab || point) ? 0.95f : 0.12f;

            BuildFinger(w, HandLandmarkId.IndexMcp, HandLandmarkId.IndexPip, HandLandmarkId.IndexDip, HandLandmarkId.IndexTip, 0.036f, 0.024f, 0.020f, indexCurl);
            BuildFinger(w, HandLandmarkId.MiddleMcp, HandLandmarkId.MiddlePip, HandLandmarkId.MiddleDip, HandLandmarkId.MiddleTip, 0.040f, 0.026f, 0.021f, middleCurl);
            BuildFinger(w, HandLandmarkId.RingMcp, HandLandmarkId.RingPip, HandLandmarkId.RingDip, HandLandmarkId.RingTip, 0.037f, 0.024f, 0.020f, ringCurl);
            BuildFinger(w, HandLandmarkId.PinkyMcp, HandLandmarkId.PinkyPip, HandLandmarkId.PinkyDip, HandLandmarkId.PinkyTip, 0.030f, 0.020f, 0.017f, pinkyCurl);

            if (pinch)
            {
                Vector3 indexTip = w[(int)HandLandmarkId.IndexTip];
                w[(int)HandLandmarkId.ThumbIp] = Vector3.Lerp(w[(int)HandLandmarkId.ThumbMcp], indexTip, 0.55f) + new Vector3(-0.008f, 0.004f, -0.010f);
                w[(int)HandLandmarkId.ThumbTip] = indexTip + new Vector3(-0.006f, 0.006f, -0.004f);
            }
            else if (grab)
            {
                w[(int)HandLandmarkId.ThumbIp] = new Vector3(-0.025f, -0.018f, -0.022f);
                w[(int)HandLandmarkId.ThumbTip] = new Vector3(-0.005f, -0.024f, -0.028f);
            }
            else
            {
                w[(int)HandLandmarkId.ThumbIp] = new Vector3(-0.056f, -0.016f, -0.016f);
                w[(int)HandLandmarkId.ThumbTip] = new Vector3(-0.068f, -0.035f, -0.014f);
            }

            // Compute consistent normalized image coordinates corresponding to target wrist depth (~0.48m + depthAdjust)
            float depthScale = Mathf.Clamp(0.48f + depthAdjust, 0.28f, 0.78f);
            float projectedScale = 1.0f / (depthScale * 1.35f);

            for (int i = 0; i < HandSkeletonTopology.LandmarkCount; i++)
            {
                Vector3 rel = w[i] - w[(int)HandLandmarkId.Wrist];
                hand.NormalizedLandmarks[i] = new Vector3(
                    wristUv.x + rel.x * projectedScale,
                    wristUv.y + rel.y * projectedScale,
                    rel.z * projectedScale);
            }
        }

        private static void BuildFinger(
            Vector3[] joints,
            HandLandmarkId mcpId,
            HandLandmarkId pipId,
            HandLandmarkId dipId,
            HandLandmarkId tipId,
            float len1,
            float len2,
            float len3,
            float curl)
        {
            Vector3 mcp = joints[(int)mcpId];
            float a1 = curl * 75f * Mathf.Deg2Rad;
            float a2 = curl * 145f * Mathf.Deg2Rad;
            float a3 = curl * 190f * Mathf.Deg2Rad;

            Vector3 dir1 = new Vector3(0f, -Mathf.Cos(a1), -Mathf.Sin(a1));
            Vector3 dir2 = new Vector3(0f, -Mathf.Cos(a2), -Mathf.Sin(a2));
            Vector3 dir3 = new Vector3(0f, -Mathf.Cos(a3), -Mathf.Sin(a3));

            Vector3 pip = mcp + dir1 * len1;
            Vector3 dip = pip + dir2 * len2;
            Vector3 tip = dip + dir3 * len3;

            joints[(int)pipId] = pip;
            joints[(int)dipId] = dip;
            joints[(int)tipId] = tip;
        }
    }
}
