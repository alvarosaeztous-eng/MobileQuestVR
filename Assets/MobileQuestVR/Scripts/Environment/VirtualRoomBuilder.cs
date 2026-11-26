using System.Collections.Generic;
using MobileQuestVR.Core;
using MobileQuestVR.Interaction;
using MobileQuestVR.Rendering;
using UnityEngine;

namespace MobileQuestVR.Environment
{
    /// <summary>
    /// Builds the complete 3D Virtual VR Room (6m x 3.2m x 6m): architecture, lighting,
    /// workbench, spatial depth landmarks, and physics/interactive VR objects.
    /// Safe to execute both at runtime (MobileQuestVRBootstrap) and in Edit Mode (MobileQuestVRSceneBuilder).
    /// </summary>
    public class VirtualRoomBuilder : MonoBehaviour
    {
        public const float RoomWidth = 6.0f;
        public const float RoomDepth = 6.0f;
        public const float RoomHeight = 3.2f;

        [SerializeField] private RoomLightingController lightingController;

        private readonly List<VRGrabbableObject> _grabbables = new List<VRGrabbableObject>();
        private Transform _roomRoot;
        private Transform _telemetryMountPoint;

        public RoomLightingController LightingController => lightingController;
        public IReadOnlyList<VRGrabbableObject> Grabbables => _grabbables;
        public Transform TelemetryMountPoint => _telemetryMountPoint;

        public void BuildOrBindRoom(VRStereoRig stereoRig)
        {
            Transform existing = transform.Find("VirtualRoomGeometry");
            if (existing != null)
            {
                _roomRoot = existing;
                _telemetryMountPoint = _roomRoot.Find("TelemetryWallMount");
                RebindExistingRoomHandlers(stereoRig);
                RefreshGrabbableList();
                return;
            }

            GameObject rootGo = new GameObject("VirtualRoomGeometry");
            rootGo.transform.SetParent(transform, false);
            _roomRoot = rootGo.transform;

            int envLayer = VRRuntimeConfig.ResolveLayer(VRRuntimeConfig.LayerNameEnvironment);
            int interactLayer = VRRuntimeConfig.ResolveLayer(VRRuntimeConfig.LayerNameInteractable);

            List<Renderer> accentStrips = new List<Renderer>();

            // 1. Floor, Ceiling, and Four Architectural Walls
            BuildRoomShell(_roomRoot, envLayer, accentStrips);

            // 2. Architectural Depth Props (Corner Pillars, Rug, Side Shelf, Scenic Window Frame)
            BuildRoomArchitectureDetails(_roomRoot, envLayer, accentStrips);

            // 3. Central VR Workbench / Desk directly in front of the user
            float deskTopY = 0.86f;
            Vector3 deskCenter = new Vector3(0f, 0f, 1.55f);
            BuildWorkbench(_roomRoot, deskCenter, deskTopY, envLayer, accentStrips);

            // 4. Lighting rig
            Light sunLight = FindOrCreateDirectionalLight();
            Light ceilingLight = CreatePointLight(_roomRoot, "CeilingMainLight", new Vector3(0f, RoomHeight - 0.35f, 0.3f), 11f, 1.1f);
            Light deskLight = CreatePointLight(_roomRoot, "DeskAccentLight", new Vector3(0f, deskTopY + 0.9f, deskCenter.z), 5.5f, 1.1f);

            lightingController = GetComponent<RoomLightingController>();
            if (lightingController == null)
            {
                lightingController = gameObject.AddComponent<RoomLightingController>();
            }
            lightingController.BindSceneLights(stereoRig, sunLight, ceilingLight, deskLight, accentStrips);

            // 5. Interactive Objects on the Workbench
            _grabbables.Clear();
            BuildInteractiveObjects(_roomRoot, deskCenter, deskTopY, interactLayer);

            // 6. Telemetry wall mount point on the left-front wall for the live VR diagnostic board
            GameObject mount = new GameObject("TelemetryWallMount");
            mount.transform.SetParent(_roomRoot, false);
            mount.transform.localPosition = new Vector3(-2.78f, 1.72f, 1.15f);
            mount.transform.localRotation = Quaternion.Euler(0f, -68f, 0f);
            _telemetryMountPoint = mount.transform;
        }

