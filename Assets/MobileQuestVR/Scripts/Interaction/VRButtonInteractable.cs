using MobileQuestVR.Core;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace MobileQuestVR.Interaction
{
    /// <summary>
    /// Interactive 3D / WorldSpace VR button triggered by Gaze+Dwell, Screen Tap, Mouse Click, or Hand Pinch Ray.
    /// Provides crisp color highlighting, physical Z-press depression, and procedural click audio.
    /// </summary>
    public class VRButtonInteractable : MonoBehaviour, IVRInteractable
    {
        [Header("Button Setup")]
        [SerializeField] private string interactionLabel = "Button";
        [SerializeField] private Image backgroundImage;
        [SerializeField] private Renderer meshRenderer;
        [SerializeField] private Color idleColor = new Color(0.11f, 0.20f, 0.34f, 0.92f);
        [SerializeField] private Color hoverColor = new Color(0.18f, 0.48f, 0.78f, 0.98f);
        [SerializeField] private Color pressColor = new Color(0.22f, 0.85f, 0.65f, 1f);
        [SerializeField] private float pressDepthOffset = 0.008f;

        public UnityEvent onClicked = new UnityEvent();

        private Vector3 _restingLocalPos;
        private bool _restingCaptured;
        private bool _isHovered;
        private float _pressFeedbackTimer;

        public string InteractionLabel
        {
            get => interactionLabel;
            set => interactionLabel = value;
        }

        public bool CanGrab => false;
        public bool SupportsDwellActivation => true;
        public Transform Transform => transform;

        private void Awake()
        {
            CaptureRestingPosition();
            ApplyVisualState();
        }

        private void Update()
        {
            if (_pressFeedbackTimer > 0f)
            {
                _pressFeedbackTimer -= Time.unscaledDeltaTime;
                if (_pressFeedbackTimer <= 0f)
                {
                    ApplyVisualState();
                }
            }

            if (_restingCaptured)
            {
                float parentScaleZ = transform.parent != null ? Mathf.Abs(transform.parent.lossyScale.z) : 1f;
                float localPressDepth = pressDepthOffset / Mathf.Max(0.0001f, parentScaleZ);
                float zOffset = _pressFeedbackTimer > 0f ? localPressDepth : (_isHovered ? -localPressDepth * 0.6f : 0f);
                Vector3 target = _restingLocalPos + new Vector3(0f, 0f, zOffset);
                transform.localPosition = Vector3.Lerp(transform.localPosition, target, 1f - Mathf.Exp(-18f * Time.unscaledDeltaTime));
            }
        }

        public void Configure(string label, Image uiBackground, Color idle, Color hover, Color press)
        {
            interactionLabel = label;
            backgroundImage = uiBackground;
            idleColor = idle;
            hoverColor = hover;
            pressColor = press;
            CaptureRestingPosition();
            ApplyVisualState();
        }

        public void OnHoverEnter(VRInteractorContext context)
        {
            _isHovered = true;
            ApplyVisualState();
            ProceduralAudioLibrary.PlayAtPoint(VRSoundEffect.Hover, transform.position, 0.28f);
        }

        public void OnHoverExit(VRInteractorContext context)
        {
            _isHovered = false;
            ApplyVisualState();
        }

        public void OnSelectStart(VRInteractorContext context)
        {
            OnActivate(context);
        }

        public void OnSelectEnd(VRInteractorContext context)
        {
        }

        public void OnActivate(VRInteractorContext context)
        {
            _pressFeedbackTimer = 0.16f;
            ApplyVisualState();
            ProceduralAudioLibrary.PlayAtPoint(VRSoundEffect.Select, transform.position, 0.55f);
            onClicked?.Invoke();
        }

        private void CaptureRestingPosition()
        {
            if (!_restingCaptured)
            {
                _restingLocalPos = transform.localPosition;
                _restingCaptured = true;
            }
        }

        private void ApplyVisualState()
        {
            Color target = _pressFeedbackTimer > 0f ? pressColor : (_isHovered ? hoverColor : idleColor);

            if (backgroundImage != null)
            {
                backgroundImage.color = target;
            }

            if (meshRenderer != null)
            {
                Material mat = Application.isPlaying ? meshRenderer.material : meshRenderer.sharedMaterial;
                if (mat != null)
                {
                    mat.color = target;
                }
            }
        }
    }
}
