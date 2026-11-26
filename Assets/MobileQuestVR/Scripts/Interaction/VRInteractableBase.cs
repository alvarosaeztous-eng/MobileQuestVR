using MobileQuestVR.Core;
using UnityEngine;
using UnityEngine.Events;

namespace MobileQuestVR.Interaction
{
    /// <summary>
    /// Base class for interactive VR objects providing hover emission highlight, subtle scale feedback,
    /// procedural spatial audio, and UnityEvent hooks.
    /// </summary>
    public abstract class VRInteractableBase : MonoBehaviour, IVRInteractable
    {
        [Header("Interaction Metadata")]
        [SerializeField] private string interactionLabel = "Interactive Object";
        [SerializeField] private bool supportsDwellActivation = true;

        [Header("Visual & Audio Feedback")]
        [SerializeField] private Renderer[] highlightRenderers;
        [SerializeField] private Color hoverEmissionColor = new Color(0.18f, 0.55f, 0.85f, 1f);
        [SerializeField] private float hoverScaleMultiplier = 1.045f;
        [SerializeField] private float feedbackLerpSpeed = 12f;
        [SerializeField] private bool playAudioFeedback = true;

        [Header("Events")]
        public UnityEvent onHoverEnter = new UnityEvent();
        public UnityEvent onHoverExit = new UnityEvent();
        public UnityEvent onActivated = new UnityEvent();

        private Vector3 _baseScale = Vector3.one;
        private Color[] _baseEmissions;
        private bool _isHovered;
        private bool _initializedFeedback;

        public string InteractionLabel
        {
            get => interactionLabel;
            set => interactionLabel = value;
        }

        public virtual bool CanGrab => false;
        public virtual bool SupportsDwellActivation => supportsDwellActivation;
        public Transform Transform => transform;
        public bool IsHovered => _isHovered;

        protected virtual void Awake()
        {
            InitializeFeedbackCache();
        }

        protected virtual void Update()
        {
            if (!_initializedFeedback)
            {
                return;
            }

            Vector3 targetScale = _isHovered ? _baseScale * hoverScaleMultiplier : _baseScale;
            transform.localScale = Vector3.Lerp(transform.localScale, targetScale, 1f - Mathf.Exp(-feedbackLerpSpeed * Time.unscaledDeltaTime));
        }

        public void ConfigureFeedback(string label, Color emissionHighlight, float scaleMultiplier = 1.045f, bool dwellEnabled = true)
        {
            interactionLabel = label;
            hoverEmissionColor = emissionHighlight;
            hoverScaleMultiplier = scaleMultiplier;
            supportsDwellActivation = dwellEnabled;
            InitializeFeedbackCache(forceRefresh: true);
        }

        public virtual void OnHoverEnter(VRInteractorContext context)
        {
            InitializeFeedbackCache();
            if (_isHovered)
            {
                return;
            }

            _isHovered = true;
            ApplyEmissionHighlight(true);

            if (playAudioFeedback)
            {
                ProceduralAudioLibrary.PlayAtPoint(VRSoundEffect.Hover, transform.position, 0.35f);
            }

            onHoverEnter?.Invoke();
        }

        public virtual void OnHoverExit(VRInteractorContext context)
        {
            if (!_isHovered)
            {
                return;
            }

            _isHovered = false;
            ApplyEmissionHighlight(false);
            onHoverExit?.Invoke();
        }

        public virtual void OnSelectStart(VRInteractorContext context)
        {
            OnActivate(context);
        }

        public virtual void OnSelectEnd(VRInteractorContext context)
        {
        }

        public virtual void OnActivate(VRInteractorContext context)
        {
            if (playAudioFeedback)
            {
                ProceduralAudioLibrary.PlayAtPoint(VRSoundEffect.Select, transform.position, 0.55f);
            }

            onActivated?.Invoke();
        }

        protected void RefreshBaseEmissionCache()
        {
            InitializeFeedbackCache(forceRefresh: true);
        }

        private void InitializeFeedbackCache(bool forceRefresh = false)
        {
            if (_initializedFeedback && !forceRefresh)
            {
                return;
            }

            _baseScale = transform.localScale;
            if (highlightRenderers == null || highlightRenderers.Length == 0 || forceRefresh)
            {
                highlightRenderers = GetComponentsInChildren<Renderer>();
            }

            _baseEmissions = new Color[highlightRenderers.Length];
            for (int i = 0; i < highlightRenderers.Length; i++)
            {
                Renderer r = highlightRenderers[i];
                if (r == null)
                {
                    continue;
                }

                Material mat = Application.isPlaying ? r.material : r.sharedMaterial;
                if (mat != null && mat.HasProperty("_EmissionColor"))
                {
                    _baseEmissions[i] = mat.GetColor("_EmissionColor");
                }
            }

            _initializedFeedback = true;
        }

        private void ApplyEmissionHighlight(bool highlighted)
        {
            if (highlightRenderers == null || _baseEmissions == null)
            {
                return;
            }

            for (int i = 0; i < highlightRenderers.Length && i < _baseEmissions.Length; i++)
            {
                Renderer r = highlightRenderers[i];
                if (r == null)
                {
                    continue;
                }

                Material mat = Application.isPlaying ? r.material : r.sharedMaterial;
                if (mat == null || !mat.HasProperty("_EmissionColor"))
                {
                    continue;
                }

                Color target = highlighted ? _baseEmissions[i] + hoverEmissionColor * 0.45f : _baseEmissions[i];
                mat.SetColor("_EmissionColor", target);
            }
        }
    }
}