        public void ResetAllInteractiveObjects()
        {
            RefreshGrabbableList();
            for (int i = 0; i < _grabbables.Count; i++)
            {
                if (_grabbables[i] != null)
                {
                    _grabbables[i].ResetToHomePose();
                }
            }
        }

        private void RefreshGrabbableList()
        {
            _grabbables.Clear();
            if (_roomRoot != null)
            {
                _grabbables.AddRange(_roomRoot.GetComponentsInChildren<VRGrabbableObject>(true));
            }
        }

        private void RebindExistingRoomHandlers(VRStereoRig stereoRig)
        {
            lightingController = GetComponent<RoomLightingController>();
            if (lightingController == null)
            {
                lightingController = gameObject.AddComponent<RoomLightingController>();
            }

            Light sunLight = FindOrCreateDirectionalLight();
            Transform ceilingTf = _roomRoot.Find("CeilingMainLight");
            Light ceilingLight = ceilingTf != null ? ceilingTf.GetComponent<Light>() : null;
            Transform deskTf = _roomRoot.Find("DeskAccentLight");
            Light deskLight = deskTf != null ? deskTf.GetComponent<Light>() : null;

            List<Renderer> accentStrips = new List<Renderer>();
            string[] stripNames = { "AccentStrip_Front", "AccentStrip_Left", "AccentStrip_Right", "CeilingSkylightPanel", "WindowPane" };
            foreach (string stripName in stripNames)
            {
                Transform tf = _roomRoot.Find(stripName);
                if (tf != null && tf.TryGetComponent(out Renderer rend))
                {
                    accentStrips.Add(rend);
                }
            }

            Transform deskEdge = _roomRoot.Find("VRWorkbench/DeskEdgeAccent");
            if (deskEdge != null && deskEdge.TryGetComponent(out Renderer deskRend))
            {
                accentStrips.Add(deskRend);
            }

            lightingController.BindSceneLights(stereoRig, sunLight, ceilingLight, deskLight, accentStrips);

            // Re-wire non-serialized runtime event listeners for baked scenes
            Transform lampTf = _roomRoot.Find("InteractiveObjects/Interactive_RoomLightingLamp");
            if (lampTf != null && lampTf.TryGetComponent(out VRToggleInteractable lampToggle))
            {
                lampToggle.onActivated.RemoveAllListeners();
                lampToggle.onActivated.AddListener(() => lightingController?.CyclePreset());
            }

            Transform pedTf = _roomRoot.Find("InteractiveObjects/Interactive_HologramPedestal");
            if (pedTf != null &&
                pedTf.TryGetComponent(out VRToggleInteractable pedToggle) &&
                pedTf.TryGetComponent(out HologramPedestal pedestal))
            {
                pedToggle.onStateChanged.RemoveAllListeners();
                pedToggle.onStateChanged.AddListener(pedestal.SetTurboMode);
            }
        }

