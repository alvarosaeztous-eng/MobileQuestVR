using System;
using MobileQuestVR.Core;
using MobileQuestVR.Environment;
using MobileQuestVR.HandTracking;
using MobileQuestVR.Interaction;
using MobileQuestVR.Rendering;
using MobileQuestVR.Tracking;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace MobileQuestVR.UI
{
    /// <summary>
    /// Floating 3D holographic VR Control Panel in World Space.
    /// Every button is equipped with a collider + VRButtonInteractable so it works seamlessly with
    /// Gaze+Dwell, Android Screen Tap, Mouse Click, and MediaPipe Hand Pinch Rays.
    /// </summary>
    public class VRFloatingMenu : MonoBehaviour
    {
        private const float CanvasWorldWidth = 0.86f;
        private const float CanvasWorldHeight = 0.64f;
        private const float PixelsPerMeter = 1000f;

        private VRStereoRig _stereoRig;
        private VRHeadTracker _headTracker;
        private VRHandTrackingManager _handManager;
        private VirtualRoomBuilder _roomBuilder;
        private FloatingMenuAnchor _anchor;

        private GameObject _panelRoot;
        private Text _headerStatusText;
        private Text _stereoButtonLabel;
        private Text _distortionButtonLabel;
        private Text _ipdReadoutLabel;
        private Text _lightingButtonLabel;
        private Text _handButtonLabel;
        private Text _pinButtonLabel;

        private bool _isBuilt;
        private bool _isVisible = true;
        private float _uiRefreshTimer;

        public FloatingMenuAnchor Anchor => _anchor;

        public void Initialize(
            VRStereoRig stereoRig,
            VRHeadTracker headTracker,
            VRHandTrackingManager handManager,
            VirtualRoomBuilder roomBuilder)
        {
            _stereoRig = stereoRig;
            _headTracker = headTracker;
            _handManager = handManager;
            _roomBuilder = roomBuilder;

            if (_handManager != null)
            {
                _handManager.OnPalmMenuGesture -= HandlePalmSummon;
                _handManager.OnPalmMenuGesture += HandlePalmSummon;
            }

            if (_stereoRig != null)
            {
                _stereoRig.OnStereoSettingsChanged -= RefreshDynamicLabels;
                _stereoRig.OnStereoSettingsChanged += RefreshDynamicLabels;
            }

            if (_roomBuilder != null && _roomBuilder.LightingController != null)
            {
                _roomBuilder.LightingController.OnPresetChanged -= HandleLightingChanged;
                _roomBuilder.LightingController.OnPresetChanged += HandleLightingChanged;
            }

            BuildMenuIfNeeded();

            _anchor = GetComponent<FloatingMenuAnchor>();
            if (_anchor == null)
            {
                _anchor = gameObject.AddComponent<FloatingMenuAnchor>();
            }

            if (_stereoRig != null && _stereoRig.CenterEyeAnchor != null)
            {
                _anchor.Initialize(_stereoRig.CenterEyeAnchor, startPinned: true);
            }

            RefreshDynamicLabels();
        }

        private void OnDestroy()
        {
            if (_handManager != null)
            {
                _handManager.OnPalmMenuGesture -= HandlePalmSummon;
            }

            if (_stereoRig != null)
            {
                _stereoRig.OnStereoSettingsChanged -= RefreshDynamicLabels;
            }

            if (_roomBuilder != null && _roomBuilder.LightingController != null)
            {
                _roomBuilder.LightingController.OnPresetChanged -= HandleLightingChanged;
            }
        }

        private void Update()
        {
            Keyboard kb = Keyboard.current;
            if (kb != null && kb.mKey.wasPressedThisFrame)
            {
                ToggleVisibilityAndSummon();
            }

            _uiRefreshTimer += Time.unscaledDeltaTime;
            if (_uiRefreshTimer >= 0.35f)
            {
                _uiRefreshTimer = 0f;
                RefreshDynamicLabels();
            }
        }

        public void ToggleVisibilityAndSummon()
        {
            _isVisible = !_isVisible;
            if (_panelRoot != null)
            {
                _panelRoot.SetActive(_isVisible);
            }

            if (_isVisible && _anchor != null)
            {
                _anchor.SnapInFrontOfHead();
            }
        }

        private void HandlePalmSummon()
        {
            _isVisible = true;
            if (_panelRoot != null)
            {
                _panelRoot.SetActive(true);
            }

            _anchor?.SnapInFrontOfHead();
            ProceduralAudioLibrary.PlayAtPoint(VRSoundEffect.Recenter, transform.position, 0.55f);
        }

        private void HandleLightingChanged(RoomLightingPreset _)
        {
            RefreshDynamicLabels();
        }

        private void BuildMenuIfNeeded()
        {
            if (_isBuilt)
            {
                return;
            }

            Transform existing = transform.Find("FloatingMenuPanelRoot");
            if (existing != null)
            {
                if (Application.isPlaying)
                {
                    Destroy(existing.gameObject);
                }
                else
                {
                    DestroyImmediate(existing.gameObject);
                }
            }

            int uiLayer = VRRuntimeConfig.ResolveLayer(VRRuntimeConfig.LayerNameUI);
            Font font = VRRuntimeConfig.GetSafeBuiltinFont();

            _panelRoot = new GameObject("FloatingMenuPanelRoot");
            _panelRoot.transform.SetParent(transform, false);
            _panelRoot.layer = uiLayer;

            // Holographic glass backdrop quad using MobileQuestVR/HoloPanel shader
            GameObject backdrop = GameObject.CreatePrimitive(PrimitiveType.Quad);
            backdrop.name = "HoloBackdrop";
            backdrop.transform.SetParent(_panelRoot.transform, false);
            backdrop.transform.localPosition = new Vector3(0f, 0f, 0.012f);
            backdrop.transform.localScale = new Vector3(CanvasWorldWidth, CanvasWorldHeight, 1f);
            backdrop.layer = uiLayer;

            Collider bgCol = backdrop.GetComponent<Collider>();
            if (bgCol != null)
            {
                if (Application.isPlaying) Destroy(bgCol);
                else DestroyImmediate(bgCol);
            }

            Renderer bgRend = backdrop.GetComponent<Renderer>();
            bgRend.sharedMaterial = VRRuntimeConfig.CreateHoloMaterial(
                new Color(0.05f, 0.10f, 0.19f, 0.88f),
                new Color(0.18f, 0.78f, 1.0f, 0.96f),
                0.016f);
            bgRend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            // World-space Canvas for crisp UI layout
            GameObject canvasGo = new GameObject("MenuCanvas");
            canvasGo.transform.SetParent(_panelRoot.transform, false);
            canvasGo.layer = uiLayer;

            Canvas canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            if (_stereoRig != null)
            {
                canvas.worldCamera = _stereoRig.GetPrimaryEventCamera();
            }

            RectTransform canvasRect = canvas.GetComponent<RectTransform>();
            canvasRect.sizeDelta = new Vector2(CanvasWorldWidth * PixelsPerMeter, CanvasWorldHeight * PixelsPerMeter);
            canvasRect.localScale = Vector3.one / PixelsPerMeter;
            canvasRect.localPosition = Vector3.zero;

            // Header title
            CreateLabel(canvasRect, "Title", "MOBILEQUEST VR  •  CONTROL HUB", font, 30, FontStyle.Bold,
                new Color(0.32f, 0.88f, 1.0f, 1f), new Vector2(0f, 266f), new Vector2(780f, 44f), uiLayer);

            _headerStatusText = CreateLabel(canvasRect, "Subtitle", "Stereo VR Ready | Gaze or Hand Pinch to select", font, 20, FontStyle.Normal,
                new Color(0.76f, 0.86f, 0.96f, 1f), new Vector2(0f, 224f), new Vector2(780f, 32f), uiLayer);

            // Row 1: Recenter + Stereo Mode
            CreateMenuButton(canvasRect, "Btn_Recenter", "RECENTER VIEW", font,
                new Vector2(-196f, 142f), new Vector2(368f, 76f), uiLayer,
                () => _headTracker?.RecenterYaw());

            _stereoButtonLabel = CreateMenuButton(canvasRect, "Btn_Stereo", "STEREO: ON", font,
                new Vector2(196f, 142f), new Vector2(368f, 76f), uiLayer,
                () => _stereoRig?.ToggleStereoMode());

            // Row 2: Barrel Distortion + Room Lighting
            _distortionButtonLabel = CreateMenuButton(canvasRect, "Btn_Distortion", "LENS DISTORTION: ON", font,
                new Vector2(-196f, 46f), new Vector2(368f, 76f), uiLayer,
                () => _stereoRig?.ToggleBarrelDistortion());

            _lightingButtonLabel = CreateMenuButton(canvasRect, "Btn_Lighting", "ROOM LIGHT: Studio Day", font,
                new Vector2(196f, 46f), new Vector2(368f, 76f), uiLayer,
                () => _roomBuilder?.LightingController?.CyclePreset());

            // Row 3: IPD - | IPD Readout | IPD +
            CreateMenuButton(canvasRect, "Btn_IpdMinus", "IPD  -1 mm", font,
                new Vector2(-264f, -50f), new Vector2(232f, 74f), uiLayer,
                () => _stereoRig?.AdjustIpdMillimeters(-1f));

            _ipdReadoutLabel = CreateLabel(canvasRect, "Lbl_IpdValue", "IPD: 64.0 mm", font, 26, FontStyle.Bold,
                new Color(0.95f, 0.98f, 1f, 1f), new Vector2(0f, -50f), new Vector2(250f, 64f), uiLayer);

            CreateMenuButton(canvasRect, "Btn_IpdPlus", "IPD  +1 mm", font,
                new Vector2(264f, -50f), new Vector2(232f, 74f), uiLayer,
                () => _stereoRig?.AdjustIpdMillimeters(1f));

            // Row 4: Hand Tracking + Reset Objects
            _handButtonLabel = CreateMenuButton(canvasRect, "Btn_HandTracking", "HAND TRACKING", font,
                new Vector2(-196f, -146f), new Vector2(368f, 76f), uiLayer,
                () => _handManager?.RequestCameraOrTogglePreview());

            CreateMenuButton(canvasRect, "Btn_ResetObjects", "RESET ROOM OBJECTS", font,
                new Vector2(196f, -146f), new Vector2(368f, 76f), uiLayer,
                () => _roomBuilder?.ResetAllInteractiveObjects());

            // Row 5: Pin / Follow toggle + Hide Menu
            _pinButtonLabel = CreateMenuButton(canvasRect, "Btn_PinMenu", "MENU: PINNED", font,
                new Vector2(-196f, -242f), new Vector2(368f, 72f), uiLayer,
                () =>
                {
                    _anchor?.TogglePinned();
                    RefreshDynamicLabels();
                });

            CreateMenuButton(canvasRect, "Btn_CloseMenu", "HIDE MENU (M / PALM)", font,
                new Vector2(196f, -242f), new Vector2(368f, 72f), uiLayer,
                ToggleVisibilityAndSummon);

            _isBuilt = true;
        }

        private void RefreshDynamicLabels()
        {
            if (!_isBuilt)
            {
                return;
            }

            if (_stereoRig != null)
            {
                if (_stereoButtonLabel != null)
                {
                    _stereoButtonLabel.text = _stereoRig.StereoEnabled ? "VIEW: STEREO SPLIT" : "VIEW: MONO PREVIEW";
                }

                if (_distortionButtonLabel != null)
                {
                    _distortionButtonLabel.text = _stereoRig.BarrelDistortionEnabled ? "BARREL LENS: ON" : "BARREL LENS: OFF";
                }

                if (_ipdReadoutLabel != null)
                {
                    _ipdReadoutLabel.text = $"IPD: {_stereoRig.CurrentIpdMeters * 1000f:0.0} mm";
                }
            }

            if (_lightingButtonLabel != null && _roomBuilder != null && _roomBuilder.LightingController != null)
            {
                _lightingButtonLabel.text = $"LIGHT: {_roomBuilder.LightingController.CurrentPresetName.ToUpperInvariant()}";
            }

            if (_handButtonLabel != null && _handManager != null)
            {
                _handButtonLabel.text = Application.platform == RuntimePlatform.Android
                    ? $"MEDIAPIPE: {_handManager.ProviderStatus}"
                    : (_handManager.AnyHandTracked ? "TEST HAND: ACTIVE (H)" : "ENABLE TEST HAND (H)");
            }

            if (_pinButtonLabel != null && _anchor != null)
            {
                _pinButtonLabel.text = _anchor.IsPinned ? "MENU: PINNED IN ROOM" : "MENU: HEAD FOLLOW";
            }

            if (_headerStatusText != null && _headTracker != null)
            {
                _headerStatusText.text = $"IMU: {_headTracker.ActiveSourceName}";
            }
        }

        private static Text CreateLabel(
            RectTransform parent,
            string name,
            string content,
            Font font,
            int fontSize,
            FontStyle style,
            Color color,
            Vector2 anchoredPos,
            Vector2 size,
            int layer)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.layer = layer;

            RectTransform rect = go.AddComponent<RectTransform>();
            rect.anchoredPosition = anchoredPos;
            rect.sizeDelta = size;

            Text txt = go.AddComponent<Text>();
            txt.text = content;
            txt.font = font;
            txt.fontSize = fontSize;
            txt.fontStyle = style;
            txt.alignment = TextAnchor.MiddleCenter;
            txt.color = color;
            txt.horizontalOverflow = HorizontalWrapMode.Wrap;
            txt.verticalOverflow = VerticalWrapMode.Truncate;
            return txt;
        }

        private static Text CreateMenuButton(
            RectTransform parent,
            string name,
            string label,
            Font font,
            Vector2 anchoredPos,
            Vector2 size,
            int layer,
            Action onClickAction)
        {
            GameObject btnGo = new GameObject(name);
            btnGo.transform.SetParent(parent, false);
            btnGo.layer = layer;

            RectTransform rect = btnGo.AddComponent<RectTransform>();
            rect.anchoredPosition = anchoredPos;
            rect.sizeDelta = size;

            Image bg = btnGo.AddComponent<Image>();
            Color idleCol = new Color(0.10f, 0.20f, 0.34f, 0.94f);
            Color hoverCol = new Color(0.16f, 0.48f, 0.78f, 0.98f);
            Color pressCol = new Color(0.18f, 0.85f, 0.58f, 1.0f);
            bg.color = idleCol;

            // Physical BoxCollider sized cleanly to the RectTransform in canvas pixel space
            BoxCollider collider = btnGo.AddComponent<BoxCollider>();
            collider.size = new Vector3(size.x, size.y, 18f);
            collider.center = Vector3.zero;

            VRButtonInteractable vrBtn = btnGo.AddComponent<VRButtonInteractable>();
            vrBtn.Configure(label, bg, idleCol, hoverCol, pressCol);
            if (onClickAction != null)
            {
                vrBtn.onClicked.AddListener(() => onClickAction());
            }

            Text txt = CreateLabel(rect, "Label", label, font, 23, FontStyle.Bold,
                new Color(0.95f, 0.98f, 1f, 1f), Vector2.zero, size - new Vector2(18f, 10f), layer);

            return txt;
        }
    }
}
