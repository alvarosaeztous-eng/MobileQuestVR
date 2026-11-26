using MobileQuestVR.Core;
using UnityEngine;

namespace MobileQuestVR.HandTracking
{
    /// <summary>
    /// Renders articulated 3D VR hand skeletons (21 joints + 21 bone links + pinch highlight orb)
    /// for both Left and Right hands tracked by VRHandTrackingManager.
    /// </summary>
    public class VRHandVisualizer : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private VRHandTrackingManager handTrackingManager;

        [Header("Visual Style")]
        [SerializeField] private float jointRadius = 0.0085f;
        [SerializeField] private float fingertipRadius = 0.0105f;
        [SerializeField] private float boneThickness = 0.0065f;

        private sealed class HandVisualRig
        {
            public GameObject Root;
            public Transform[] Joints;
            public Transform[] Bones;
            public Transform PinchIndicator;
            public Material JointMaterial;
            public Material BoneMaterial;
            public Material PinchMaterial;
        }

        private HandVisualRig _leftVisual;
        private HandVisualRig _rightVisual;

        private static readonly Color IdleJointColor = new Color(0.24f, 0.80f, 1.0f, 1f);
        private static readonly Color PinchJointColor = new Color(0.18f, 1.0f, 0.56f, 1f);
        private static readonly Color GrabJointColor = new Color(1.0f, 0.62f, 0.16f, 1f);
        private static readonly Color BoneBaseColor = new Color(0.14f, 0.42f, 0.68f, 1f);

        public void Initialize(VRHandTrackingManager manager)
        {
            handTrackingManager = manager;
            EnsureVisualsBuilt();
        }

        private void Start()
        {
            if (handTrackingManager == null)
            {
                handTrackingManager = FindFirstObjectByType<VRHandTrackingManager>();
            }

            EnsureVisualsBuilt();
        }

        private void LateUpdate()
        {
            if (handTrackingManager == null)
            {
                return;
            }

            UpdateHandVisual(_leftVisual, handTrackingManager.LeftHand);
            UpdateHandVisual(_rightVisual, handTrackingManager.RightHand);
        }

        private void EnsureVisualsBuilt()
        {
            if (_leftVisual == null)
            {
                _leftVisual = CreateHandVisualRig("LeftVRHandVisual");
            }

            if (_rightVisual == null)
            {
                _rightVisual = CreateHandVisualRig("RightVRHandVisual");
            }
        }

        private HandVisualRig CreateHandVisualRig(string rootName)
        {
            int handsLayer = VRRuntimeConfig.ResolveLayer(VRRuntimeConfig.LayerNameHands);

            GameObject root = new GameObject(rootName);
            root.transform.SetParent(transform, false);
            root.layer = handsLayer;

            Material jointMat = VRRuntimeConfig.CreateRoomMaterial(IdleJointColor, 0.6f, IdleJointColor * 0.25f, 0.35f);
            Material boneMat = VRRuntimeConfig.CreateRoomMaterial(BoneBaseColor, 0.45f, BoneBaseColor * 0.15f, 0.25f);
            Material pinchMat = VRRuntimeConfig.CreateRoomMaterial(PinchJointColor, 0.8f, PinchJointColor * 0.6f, 0.4f);

            Transform[] joints = new Transform[HandSkeletonTopology.LandmarkCount];
            for (int i = 0; i < HandSkeletonTopology.LandmarkCount; i++)
            {
                GameObject sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                sphere.name = $"Joint_{i}_{(HandLandmarkId)i}";
                sphere.transform.SetParent(root.transform, false);
                sphere.layer = handsLayer;
                DestroyCollider(sphere);

                bool isTip = i == (int)HandLandmarkId.ThumbTip
                    || i == (int)HandLandmarkId.IndexTip
                    || i == (int)HandLandmarkId.MiddleTip
                    || i == (int)HandLandmarkId.RingTip
                    || i == (int)HandLandmarkId.PinkyTip;

                float diameter = (isTip ? fingertipRadius : jointRadius) * 2f;
                sphere.transform.localScale = Vector3.one * diameter;

                Renderer rend = sphere.GetComponent<Renderer>();
                rend.sharedMaterial = jointMat;
                rend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                joints[i] = sphere.transform;
            }

            int boneCount = HandSkeletonTopology.BoneConnections.Length;
            Transform[] bones = new Transform[boneCount];
            for (int b = 0; b < boneCount; b++)
            {
                GameObject cyl = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                cyl.name = $"Bone_{b}";
                cyl.transform.SetParent(root.transform, false);
                cyl.layer = handsLayer;
                DestroyCollider(cyl);

                Renderer rend = cyl.GetComponent<Renderer>();
                rend.sharedMaterial = boneMat;
                rend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                bones[b] = cyl.transform;
            }

            GameObject pinchOrb = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            pinchOrb.name = "PinchIndicator";
            pinchOrb.transform.SetParent(root.transform, false);
            pinchOrb.layer = handsLayer;
            DestroyCollider(pinchOrb);
            Renderer pinchRend = pinchOrb.GetComponent<Renderer>();
            pinchRend.sharedMaterial = pinchMat;
            pinchRend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            root.SetActive(false);

            return new HandVisualRig
            {
                Root = root,
                Joints = joints,
                Bones = bones,
                PinchIndicator = pinchOrb.transform,
                JointMaterial = jointMat,
                BoneMaterial = boneMat,
                PinchMaterial = pinchMat
            };
        }