        private void BuildRoomShell(Transform parent, int envLayer, List<Renderer> accentStrips)
        {
            Material floorMat = VRRuntimeConfig.CreateRoomMaterial(
                new Color(0.14f, 0.17f, 0.22f, 1f),
                smoothness: 0.42f,
                rimStrength: 0.05f,
                gridScale: 1.0f,
                gridStrength: 0.35f,
                gridColor: new Color(0.24f, 0.46f, 0.72f, 1f));

            Material wallMat = VRRuntimeConfig.CreateRoomMaterial(
                new Color(0.22f, 0.26f, 0.32f, 1f),
                smoothness: 0.22f,
                rimStrength: 0.04f,
                gridScale: 0.5f,
                gridStrength: 0.12f,
                gridColor: new Color(0.32f, 0.40f, 0.52f, 1f));

            Material ceilingMat = VRRuntimeConfig.CreateRoomMaterial(
                new Color(0.17f, 0.20f, 0.26f, 1f),
                smoothness: 0.18f,
                rimStrength: 0.02f);

            Material trimMat = VRRuntimeConfig.CreateRoomMaterial(
                new Color(0.10f, 0.12f, 0.16f, 1f),
                smoothness: 0.5f,
                rimStrength: 0.08f);

            Material accentMat = VRRuntimeConfig.CreateRoomMaterial(
                new Color(0.22f, 0.76f, 1.0f, 1f),
                smoothness: 0.8f,
                emission: new Color(0.20f, 0.72f, 1.0f, 1f),
                rimStrength: 0.2f);

            float wallThick = 0.16f;
            float halfW = RoomWidth * 0.5f;
            float halfD = RoomDepth * 0.5f;
            float halfH = RoomHeight * 0.5f;

            // Floor & Ceiling
            CreateBox(parent, "Floor", new Vector3(0f, -0.08f, 0f), new Vector3(RoomWidth + wallThick * 2f, 0.16f, RoomDepth + wallThick * 2f), floorMat, envLayer);
            CreateBox(parent, "Ceiling", new Vector3(0f, RoomHeight + 0.08f, 0f), new Vector3(RoomWidth + wallThick * 2f, 0.16f, RoomDepth + wallThick * 2f), ceilingMat, envLayer);

            // Four walls
            CreateBox(parent, "Wall_Front", new Vector3(0f, halfH, halfD + wallThick * 0.5f), new Vector3(RoomWidth, RoomHeight, wallThick), wallMat, envLayer);
            CreateBox(parent, "Wall_Back", new Vector3(0f, halfH, -halfD - wallThick * 0.5f), new Vector3(RoomWidth, RoomHeight, wallThick), wallMat, envLayer);
            CreateBox(parent, "Wall_Left", new Vector3(-halfW - wallThick * 0.5f, halfH, 0f), new Vector3(wallThick, RoomHeight, RoomDepth), wallMat, envLayer);
            CreateBox(parent, "Wall_Right", new Vector3(halfW + wallThick * 0.5f, halfH, 0f), new Vector3(wallThick, RoomHeight, RoomDepth), wallMat, envLayer);

            // Baseboard trim
            CreateBox(parent, "Trim_Front", new Vector3(0f, 0.07f, halfD - 0.02f), new Vector3(RoomWidth, 0.14f, 0.04f), trimMat, envLayer, withCollider: false);
            CreateBox(parent, "Trim_Back", new Vector3(0f, 0.07f, -halfD + 0.02f), new Vector3(RoomWidth, 0.14f, 0.04f), trimMat, envLayer, withCollider: false);
            CreateBox(parent, "Trim_Left", new Vector3(-halfW + 0.02f, 0.07f, 0f), new Vector3(0.04f, 0.14f, RoomDepth), trimMat, envLayer, withCollider: false);
            CreateBox(parent, "Trim_Right", new Vector3(halfW - 0.02f, 0.07f, 0f), new Vector3(0.04f, 0.14f, RoomDepth), trimMat, envLayer, withCollider: false);

            // Glowing architectural accent strips along upper wall perimeter & skylight frame
            GameObject stripFront = CreateBox(parent, "AccentStrip_Front", new Vector3(0f, RoomHeight - 0.18f, halfD - 0.03f), new Vector3(RoomWidth - 0.6f, 0.04f, 0.03f), new Material(accentMat), envLayer, withCollider: false);
            GameObject stripLeft = CreateBox(parent, "AccentStrip_Left", new Vector3(-halfW + 0.03f, RoomHeight - 0.18f, 0f), new Vector3(0.03f, 0.04f, RoomDepth - 0.6f), new Material(accentMat), envLayer, withCollider: false);
            GameObject stripRight = CreateBox(parent, "AccentStrip_Right", new Vector3(halfW - 0.03f, RoomHeight - 0.18f, 0f), new Vector3(0.03f, 0.04f, RoomDepth - 0.6f), new Material(accentMat), envLayer, withCollider: false);
            GameObject ceilingPanel = CreateBox(parent, "CeilingSkylightPanel", new Vector3(0f, RoomHeight - 0.03f, 0.3f), new Vector3(2.4f, 0.04f, 1.8f), new Material(accentMat), envLayer, withCollider: false);

            accentStrips.Add(stripFront.GetComponent<Renderer>());
            accentStrips.Add(stripLeft.GetComponent<Renderer>());
            accentStrips.Add(stripRight.GetComponent<Renderer>());
            accentStrips.Add(ceilingPanel.GetComponent<Renderer>());
        }

