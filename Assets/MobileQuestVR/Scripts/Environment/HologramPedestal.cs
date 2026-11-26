using UnityEngine;

namespace MobileQuestVR.Environment
{
    /// <summary>
    /// Animates the floating stereoscopic hologram centerpiece on the VR workbench.
    /// Provides strong binocular depth parallax and interactive speed toggling.
    /// </summary>
    public class HologramPedestal : MonoBehaviour
    {
        [SerializeField] private Transform coreCrystal;
        [SerializeField] private Transform innerRing;
        [SerializeField] private Transform outerRing;
        [SerializeField] private bool turboMode;

        private Vector3 _coreBaseLocalPos;
        private bool _capturedBase;

        public bool TurboMode => turboMode;

        public void Configure(Transform core, Transform inner, Transform outer)
        {
            coreCrystal = core;
            innerRing = inner;
            outerRing = outer;
            if (coreCrystal != null)
            {
                _coreBaseLocalPos = coreCrystal.localPosition;
                _capturedBase = true;
            }
        }

        public void SetTurboMode(bool enabled)
        {
            turboMode = enabled;
        }

        private void Update()
        {
            float dt = Time.deltaTime;
            float speedMult = turboMode ? 3.2f : 1.0f;

            if (coreCrystal != null)
            {
                if (!_capturedBase)
                {
                    _coreBaseLocalPos = coreCrystal.localPosition;
                    _capturedBase = true;
                }

                coreCrystal.Rotate(Vector3.up, 42f * speedMult * dt, Space.Self);
                coreCrystal.Rotate(Vector3.right, 18f * speedMult * dt, Space.Self);
                float bob = Mathf.Sin(Time.time * (turboMode ? 4.5f : 2.0f)) * 0.025f;
                coreCrystal.localPosition = _coreBaseLocalPos + new Vector3(0f, bob, 0f);
            }

            if (innerRing != null)
            {
                innerRing.Rotate(new Vector3(34f, 60f, 15f) * (speedMult * dt), Space.Self);
            }

            if (outerRing != null)
            {
                outerRing.Rotate(new Vector3(-22f, -38f, 26f) * (speedMult * dt), Space.Self);
            }
        }
    }
}
