using MobileQuestVR.Core;
using MobileQuestVR.HandTracking;
using MobileQuestVR.Interaction;
using MobileQuestVR.Rendering;
using MobileQuestVR.Tracking;
using UnityEngine;
using UnityEngine.UI;

namespace MobileQuestVR.UI
{
    /// <summary>
    /// Wall-mounted holographic VR status board showing real-time FPS, stereoscopic parameters,
    /// gyroscope orientation telemetry, MediaPipe hand tracking status, and interaction target info.
    /// </summary>
    public class VRTelemetryBoard : MonoBehaviour
    {
        private const float BoardWidth = 1.42f;
        private const float BoardHeight = 0.94f;
        private const float PixelsPerMeter = 800f;

        private VRStereoRig _stereoRig;
        private VRHeadTracker _headTracker;
        private VRHandTrackingManager _handManager;
        private VRInteractionController _interactionController;

        private Text _bodyText;
        private bool _built;
        private float _fpsAccumulator;
        private int _fpsFrames;
        private float _currentFps;
        private float _refreshTimer;

        public void Initialize(
            VRStereoRig stereoRig,
            VRHeadTracker headTracker,
            VRHandTrackingManager handManager,
            VRInteractionController interactionController,
            Transform mountPoint)
        {
            _stereoRig = stereoRig;
            _headTracker = headTracker;
            _handManager = handManager;
            _interactionController = interactionController;

            if (mountPoint != null)
            {
                transform.SetPositionAndRotation(mountPoint.position, mountPoint.rotation);
            }

            BuildBoardIfNeeded();
        }

        private void Update()
        {
            _fpsAccumulator += Time.unscaledDeltaTime;
            _fpsFrames++;
            _refreshTimer += Time.unscaledDeltaTime;

            if (_refreshTimer < 0.2f)
            {
                return;
            }

            _currentFps = _fpsAccumulator > 0.001f ? _fpsFrames / _fpsAccumulator : 0f;
            _fpsAccumulator = 0f;
            _fpsFrames = 0;
            _refreshTimer = 0f;

            UpdateTelemetryText();
        }

        private void BuildBoardIfNeeded()
        {
            if (_built)
            {
                return;
            }

            for (int i = transform.childCount - 1; i >= 0; i--)
            {
                GameObject child = transform.GetChild(i).gameObject;
                if (Application.isPlaying)
                {
                    Destroy(child);
                }
                else
                {
                    DestroyImmediate(child);
                }
            }

            int uiLayer = VRRuntimeConfig.ResolveLayer(VRRuntimeConfig.LayerNameUI);
            Font font = VRRuntimeConfig.GetSafeBuiltinFont();

            GameObject backdrop = GameObject.CreatePrimitive(PrimitiveType.Quad);
            backdrop.name = "TelemetryBackdrop";
            backdrop.transform.SetParent(transform, false);
            backdrop.transform.localPosition = new Vector3(0f, 0f, 0.01f);
            backdrop.transform.localScale = new Vector3(BoardWidth, BoardHeight, 1f);
            backdrop.layer = uiLayer;

            Collider col = backdrop.GetComponent<Collider>();
            if (col != null)
            {
                if (Application.isPlaying) Destroy(col);
                else DestroyImmediate(col);
            }

            Renderer rend = backdrop.GetComponent<Renderer>();
            rend.sharedMaterial = VRRuntimeConfig.CreateHoloMaterial(
                new Color(0.04f, 0.09f, 0.16f, 0.90f),
                new Color(0.16f, 0.72f, 1.0f, 0.95f),
                0.015f);
            rend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            GameObject canvasGo = new GameObject("TelemetryCanvas");
            canvasGo.transform.SetParent(transform, false);
            canvasGo.layer = uiLayer;

            Canvas canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            if (_stereoRig != null)
            {
                canvas.worldCamera = _stereoRig.GetPrimaryEventCamera();
            }

            RectTransform canvasRect = canvas.GetComponent<RectTransform>();
            canvasRect.sizeDelta = new Vector2(BoardWidth * PixelsPerMeter, BoardHeight * PixelsPerMeter);
            canvasRect.localScale = Vector3.one / PixelsPerMeter;
            canvasRect.localPosition = Vector3.zero;

            GameObject titleGo = new GameObject("Title");
            titleGo.transform.SetParent(canvasRect, false);
            RectTransform titleRect = titleGo.AddComponent<RectTransform>();
            titleRect.anchoredPosition = new Vector2(0f, 315f);
            titleRect.sizeDelta = new Vector2(1040f, 56f);

            Text titleText = titleGo.AddComponent<Text>();
            titleText.text = "MOBILEQUEST VR  —  LIVE SYSTEM TELEMETRY";
            titleText.font = font;
            titleText.fontSize = 34;
            titleText.fontStyle = FontStyle.Bold;
            titleText.alignment = TextAnchor.MiddleLeft;
            titleText.color = new Color(0.28f, 0.88f, 1.0f, 1f);

            GameObject bodyGo = new GameObject("Body");
            bodyGo.transform.SetParent(canvasRect, false);
            RectTransform bodyRect = bodyGo.AddComponent<RectTransform>();
            bodyRect.anchoredPosition = new Vector2(0f, -32f);
            bodyRect.sizeDelta = new Vector2(1040f, 620f);

            _bodyText = bodyGo.AddComponent<Text>();
            _bodyText.font = font;
            _bodyText.fontSize = 25;
            _bodyText.lineSpacing = 1.25f;
            _bodyText.alignment = TextAnchor.UpperLeft;
            _bodyText.color = new Color(0.90f, 0.95f, 1.0f, 1f);
            _bodyText.horizontalOverflow = HorizontalWrapMode.Wrap;
            _bodyText.verticalOverflow = VerticalWrapMode.Overflow;

            _built = true;
            UpdateTelemetryText();
        }