        private void BuildRoomArchitectureDetails(Transform parent, int envLayer, List<Renderer> accentStrips)
        {
            Material pillarMat = VRRuntimeConfig.CreateRoomMaterial(new Color(0.15f, 0.18f, 0.24f, 1f), 0.45f, rimStrength: 0.1f);
            Material rugMat = VRRuntimeConfig.CreateRoomMaterial(new Color(0.12f, 0.22f, 0.30f, 1f), 0.15f, rimStrength: 0.05f);
            Material woodMat = VRRuntimeConfig.CreateRoomMaterial(new Color(0.38f, 0.25f, 0.16f, 1f), 0.35f, rimStrength: 0.08f);
            Material windowGlowMat = VRRuntimeConfig.CreateRoomMaterial(
                new Color(0.28f, 0.56f, 0.85f, 1f),
                0.7f,
                emission: new Color(0.16f, 0.36f, 0.62f, 1f));

            float halfW = RoomWidth * 0.5f - 0.14f;
            float halfD = RoomDepth * 0.5f - 0.14f;

            // Four corner structural pillars
            Vector3[] pillarCoords =
            {
                new Vector3(-halfW, RoomHeight * 0.5f, halfD),
                new Vector3(halfW, RoomHeight * 0.5f, halfD),
                new Vector3(-halfW, RoomHeight * 0.5f, -halfD),
                new Vector3(halfW, RoomHeight * 0.5f, -halfD)
            };

            for (int i = 0; i < pillarCoords.Length; i++)
            {
                CreateBox(parent, $"CornerPillar_{i}", pillarCoords[i], new Vector3(0.26f, RoomHeight, 0.26f), pillarMat, envLayer);
            }

            // Floor area rug grounding the player's standing area and workbench
            CreateBox(parent, "CenterRug", new Vector3(0f, 0.006f, 0.85f), new Vector3(3.1f, 0.012f, 2.8f), rugMat, envLayer, withCollider: false);

            // Panoramic futuristic window bay on Front wall
            CreateBox(parent, "WindowFrame_Outer", new Vector3(0f, 1.78f, RoomDepth * 0.5f - 0.04f), new Vector3(3.3f, 1.45f, 0.08f), pillarMat, envLayer, withCollider: false);
            GameObject windowGlass = CreateBox(parent, "WindowPane", new Vector3(0f, 1.78f, RoomDepth * 0.5f - 0.06f), new Vector3(3.05f, 1.22f, 0.02f), windowGlowMat, envLayer, withCollider: false);
            accentStrips.Add(windowGlass.GetComponent<Renderer>());

            // Right wall display shelf with decorative stereo depth props
            GameObject shelfRoot = new GameObject("RightDisplayShelf");
            shelfRoot.transform.SetParent(parent, false);
            shelfRoot.transform.localPosition = new Vector3(RoomWidth * 0.5f - 0.26f, 0f, 0.45f);

            CreateBox(shelfRoot.transform, "ShelfBack", new Vector3(0.14f, 1.15f, 0f), new Vector3(0.05f, 2.2f, 1.4f), pillarMat, envLayer);
            for (int level = 0; level < 4; level++)
            {
                float y = 0.42f + level * 0.52f;
                CreateBox(shelfRoot.transform, $"ShelfBoard_{level}", new Vector3(0f, y, 0f), new Vector3(0.32f, 0.04f, 1.35f), woodMat, envLayer);
            }

            // Decorative books / geometric artifacts on shelf for rich peripheral parallax
            Material decorA = VRRuntimeConfig.CreateRoomMaterial(new Color(0.86f, 0.36f, 0.28f, 1f), 0.4f);
            Material decorB = VRRuntimeConfig.CreateRoomMaterial(new Color(0.24f, 0.72f, 0.58f, 1f), 0.5f);
            Material decorC = VRRuntimeConfig.CreateRoomMaterial(new Color(0.84f, 0.68f, 0.24f, 1f), 0.6f);

            CreateBox(shelfRoot.transform, "ShelfArtifact_1", new Vector3(-0.02f, 1.07f, -0.35f), new Vector3(0.14f, 0.24f, 0.08f), decorA, envLayer, withCollider: false);
            CreateBox(shelfRoot.transform, "ShelfArtifact_2", new Vector3(-0.02f, 1.09f, -0.24f), new Vector3(0.15f, 0.28f, 0.07f), decorB, envLayer, withCollider: false);
            CreateBox(shelfRoot.transform, "ShelfArtifact_3", new Vector3(-0.02f, 1.05f, -0.14f), new Vector3(0.14f, 0.20f, 0.08f), decorC, envLayer, withCollider: false);
            CreateSphere(shelfRoot.transform, "ShelfSculpture", new Vector3(-0.02f, 1.60f, 0.22f), 0.18f, decorB, envLayer, withCollider: false);
        }

