using MobileQuestVR.Core;
using UnityEngine;
using UnityEngine.Events;

namespace MobileQuestVR.Interaction
{
    /// <summary>
    /// Stateful 3D VR toggle object (such as a desk lamp switch, hologram speed control, or sound pad).
    /// </summary>
    public class VRToggleInteractable : VRInteractableBase
    {
        [Header("Toggle State")]
        [SerializeField] private bool isOn;
        [SerializeField] private Renderer indicatorRenderer;
        [SerializeField] private Color offColor = new Color(0.28f, 0.34f, 0.42f, 1f);
        [SerializeField] private Color onColor = new Color(0.20f, 0.90f, 1.0f, 1f);
        [SerializeField] private bool useChimeAudio;

        public UnityEvent<bool> onStateChanged = new UnityEvent<bool>();

        public bool IsOn => isOn;

        public void ConfigureToggle(
            string label,
            Renderer indicator,
            Color activeColor,
            Color inactiveColor,
            bool initialState = false,
            bool chimeSound = false)
        {
            indicatorRenderer = indicator;
            onColor = activeColor;
            offColor = inactiveColor;
            isOn = initialState;
            useChimeAudio = chimeSound;
            ConfigureFeedback(label, activeColor, 1.05f, dwellEnabled: true);
            ApplyIndicatorVisual();
        }

        public override void OnActivate(VRInteractorContext context)
        {
            isOn = !isOn;
            ApplyIndicatorVisual();

            VRSoundEffect sound = useChimeAudio
                ? VRSoundEffect.Chime
                : (isOn ? VRSoundEffect.ToggleOn : VRSoundEffect.ToggleOff);
            ProceduralAudioLibrary.PlayAtPoint(sound, transform.position, 0.6f);

            onStateChanged?.Invoke(isOn);
            onActivated?.Invoke();
        }

        public void SetStateSilent(bool newState)
        {
            isOn = newState;
            ApplyIndicatorVisual();
        }

        private void ApplyIndicatorVisual()
        {
            if (indicatorRenderer == null)
            {
                return;
            }

            Material mat = Application.isPlaying ? indicatorRenderer.material : indicatorRenderer.sharedMaterial;
            if (mat == null)
            {
                return;
            }

            Color col = isOn ? onColor : offColor;
            mat.color = col;
            if (mat.HasProperty("_EmissionColor"))
            {
                mat.SetColor("_EmissionColor", isOn ? onColor * 0.65f : Color.black);
            }

            RefreshBaseEmissionCache();
        }
    }
}