        private void UpdateHandVisual(HandVisualRig visual, TrackedHandPose pose)
        {
            if (visual == null || pose == null)
            {
                return;
            }

            if (!pose.IsTracked)
            {
                if (visual.Root.activeSelf)
                {
                    visual.Root.SetActive(false);
                }
                return;
            }

            if (!visual.Root.activeSelf)
            {
                visual.Root.SetActive(true);
            }

            for (int i = 0; i < HandSkeletonTopology.LandmarkCount; i++)
            {
                visual.Joints[i].position = pose.WorldJoints[i];
            }

            for (int b = 0; b < HandSkeletonTopology.BoneConnections.Length; b++)
            {
                (int fromIdx, int toIdx) = HandSkeletonTopology.BoneConnections[b];
                Vector3 a = pose.WorldJoints[fromIdx];
                Vector3 bPos = pose.WorldJoints[toIdx];
                Vector3 delta = bPos - a;
                float length = delta.magnitude;

                Transform bone = visual.Bones[b];
                bone.position = (a + bPos) * 0.5f;
                if (length > 1e-5f)
                {
                    bone.up = delta / length;
                }
                bone.localScale = new Vector3(boneThickness, length * 0.5f, boneThickness);
            }

            // Gesture color feedback
            Color targetColor = pose.Gesture.IsPinching
                ? PinchJointColor
                : (pose.Gesture.IsGrabbing ? GrabJointColor : IdleJointColor);

            visual.JointMaterial.color = targetColor;
            if (visual.JointMaterial.HasProperty("_EmissionColor"))
            {
                visual.JointMaterial.SetColor("_EmissionColor", targetColor * (pose.Gesture.IsPinching ? 0.55f : 0.2f));
            }

            // Show pinch orb scaled by continuous pinch strength
            bool showPinch = pose.Gesture.PinchStrength > 0.25f;
            visual.PinchIndicator.gameObject.SetActive(showPinch);
            if (showPinch)
            {
                visual.PinchIndicator.position = pose.PinchPoint;
                float scale = Mathf.Lerp(0.010f, 0.024f, pose.Gesture.PinchStrength);
                visual.PinchIndicator.localScale = Vector3.one * scale;
            }
        }

        private static void DestroyCollider(GameObject go)
        {
            Collider col = go.GetComponent<Collider>();
            if (col != null)
            {
                if (Application.isPlaying)
                {
                    Destroy(col);
                }
                else
                {
                    DestroyImmediate(col);
                }
            }
        }
    }
}