        private void BuildWorkbench(Transform parent, Vector3 center, float topY, int envLayer, List<Renderer> accentStrips)
        {
            GameObject deskRoot = new GameObject("VRWorkbench");
            deskRoot.transform.SetParent(parent, false);
            deskRoot.transform.localPosition = center;

            Material deskTopMat = VRRuntimeConfig.CreateRoomMaterial(new Color(0.28f, 0.22f, 0.18f, 1f), 0.48f, rimStrength: 0.1f);
            Material legMat = VRRuntimeConfig.CreateRoomMaterial(new Color(0.11f, 0.13f, 0.17f, 1f), 0.65f, rimStrength: 0.12f);
            Material edgeGlowMat = VRRuntimeConfig.CreateRoomMaterial(
                new Color(0.20f, 0.75f, 1.0f, 1f),
                0.8f,
                emission: new Color(0.16f, 0.68f, 1.0f, 1f));

            float width = 1.95f;
            float depth = 0.84f;
            float thickness = 0.06f;

            // Main tabletop with collider
            CreateBox(deskRoot.transform, "TableTop", new Vector3(0f, topY - thickness * 0.5f, 0f), new Vector3(width, thickness, depth), deskTopMat, envLayer);

            // Glowing front bevel strip
            GameObject frontStrip = CreateBox(deskRoot.transform, "DeskEdgeAccent", new Vector3(0f, topY - thickness * 0.5f, -depth * 0.5f - 0.008f), new Vector3(width - 0.08f, 0.016f, 0.016f), edgeGlowMat, envLayer, withCollider: false);
            accentStrips.Add(frontStrip.GetComponent<Renderer>());

            // Four sturdy legs
            float legH = topY - thickness;
            float lx = width * 0.5f - 0.10f;
            float lz = depth * 0.5f - 0.10f;
            CreateBox(deskRoot.transform, "Leg_FL", new Vector3(-lx, legH * 0.5f, -lz), new Vector3(0.07f, legH, 0.07f), legMat, envLayer);
            CreateBox(deskRoot.transform, "Leg_FR", new Vector3(lx, legH * 0.5f, -lz), new Vector3(0.07f, legH, 0.07f), legMat, envLayer);
            CreateBox(deskRoot.transform, "Leg_BL", new Vector3(-lx, legH * 0.5f, lz), new Vector3(0.07f, legH, 0.07f), legMat, envLayer);
            CreateBox(deskRoot.transform, "Leg_BR", new Vector3(lx, legH * 0.5f, lz), new Vector3(0.07f, legH, 0.07f), legMat, envLayer);
        }