        private void UpdateTelemetryText()
        {
            if (_bodyText == null)
            {
                return;
            }

            string stereoInfo = _stereoRig != null
                ? $"{(_stereoRig.StereoEnabled ? "Stereo Split" : "Mono")} | Barrel: {(_stereoRig.BarrelDistortionEnabled ? "ON" : "OFF")} | IPD: {_stereoRig.CurrentIpdMeters * 1000f:0.0} mm | FOV: {_stereoRig.CurrentVerticalFov:0}°"
                : "Unavailable";

            Vector3 euler = _headTracker != null ? _headTracker.SignedEulerTelemetry : Vector3.zero;
            string headInfo = _headTracker != null
                ? $"{_headTracker.ActiveSourceName}\n   Yaw: {euler.y:+000.0;-000.0}°   Pitch: {euler.x:+000.0;-000.0}°   Roll: {euler.z:+000.0;-000.0}°"
                : "Unavailable";

            string handInfo = "Unavailable";
            if (_handManager != null)
            {
                string leftGesture = _handManager.LeftHand.IsTracked ? _handManager.LeftHand.Gesture.PrimaryGesture.ToString() : "Not tracked";
                string rightGesture = _handManager.RightHand.IsTracked ? _handManager.RightHand.Gesture.PrimaryGesture.ToString() : "Not tracked";
                handInfo = $"{_handManager.ProviderName} [{_handManager.ProviderStatus}]\n   Left: {leftGesture}   |   Right: {rightGesture}";
            }

            string interactInfo = _interactionController != null
                ? $"{_interactionController.ActiveModeName}  |  Target: {_interactionController.CurrentHoveredLabel}"
                : "Unavailable";

            _bodyText.text =
                $"RENDERING   :  {_currentFps:0.0} FPS  (Target {Application.targetFrameRate} Hz)\n" +
                $"OPTICS      :  {stereoInfo}\n\n" +
                $"HEAD IMU    :  {headInfo}\n\n" +
                $"HANDS (MP)  :  {handInfo}\n\n" +
                $"INTERACTION :  {interactInfo}\n\n" +
                $"CONTROLS:\n" +
                $"  • Android VR : Gaze + Dwell (1.15s) or Tap screen | 3-finger tap = Recenter\n" +
                $"  • Editor PC  : Right-Drag = Look | WASD = Move | Click/Space = Select\n" +
                $"  • Shortcuts  : R = Recenter | M = Floating Menu | H = 21-Landmark Hand Test";
        }
    }
}
