using MobileQuestVR.Core;
using UnityEngine;

namespace MobileQuestVR.Interaction
{
    /// <summary>
    /// World-space stereoscopic VR reticle rendered with MobileQuestVR/GazeReticle SDF shader.
    /// Automatically places itself at the hovered surface's 3D depth so both eyes fuse it comfortably
    /// without double vision, and animates a radial dwell progress ring.
    /// </summary>
    public class VRGazeReticle : MonoBehaviour
    {
        private static readonly int PropColor = Shader.PropertyToID("_Color");
        private static readonly int PropProgressColor = Shader.PropertyToID("_ProgressColor");
        private static readonly int PropProgress = Shader.PropertyToID("_Progress");

        [SerializeField] private float defaultDistance = 2.2f;
        [SerializeField] private float angularScale = 0.026f;
        [SerializeField] private float hoverScaleBoost = 1.45f;

        private Transform _quadTransform;
        private Material _reticleMaterial;
        private Renderer _renderer;

        private static readonly Color IdleColor = new Color(0.92f, 0.96f, 1.0f, 0.72f);
        private static readonly Color HoverColor = new Color(0.25f, 0.90f, 1.0f, 0.98f);
        private static readonly Color ProgressColor = new Color(0.18f, 1.0f, 0.62f, 1.0f);

        private void Awake()
        {
            EnsureVisual();
        }

        private void OnDestroy()
        {
            if (_reticleMaterial != null)
            {
                if (Application.isPlaying)
                {
                    Destroy(_reticleMaterial);
                }
                else
                {
                    DestroyImmediate(_reticleMaterial);
                }
            }
        }

        public void SetVisible(bool visible)
        {
            EnsureVisual();
            if (_renderer != null)
            {
                _renderer.enabled = visible;
            }
        }

        public void UpdateReticle(
            Ray ray,
            bool hasHit,
            Vector3 hitPoint,
            Vector3 hitNormal,
            bool hoveringInteractable,
            float dwellProgress)
        {
            EnsureVisual();
            if (_quadTransform == null)
            {
                return;
            }

            float distance = hasHit
                ? Mathf.Clamp(Vector3.Distance(ray.origin, hitPoint) - 0.012f, 0.35f, 12f)
                : defaultDistance;

            Vector3 targetPos = hasHit ? hitPoint + hitNormal * 0.012f : ray.GetPoint(defaultDistance);
            _quadTransform.position = targetPos;

            if (hasHit && hitNormal.sqrMagnitude > 0.01f)
            {
                _quadTransform.rotation = Quaternion.LookRotation(-hitNormal, Vector3.up);
            }
            else
            {
                _quadTransform.rotation = Quaternion.LookRotation(ray.direction, Vector3.up);
            }

            float size = distance * angularScale * (hoveringInteractable ? hoverScaleBoost : 1.0f);
            _quadTransform.localScale = Vector3.one * size;

            if (_reticleMaterial != null)
            {
                _reticleMaterial.SetColor(PropColor, hoveringInteractable ? HoverColor : IdleColor);
                _reticleMaterial.SetColor(PropProgressColor, ProgressColor);
                _reticleMaterial.SetFloat(PropProgress, Mathf.Clamp01(dwellProgress));
            }
        }

        private void EnsureVisual()
        {
            if (_quadTransform != null)
            {
                return;
            }

            GameObject quad = GameObject.CreatePrimitive(PrimitiveType.Quad);
            quad.name = "ReticleQuad";
            quad.transform.SetParent(transform, false);
            quad.layer = VRRuntimeConfig.ResolveLayer(VRRuntimeConfig.LayerNameUI);

            Collider col = quad.GetComponent<Collider>();
            if (col != null)
            {
                if (Application.isPlaying) Destroy(col);
                else DestroyImmediate(col);
            }

            Shader shader = Shader.Find(VRRuntimeConfig.ShaderGazeReticle);
            if (shader == null)
            {
                shader = Shader.Find("UI/Default");
            }

            _reticleMaterial = new Material(shader);
            _renderer = quad.GetComponent<Renderer>();
            _renderer.sharedMaterial = _reticleMaterial;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.receiveShadows = false;
            _quadTransform = quad.transform;
        }
    }
}