        private void BuildInteractiveObjects(Transform parent, Vector3 deskCenter, float deskTopY, int interactLayer)
        {
            GameObject interactRoot = new GameObject("InteractiveObjects");
            interactRoot.transform.SetParent(parent, false);

            // 1. Grabbable Holographic Cube (Center-Left)
            GameObject cube = CreateBox(
                interactRoot.transform,
                "Grabbable_HoloCube",
                new Vector3(deskCenter.x - 0.32f, deskTopY + 0.10f, deskCenter.z - 0.08f),
                Vector3.one * 0.17f,
                VRRuntimeConfig.CreateRoomMaterial(new Color(0.16f, 0.68f, 0.98f, 1f), 0.65f, new Color(0.05f, 0.22f, 0.35f, 1f), 0.35f),
                interactLayer);
            cube.transform.localRotation = Quaternion.Euler(0f, 24f, 0f);
            VRGrabbableObject cubeGrab = AttachGrabbable(cube, "Holo Cube (Grab / Throw)", new Color(0.25f, 0.85f, 1f, 1f), mass: 0.45f, bounciness: 0.35f);
            _grabbables.Add(cubeGrab);

            // 2. Grabbable Bouncy Energy Sphere (Center)
            GameObject sphere = CreateSphere(
                interactRoot.transform,
                "Grabbable_EnergySphere",
                new Vector3(deskCenter.x + 0.02f, deskTopY + 0.105f, deskCenter.z - 0.10f),
                0.18f,
                VRRuntimeConfig.CreateRoomMaterial(new Color(1.0f, 0.62f, 0.16f, 1f), 0.78f, new Color(0.32f, 0.16f, 0.02f, 1f), 0.45f),
                interactLayer);
            VRGrabbableObject sphereGrab = AttachGrabbable(sphere, "Energy Sphere (Bounce)", new Color(1.0f, 0.72f, 0.22f, 1f), mass: 0.35f, bounciness: 0.78f);
            _grabbables.Add(sphereGrab);

            // 3. Grabbable Emerald Prism Block (Center-Back)
            GameObject prism = CreateBox(
                interactRoot.transform,
                "Grabbable_EmeraldBlock",
                new Vector3(deskCenter.x - 0.14f, deskTopY + 0.12f, deskCenter.z + 0.16f),
                new Vector3(0.14f, 0.22f, 0.14f),
                VRRuntimeConfig.CreateRoomMaterial(new Color(0.16f, 0.82f, 0.52f, 1f), 0.60f, new Color(0.03f, 0.22f, 0.12f, 1f), 0.32f),
                interactLayer);
            prism.transform.localRotation = Quaternion.Euler(0f, -18f, 0f);
            VRGrabbableObject prismGrab = AttachGrabbable(prism, "Emerald Monolith (Grab)", new Color(0.20f, 1.0f, 0.62f, 1f), mass: 0.55f, bounciness: 0.28f);
            _grabbables.Add(prismGrab);

            // 4. Interactive Desk Lamp / Room Lighting Mood Switch (Left side of workbench)
            BuildLightingLampSwitch(interactRoot.transform, new Vector3(deskCenter.x - 0.72f, deskTopY, deskCenter.z + 0.04f), interactLayer);

            // 5. Interactive Hologram Orbital Pedestal (Right side of workbench)
            BuildHologramPedestal(interactRoot.transform, new Vector3(deskCenter.x + 0.64f, deskTopY, deskCenter.z + 0.05f), interactLayer);

            // 6. Spatial Audio Chime Pad (Front-Right of workbench)
            BuildAudioChimePad(interactRoot.transform, new Vector3(deskCenter.x + 0.34f, deskTopY, deskCenter.z - 0.20f), interactLayer);
        }

        private void BuildLightingLampSwitch(Transform parent, Vector3 basePos, int interactLayer)
        {
            GameObject lampRoot = new GameObject("Interactive_RoomLightingLamp");
            lampRoot.transform.SetParent(parent, false);
            lampRoot.transform.localPosition = basePos;
            lampRoot.layer = interactLayer;

            Material baseMat = VRRuntimeConfig.CreateRoomMaterial(new Color(0.14f, 0.16f, 0.20f, 1f), 0.6f);
            Material bulbMat = VRRuntimeConfig.CreateRoomMaterial(new Color(0.28f, 0.86f, 1.0f, 1f), 0.85f, new Color(0.24f, 0.75f, 1.0f, 1f), 0.5f);

            CreateCylinder(lampRoot.transform, "LampBase", new Vector3(0f, 0.025f, 0f), new Vector3(0.18f, 0.025f, 0.18f), baseMat, interactLayer, withCollider: false);
            CreateCylinder(lampRoot.transform, "LampStem", new Vector3(0f, 0.17f, 0f), new Vector3(0.032f, 0.14f, 0.032f), baseMat, interactLayer, withCollider: false);
            GameObject bulb = CreateSphere(lampRoot.transform, "LampOrb", new Vector3(0f, 0.34f, 0f), 0.14f, bulbMat, interactLayer, withCollider: false);

            BoxCollider col = lampRoot.AddComponent<BoxCollider>();
            col.center = new Vector3(0f, 0.22f, 0f);
            col.size = new Vector3(0.22f, 0.44f, 0.22f);

            VRToggleInteractable toggle = lampRoot.AddComponent<VRToggleInteractable>();
            toggle.ConfigureToggle(
                "Cycle Room Lighting",
                bulb.GetComponent<Renderer>(),
                activeColor: new Color(1.0f, 0.76f, 0.32f, 1f),
                inactiveColor: new Color(0.24f, 0.84f, 1.0f, 1f),
                initialState: false);

            toggle.onActivated.AddListener(() =>
            {
                if (lightingController != null)
                {
                    lightingController.CyclePreset();
                }
            });
        }

        private void BuildHologramPedestal(Transform parent, Vector3 basePos, int interactLayer)
        {
            GameObject pedRoot = new GameObject("Interactive_HologramPedestal");
            pedRoot.transform.SetParent(parent, false);
            pedRoot.transform.localPosition = basePos;
            pedRoot.layer = interactLayer;

            Material emitterMat = VRRuntimeConfig.CreateRoomMaterial(new Color(0.12f, 0.15f, 0.20f, 1f), 0.65f);
            Material crystalMat = VRRuntimeConfig.CreateRoomMaterial(new Color(0.45f, 0.28f, 1.0f, 1f), 0.85f, new Color(0.32f, 0.18f, 0.85f, 1f), 0.6f);
            Material ringMat = VRRuntimeConfig.CreateHoloMaterial(new Color(0.14f, 0.74f, 1.0f, 0.45f), new Color(0.35f, 0.92f, 1.0f, 0.95f), 0.05f);

            CreateCylinder(pedRoot.transform, "PedestalBase", new Vector3(0f, 0.03f, 0f), new Vector3(0.26f, 0.03f, 0.26f), emitterMat, interactLayer, withCollider: false);

            GameObject core = CreateBox(pedRoot.transform, "HoloCrystal", new Vector3(0f, 0.28f, 0f), Vector3.one * 0.11f, crystalMat, interactLayer, withCollider: false);
            core.transform.localRotation = Quaternion.Euler(45f, 0f, 45f);

            GameObject innerRing = CreateCylinder(pedRoot.transform, "InnerOrbitalRing", new Vector3(0f, 0.28f, 0f), new Vector3(0.22f, 0.006f, 0.22f), ringMat, interactLayer, withCollider: false);
            GameObject outerRing = CreateCylinder(pedRoot.transform, "OuterOrbitalRing", new Vector3(0f, 0.28f, 0f), new Vector3(0.30f, 0.005f, 0.30f), ringMat, interactLayer, withCollider: false);

            BoxCollider col = pedRoot.AddComponent<BoxCollider>();
            col.center = new Vector3(0f, 0.24f, 0f);
            col.size = new Vector3(0.32f, 0.45f, 0.32f);

            HologramPedestal anim = pedRoot.AddComponent<HologramPedestal>();
            anim.Configure(core.transform, innerRing.transform, outerRing.transform);

            VRToggleInteractable toggle = pedRoot.AddComponent<VRToggleInteractable>();
            toggle.ConfigureToggle(
                "Hologram Orbit Speed",
                core.GetComponent<Renderer>(),
                activeColor: new Color(1.0f, 0.32f, 0.85f, 1f),
                inactiveColor: new Color(0.45f, 0.28f, 1.0f, 1f),
                initialState: false);

            toggle.onStateChanged.AddListener(anim.SetTurboMode);
        }

        private void BuildAudioChimePad(Transform parent, Vector3 basePos, int interactLayer)
        {
            GameObject padRoot = new GameObject("Interactive_SpatialChimePad");
            padRoot.transform.SetParent(parent, false);
            padRoot.transform.localPosition = basePos;
            padRoot.layer = interactLayer;

            Material padMat = VRRuntimeConfig.CreateRoomMaterial(new Color(0.18f, 0.82f, 0.72f, 1f), 0.75f, new Color(0.08f, 0.36f, 0.32f, 1f), 0.45f);
            GameObject padMesh = CreateCylinder(padRoot.transform, "ChimeDisk", new Vector3(0f, 0.025f, 0f), new Vector3(0.20f, 0.025f, 0.20f), padMat, interactLayer, withCollider: false);

            BoxCollider col = padRoot.AddComponent<BoxCollider>();
            col.center = new Vector3(0f, 0.04f, 0f);
            col.size = new Vector3(0.22f, 0.08f, 0.22f);

            VRToggleInteractable toggle = padRoot.AddComponent<VRToggleInteractable>();
            toggle.ConfigureToggle(
                "Spatial Audio Chime",
                padMesh.GetComponent<Renderer>(),
                activeColor: new Color(0.35f, 1.0f, 0.75f, 1f),
                inactiveColor: new Color(0.18f, 0.78f, 0.85f, 1f),
                initialState: false,
                chimeSound: true);
        }

        private static VRGrabbableObject AttachGrabbable(GameObject go, string label, Color highlightColor, float mass, float bounciness)
        {
            Rigidbody rb = go.AddComponent<Rigidbody>();
            rb.mass = mass;
            rb.linearDamping = 0.25f;
            rb.angularDamping = 0.35f;
            rb.collisionDetectionMode = CollisionDetectionMode.Continuous;

            Collider col = go.GetComponent<Collider>();
            if (col != null)
            {
                PhysicsMaterial physMat = new PhysicsMaterial($"{go.name}_PhysMat")
                {
                    bounciness = bounciness,
                    dynamicFriction = 0.55f,
                    staticFriction = 0.6f,
                    bounceCombine = PhysicsMaterialCombine.Maximum
                };
                col.sharedMaterial = physMat;
            }

            VRGrabbableObject grabbable = go.AddComponent<VRGrabbableObject>();
            grabbable.ConfigureFeedback(label, highlightColor, 1.05f, dwellEnabled: true);
            grabbable.RecordHomePose();
            return grabbable;
        }

        private static Light FindOrCreateDirectionalLight()
        {
            Light[] lights = FindObjectsByType<Light>(FindObjectsSortMode.None);
            foreach (Light l in lights)
            {
                if (l.type == LightType.Directional)
                {
                    l.transform.rotation = Quaternion.Euler(46f, -32f, 0f);
                    l.shadows = LightShadows.Soft;
                    return l;
                }
            }

            GameObject sunGo = new GameObject("RoomDirectionalLight");
            sunGo.transform.rotation = Quaternion.Euler(46f, -32f, 0f);
            Light sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;
            sun.intensity = 1.15f;
            return sun;
        }

        private static Light CreatePointLight(Transform parent, string lightName, Vector3 localPos, float range, float intensity)
        {
            GameObject go = new GameObject(lightName);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            Light l = go.AddComponent<Light>();
            l.type = LightType.Point;
            l.range = range;
            l.intensity = intensity;
            l.shadows = LightShadows.None; // Keep shadows on directional light for high Android mobile VR framerate
            return l;
        }

        private static GameObject CreateBox(Transform parent, string objName, Vector3 localPos, Vector3 scale, Material mat, int layer, bool withCollider = true)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = objName;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = scale;
            go.layer = layer;
            go.GetComponent<Renderer>().sharedMaterial = mat;
            if (!withCollider)
            {
                RemoveCollider(go);
            }
            return go;
        }

        private static GameObject CreateSphere(Transform parent, string objName, Vector3 localPos, float diameter, Material mat, int layer, bool withCollider = true)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = objName;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = Vector3.one * diameter;
            go.layer = layer;
            go.GetComponent<Renderer>().sharedMaterial = mat;
            if (!withCollider)
            {
                RemoveCollider(go);
            }
            return go;
        }

        private static GameObject CreateCylinder(Transform parent, string objName, Vector3 localPos, Vector3 scale, Material mat, int layer, bool withCollider = true)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = objName;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = scale;
            go.layer = layer;
            go.GetComponent<Renderer>().sharedMaterial = mat;
            if (!withCollider)
            {
                RemoveCollider(go);
            }
            return go;
        }

        private static void RemoveCollider(GameObject go)
        {
            Collider col = go.GetComponent<Collider>();
            if (col != null)
            {
                if (Application.isPlaying) Destroy(col);
                else DestroyImmediate(col);
            }
        }
    }
}
