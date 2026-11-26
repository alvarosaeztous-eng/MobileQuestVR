import * as THREE from '../vendor/three/three.module.min.js';

export const LIGHTING_PRESETS = [
  {
    id: 'studio_cyber',
    name: 'Studio Cyber',
    bgHex: 0x070d1a,
    fogHex: 0x070d1a,
    hemiSky: 0x8cc8ff,
    hemiGround: 0x1a2235,
    hemiIntensity: 0.95,
    dirColor: 0xeef6ff,
    dirIntensity: 1.35,
    pointColor: 0x2fd6ff,
    pointIntensity: 2.1,
    accentHex: 0x26d8ff,
    windowTop: '#06152f',
    windowBottom: '#133a6b',
  },
  {
    id: 'sunset_lounge',
    name: 'Warm Lounge',
    bgHex: 0x120912,
    fogHex: 0x140a14,
    hemiSky: 0xffb380,
    hemiGround: 0x261522,
    hemiIntensity: 0.9,
    dirColor: 0xffcfa3,
    dirIntensity: 1.2,
    pointColor: 0xff8c42,
    pointIntensity: 2.4,
    accentHex: 0xff7b39,
    windowTop: '#1a0a28',
    windowBottom: '#6e2c3f',
  },
  {
    id: 'deep_neon',
    name: 'Deep Neon',
    bgHex: 0x040510,
    fogHex: 0x050614,
    hemiSky: 0x6280ff,
    hemiGround: 0x140b28,
    hemiIntensity: 0.72,
    dirColor: 0x8ab4ff,
    dirIntensity: 0.85,
    pointColor: 0xb642ff,
    pointIntensity: 2.9,
    accentHex: 0x23f0ff,
    windowTop: '#040514',
    windowBottom: '#2a1154',
  },
];

/**
 * Builds the futuristic 3D VR Room (6.4m x 3.4m x 6.4m) with procedural architectural textures,
 * panoramic starfield vista window, workbench, lighting moods, and interactive physics objects.
 */
export class VirtualRoom {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;

    this.roomWidth = 6.4;
    this.roomDepth = 6.4;
    this.roomHeight = 3.4;

    this.deskTopY = 0.88;
    this.deskCenter = new THREE.Vector3(0, 0, -1.55);
    this.deskHalfW = 1.05;
    this.deskHalfD = 0.44;

    this.root = new THREE.Group();
    this.root.name = 'VirtualRoom';
    this.scene.add(this.root);

    // Separate environment shell group so Passthrough mode can hide opaque room walls
    // while keeping floating interactive objects and hologram props overlaid over real camera video
    this.environmentGroup = new THREE.Group();
    this.environmentGroup.name = 'RoomEnvironmentShell';
    this.root.add(this.environmentGroup);

    this.interactables = [];
    this.grabbables = [];
    this.accentMaterials = [];

    this.passthroughMode = false;
    this.currentPresetIndex = 0;
    this.hologramTurbo = false;
    this._chimePulse = 0;

    this._buildLights();
    this._buildShell();
    this._buildPanoramicVista();
    this._buildArchitecturalDetails();
    this._buildWorkbench();
    this._buildInteractiveObjects();

    this.telemetryMount = new THREE.Object3D();
    this.telemetryMount.position.set(-2.96, 1.78, -1.15);
    this.telemetryMount.rotation.set(0, Math.PI * 0.36, 0);
    this.root.add(this.telemetryMount);

    this.applyLightingPreset(0);
  }

  get currentPreset() {
    return LIGHTING_PRESETS[this.currentPresetIndex];
  }

  cycleLightingPreset() {
    const next = (this.currentPresetIndex + 1) % LIGHTING_PRESETS.length;
    this.applyLightingPreset(next);
    return this.currentPreset;
  }

  applyLightingPreset(index) {
    this.currentPresetIndex = index % LIGHTING_PRESETS.length;
    const p = this.currentPreset;

    if (!this.passthroughMode) {
      this.scene.background = new THREE.Color(p.bgHex);
      this.scene.fog = new THREE.FogExp2(p.fogHex, 0.048);
    }

    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;

    this.dirLight.color.setHex(p.dirColor);
    this.dirLight.intensity = p.dirIntensity;

    this.deskLight.color.setHex(p.pointColor);
    this.deskLight.intensity = p.pointIntensity;

    for (const mat of this.accentMaterials) {
      mat.color.setHex(p.accentHex);
      if (mat.emissive) {
        mat.emissive.setHex(p.accentHex);
      }
    }

    if (this._vistaSkyCanvas) {
      this._redrawVistaBackdrop(p.windowTop, p.windowBottom);
    }
  }

  /**
   * Switches between the full futuristic 3D Virtual Room and Mixed Reality Passthrough overlay
   * (hiding opaque walls/floor/ceiling while keeping a sleek translucent holo-tray under the 3D objects).
   */
  setPassthroughMode(enabled) {
    this.passthroughMode = Boolean(enabled);
    this.environmentGroup.visible = !this.passthroughMode;

    if (this._deskTopMat) {
      this._deskTopMat.transparent = this.passthroughMode;
      this._deskTopMat.opacity = this.passthroughMode ? 0.34 : 1.0;
      this._deskTopMat.needsUpdate = true;
    }
    if (this._deskLegsGroup) {
      this._deskLegsGroup.visible = !this.passthroughMode;
    }

    if (this.passthroughMode) {
      this.scene.background = null;
      this.scene.fog = null;
    } else {
      const p = this.currentPreset;
      this.scene.background = new THREE.Color(p.bgHex);
      this.scene.fog = new THREE.FogExp2(p.fogHex, 0.048);
    }
  }

  resetAllGrabbables() {
    for (const item of this.grabbables) {
      item.resetToHome();
    }
    this.audio.play('release');
  }

  update(dt, elapsed) {
    // Animate floating hologram pedestal
    const speed = this.hologramTurbo ? 3.4 : 1.0;
    if (this._holoCore) {
      this._holoCore.rotation.y += 0.85 * speed * dt;
      this._holoCore.rotation.x += 0.42 * speed * dt;
      this._holoCore.position.y = 0.30 + Math.sin(elapsed * (this.hologramTurbo ? 5.0 : 2.1)) * 0.025;
    }
    if (this._holoRingA) {
      this._holoRingA.rotation.x += 0.7 * speed * dt;
      this._holoRingA.rotation.y += 1.15 * speed * dt;
    }
    if (this._holoRingB) {
      this._holoRingB.rotation.z -= 0.65 * speed * dt;
      this._holoRingB.rotation.y -= 0.9 * speed * dt;
    }

    // Gentle drift on panoramic stars
    if (this._starPoints) {
      this._starPoints.rotation.y = elapsed * 0.015;
    }

    // Ripple animation on audio chime pad
    if (this._chimeRing && this._chimePulse > 0) {
      this._chimePulse = Math.max(0, this._chimePulse - dt * 1.9);
      const t = 1 - this._chimePulse;
      const scale = 1 + t * 1.9;
      this._chimeRing.scale.set(scale, scale, 1);
      this._chimeRing.material.opacity = this._chimePulse * 0.9;
    }

    // Step simple lightweight physics for all ungrabbed objects (gravity + desk/floor/wall collisions)
    this._stepPhysics(dt);
  }

  _stepPhysics(dt) {
    const safeDt = Math.min(dt, 0.04);
    const gravity = -9.81;
    const halfRoomW = this.roomWidth * 0.5 - 0.14;
    const halfRoomD = this.roomDepth * 0.5 - 0.14;

    for (const item of this.grabbables) {
      if (item.isGrabbed) continue;
      const mesh = item.mesh;
      const vel = item.velocity;
      const r = item.radius;

      // Apply gravity & integrate
      vel.y += gravity * safeDt;
      mesh.position.addScaledVector(vel, safeDt);

      // Rotate gently while moving in air
      if (vel.lengthSq() > 0.01) {
        mesh.rotation.x += item.angularVelocity.x * safeDt;
        mesh.rotation.y += item.angularVelocity.y * safeDt;
        mesh.rotation.z += item.angularVelocity.z * safeDt;
      }

      // Desk tabletop collision
      const overDesk =
        Math.abs(mesh.position.x - this.deskCenter.x) <= this.deskHalfW + r * 0.45 &&
        Math.abs(mesh.position.z - this.deskCenter.z) <= this.deskHalfD + r * 0.45;

      if (overDesk && mesh.position.y - r <= this.deskTopY && mesh.position.y >= this.deskTopY - 0.18 && vel.y <= 0) {
        mesh.position.y = this.deskTopY + r;
        if (Math.abs(vel.y) > 0.55) {
          vel.y = -vel.y * item.bounciness;
        } else {
          vel.y = 0;
        }
        vel.x *= 0.86;
        vel.z *= 0.86;
        item.angularVelocity.multiplyScalar(0.84);
      }

      // Floor collision
      if (mesh.position.y - r < 0) {
        mesh.position.y = r;
        if (Math.abs(vel.y) > 0.5) {
          vel.y = -vel.y * item.bounciness;
        } else {
          vel.y = 0;
        }
        vel.x *= 0.88;
        vel.z *= 0.88;
        item.angularVelocity.multiplyScalar(0.86);
      }

      // Ceiling clamp
      if (mesh.position.y + r > this.roomHeight - 0.06) {
        mesh.position.y = this.roomHeight - 0.06 - r;
        vel.y = -Math.abs(vel.y) * 0.4;
      }

      // Room wall bounce
      if (mesh.position.x < -halfRoomW + r) {
        mesh.position.x = -halfRoomW + r;
        vel.x = Math.abs(vel.x) * item.bounciness;
      } else if (mesh.position.x > halfRoomW - r) {
        mesh.position.x = halfRoomW - r;
        vel.x = -Math.abs(vel.x) * item.bounciness;
      }

      if (mesh.position.z < -halfRoomD + r) {
        mesh.position.z = -halfRoomD + r;
        vel.z = Math.abs(vel.z) * item.bounciness;
      } else if (mesh.position.z > halfRoomD - r) {
        mesh.position.z = halfRoomD - r;
        vel.z = -Math.abs(vel.z) * item.bounciness;
      }

      // Settle tiny jitter
      if (vel.lengthSq() < 0.0004 && (mesh.position.y <= r + 0.005 || (overDesk && Math.abs(mesh.position.y - (this.deskTopY + r)) < 0.005))) {
        vel.set(0, 0, 0);
        item.angularVelocity.set(0, 0, 0);
      }
    }
  }

  _buildLights() {
    this.hemiLight = new THREE.HemisphereLight(0x8cc8ff, 0x1a2235, 0.95);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xeef6ff, 1.35);
    this.dirLight.position.set(2.2, 4.4, 1.6);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(1024, 1024);
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 14;
    const d = 3.8;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0008;
    this.scene.add(this.dirLight);

    this.deskLight = new THREE.PointLight(0x2fd6ff, 2.1, 7.5, 1.6);
    this.deskLight.position.set(0, 2.05, -1.4);
    this.scene.add(this.deskLight);
  }

  _buildShell() {
    const floorTex = this._createGridTexture(512, '#101827', '#1a2840', '#2fd6ff', 4);
    floorTex.repeat.set(this.roomWidth, this.roomDepth);

    const wallTex = this._createWallPanelTexture(512, '#182131', '#223047', '#2c4160');
    wallTex.repeat.set(3, 1.5);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.45,
      metalness: 0.25,
    });

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.65,
      metalness: 0.18,
    });

    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.8,
      metalness: 0.1,
    });

    const halfW = this.roomWidth * 0.5;
    const halfD = this.roomDepth * 0.5;
    const halfH = this.roomHeight * 0.5;

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.roomWidth, this.roomDepth), floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.receiveShadow = true;
    this.environmentGroup.add(floor);

    // Ceiling
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(this.roomWidth, this.roomDepth), ceilingMat);
    ceiling.rotation.x = Math.PI * 0.5;
    ceiling.position.y = this.roomHeight;
    this.environmentGroup.add(ceiling);

    // Back, Left, Right full walls
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(this.roomWidth, this.roomHeight), wallMat);
    backWall.position.set(0, halfH, halfD);
    backWall.rotation.y = Math.PI;
    backWall.receiveShadow = true;
    this.environmentGroup.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(this.roomDepth, this.roomHeight), wallMat);
    leftWall.position.set(-halfW, halfH, 0);
    leftWall.rotation.y = Math.PI * 0.5;
    leftWall.receiveShadow = true;
    this.environmentGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(this.roomDepth, this.roomHeight), wallMat);
    rightWall.position.set(halfW, halfH, 0);
    rightWall.rotation.y = -Math.PI * 0.5;
    rightWall.receiveShadow = true;
    this.environmentGroup.add(rightWall);

    // Front wall built around panoramic viewport opening (x in [-1.85, 1.85], y in [1.05, 2.75])
    const frontMat = wallMat;
    this._addBox(0, 0.525, -halfD, this.roomWidth, 1.05, 0.14, frontMat); // Lower front bulkhead
    this._addBox(0, 3.075, -halfD, this.roomWidth, 0.65, 0.14, frontMat); // Upper header
    this._addBox(-2.525, 1.9, -halfD, 1.35, 1.7, 0.14, frontMat); // Left front pier
    this._addBox(2.525, 1.9, -halfD, 1.35, 1.7, 0.14, frontMat); // Right front pier

    // Glowing architectural neon cove strips around ceiling perimeter
    const stripMat = this._createAccentMaterial(1.4);
    this._addBox(0, this.roomHeight - 0.12, -halfD + 0.09, this.roomWidth - 0.5, 0.035, 0.035, stripMat, false);
    this._addBox(0, this.roomHeight - 0.12, halfD - 0.09, this.roomWidth - 0.5, 0.035, 0.035, stripMat, false);
    this._addBox(-halfW + 0.09, this.roomHeight - 0.12, 0, 0.035, 0.035, this.roomDepth - 0.5, stripMat, false);
    this._addBox(halfW - 0.09, this.roomHeight - 0.12, 0, 0.035, 0.035, this.roomDepth - 0.5, stripMat, false);

    // Recessed futuristic skylight panel
    const skyPanelMat = this._createAccentMaterial(0.85);
    const skyPanel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 1.9), skyPanelMat);
    skyPanel.position.set(0, this.roomHeight - 0.02, -0.45);
    this.environmentGroup.add(skyPanel);
  }

  _buildPanoramicVista() {
    // Backdrop dome/plane visible through the panoramic front window for deep stereo parallax
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    this._vistaSkyCanvas = canvas;
    this._vistaSkyTex = new THREE.CanvasTexture(canvas);
    this._vistaSkyTex.colorSpace = THREE.SRGBColorSpace;
    this._redrawVistaBackdrop('#06152f', '#133a6b');

    const vistaPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 7.5),
      new THREE.MeshBasicMaterial({ map: this._vistaSkyTex })
    );
    vistaPlane.position.set(0, 2.2, -10.5);
    this.environmentGroup.add(vistaPlane);

    // Drifting 3D starfield outside the window (creates true binocular stereo depth!)
    const starCount = 260;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = 0.2 + Math.random() * 5.8;
      positions[i * 3 + 2] = -4.2 - Math.random() * 6.0;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xcbeaff,
      size: 0.045,
      transparent: true,
      opacity: 0.85,
    });
    this._starPoints = new THREE.Points(starGeo, starMat);
    this.environmentGroup.add(this._starPoints);

    // Subtle futuristic outer orbital skyline ring visible through window
    const horizonRing = new THREE.Mesh(
      new THREE.TorusGeometry(4.4, 0.035, 10, 64),
      this._createAccentMaterial(1.1)
    );
    horizonRing.position.set(0, 1.35, -7.8);
    horizonRing.rotation.x = Math.PI * 0.44;
    this.environmentGroup.add(horizonRing);

    // Window mullion frame
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0c1320, roughness: 0.35, metalness: 0.7 });
    this._addBox(0, 1.05, -this.roomDepth * 0.5 + 0.04, 3.8, 0.08, 0.16, frameMat);
    this._addBox(0, 2.75, -this.roomDepth * 0.5 + 0.04, 3.8, 0.08, 0.16, frameMat);
    this._addBox(-1.86, 1.9, -this.roomDepth * 0.5 + 0.04, 0.08, 1.76, 0.16, frameMat);
    this._addBox(1.86, 1.9, -this.roomDepth * 0.5 + 0.04, 0.08, 1.76, 0.16, frameMat);
  }

  _redrawVistaBackdrop(topColor, bottomColor) {
    const ctx = this._vistaSkyCanvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, this._vistaSkyCanvas.height);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.68, bottomColor);
    grad.addColorStop(1, '#040812');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this._vistaSkyCanvas.width, this._vistaSkyCanvas.height);

    // Soft glowing horizon line
    const glow = ctx.createRadialGradient(256, 180, 10, 256, 180, 220);
    glow.addColorStop(0, 'rgba(95, 215, 255, 0.45)');
    glow.addColorStop(1, 'rgba(95, 215, 255, 0.0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 256);
    this._vistaSkyTex.needsUpdate = true;
  }

  _buildArchitecturalDetails() {
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.4, metalness: 0.65 });
    const stripMat = this._createAccentMaterial(1.5);
    const woodAccentMat = new THREE.MeshStandardMaterial({ color: 0x2a3346, roughness: 0.5, metalness: 0.35 });

    const px = this.roomWidth * 0.5 - 0.16;
    const pz = this.roomDepth * 0.5 - 0.16;
    const corners = [
      [-px, -pz],
      [px, -pz],
      [-px, pz],
      [px, pz],
    ];

    for (const [cx, cz] of corners) {
      this._addBox(cx, this.roomHeight * 0.5, cz, 0.28, this.roomHeight, 0.28, pillarMat);
      // Inner neon vertical stripe on each corner column
      const sx = cx > 0 ? cx - 0.145 : cx + 0.145;
      const sz = cz > 0 ? cz - 0.145 : cz + 0.145;
      this._addBox(sx, this.roomHeight * 0.5, sz, 0.025, this.roomHeight - 0.4, 0.025, stripMat, false);
    }

    // Center floor tech platform mat
    const matBase = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.014, 2.9),
      new THREE.MeshStandardMaterial({ color: 0x0d1b2c, roughness: 0.72, metalness: 0.2 })
    );
    matBase.position.set(0, 0.007, -0.75);
    matBase.receiveShadow = true;
    this.environmentGroup.add(matBase);

    // Right wall futuristic display shelf with decorative stereo artifacts
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(this.roomWidth * 0.5 - 0.24, 0, -0.35);
    this.environmentGroup.add(shelfGroup);

    for (let level = 0; level < 4; level++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 1.55), woodAccentMat);
      board.position.set(0, 0.46 + level * 0.52, 0);
      board.castShadow = true;
      board.receiveShadow = true;
      shelfGroup.add(board);
    }

    const decoA = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.11, 0),
      new THREE.MeshStandardMaterial({ color: 0x28f0a2, roughness: 0.25, metalness: 0.5, emissive: 0x0b4a33 })
    );
    decoA.position.set(-0.02, 1.11, -0.35);
    shelfGroup.add(decoA);

    const decoB = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.085, 0.026, 48, 8),
      new THREE.MeshStandardMaterial({ color: 0xff9436, roughness: 0.28, metalness: 0.6, emissive: 0x451f05 })
    );
    decoB.position.set(-0.02, 1.64, 0.25);
    shelfGroup.add(decoB);
  }

  _buildWorkbench() {
    const deskGroup = new THREE.Group();
    deskGroup.position.copy(this.deskCenter);
    this.root.add(deskGroup);

    const topMat = new THREE.MeshStandardMaterial({ color: 0x162235, roughness: 0.34, metalness: 0.52 });
    this._deskTopMat = topMat;
    const legMat = new THREE.MeshStandardMaterial({ color: 0x0b111d, roughness: 0.4, metalness: 0.72 });
    const edgeGlow = this._createAccentMaterial(1.6);

    const w = this.deskHalfW * 2;
    const d = this.deskHalfD * 2;
    const thick = 0.065;

    const top = new THREE.Mesh(new THREE.BoxGeometry(w, thick, d), topMat);
    top.position.set(0, this.deskTopY - thick * 0.5, 0);
    top.castShadow = true;
    top.receiveShadow = true;
    deskGroup.add(top);

    // Luminous front edge strip facing user (+Z side of desk)
    const frontEdge = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.018, 0.018), edgeGlow);
    frontEdge.position.set(0, this.deskTopY - thick * 0.5, d * 0.5 + 0.008);
    deskGroup.add(frontEdge);

    // Sleek angled side pedestals
    this._deskLegsGroup = new THREE.Group();
    deskGroup.add(this._deskLegsGroup);
    const legH = this.deskTopY - thick;
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, legH, d - 0.14), legMat);
      leg.position.set(side * (this.deskHalfW - 0.14), legH * 0.5, 0);
      leg.castShadow = true;
      leg.receiveShadow = true;
      this._deskLegsGroup.add(leg);
    }
  }

  _buildInteractiveObjects() {
    const y = this.deskTopY;
    const z = this.deskCenter.z;

    // 1. Grabbable Holo Cube
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0x25b7ff,
      roughness: 0.24,
      metalness: 0.45,
      emissive: 0x08344d,
      emissiveIntensity: 0.9,
    });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), cubeMat);
    cube.position.set(-0.34, y + 0.09, z + 0.08);
    cube.rotation.y = 0.42;
    cube.castShadow = true;
    cube.receiveShadow = true;

    // Subtle glowing wireframe outline on Holo Cube
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.184, 0.184, 0.184)),
      new THREE.LineBasicMaterial({ color: 0x99ecff })
    );
    cube.add(wire);
    this.root.add(cube);
    this._registerGrabbable(cube, 'Cubo Holográfico (Agarrar / Mover)', 0.09, 0.36);

    // 2. Grabbable Plasma Energy Sphere
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xff9f2e,
      roughness: 0.18,
      metalness: 0.38,
      emissive: 0x6b3204,
      emissiveIntensity: 0.9,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.095, 28, 20), sphereMat);
    sphere.position.set(0.02, y + 0.095, z + 0.12);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    this.root.add(sphere);
    this._registerGrabbable(sphere, 'Esfera de Plasma (Rebota)', 0.095, 0.78);

    // 3. Grabbable Emerald Octahedron Crystal
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x22e39a,
      roughness: 0.16,
      metalness: 0.55,
      emissive: 0x074d33,
      emissiveIntensity: 0.85,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), crystalMat);
    crystal.position.set(-0.14, y + 0.11, z - 0.14);
    crystal.castShadow = true;
    this.root.add(crystal);
    this._registerGrabbable(crystal, 'Cristal Esmeralda (Agarrar)', 0.105, 0.34);

    // 4. Interactive Desk Lighting Lamp (Left side of workbench)
    const lampGroup = new THREE.Group();
    lampGroup.position.set(-0.76, y, z - 0.04);
    this.root.add(lampGroup);

    const lampBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.05, 20),
      new THREE.MeshStandardMaterial({ color: 0x0f1726, roughness: 0.35, metalness: 0.7 })
    );
    lampBase.position.y = 0.025;
    lampGroup.add(lampBase);

    const lampStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.24, 12),
      new THREE.MeshStandardMaterial({ color: 0x1d293f, roughness: 0.3, metalness: 0.8 })
    );
    lampStem.position.y = 0.16;
    lampGroup.add(lampStem);

    const lampOrbMat = new THREE.MeshStandardMaterial({
      color: 0x45dcff,
      emissive: 0x26c7ff,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    const lampOrb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 16), lampOrbMat);
    lampOrb.position.y = 0.31;
    lampGroup.add(lampOrb);

    this.interactables.push({
      mesh: lampOrb,
      highlightMaterial: lampOrbMat,
      baseEmissiveIntensity: 1.4,
      label: 'Lámpara — Cambiar Ambiente de Luz',
      canGrab: false,
      onActivate: () => {
        const preset = this.cycleLightingPreset();
        lampOrbMat.color.setHex(preset.accentHex);
        lampOrbMat.emissive.setHex(preset.accentHex);
        this.audio.play('toggle');
      },
    });

    // 5. Interactive Holographic Orbital Pedestal (Right side of workbench)
    const pedGroup = new THREE.Group();
    pedGroup.position.set(0.70, y, z - 0.04);
    this.root.add(pedGroup);

    const pedBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.15, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: 0x0e1626, roughness: 0.35, metalness: 0.72 })
    );
    pedBase.position.y = 0.03;
    pedGroup.add(pedBase);

    const holoCoreMat = new THREE.MeshStandardMaterial({
      color: 0x9b5cff,
      emissive: 0x6f2dff,
      emissiveIntensity: 1.25,
      roughness: 0.18,
      metalness: 0.5,
    });
    this._holoCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), holoCoreMat);
    this._holoCore.position.y = 0.30;
    pedGroup.add(this._holoCore);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x35e4ff, transparent: true, opacity: 0.85 });
    this._holoRingA = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.008, 10, 40), ringMat);
    this._holoRingA.position.y = 0.30;
    pedGroup.add(this._holoRingA);

    this._holoRingB = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.006, 10, 44), ringMat.clone());
    this._holoRingB.position.y = 0.30;
    pedGroup.add(this._holoRingB);

    // Invisible clean hit sphere wrapping the hologram for effortless gaze/tap selection
    const holoHit = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 12, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    holoHit.position.y = 0.30;
    pedGroup.add(holoHit);

    this.interactables.push({
      mesh: holoHit,
      highlightMaterial: holoCoreMat,
      baseEmissiveIntensity: 1.25,
      label: 'Holograma Orbital — Velocidad Turbo',
      canGrab: false,
      onActivate: () => {
        this.hologramTurbo = !this.hologramTurbo;
        const col = this.hologramTurbo ? 0xff46c8 : 0x9b5cff;
        holoCoreMat.color.setHex(col);
        holoCoreMat.emissive.setHex(col);
        this.audio.play('toggle');
      },
    });

    // 6. Interactive Spatial Audio Chime Pad (Front-Right of workbench)
    const padGroup = new THREE.Group();
    padGroup.position.set(0.36, y, z + 0.21);
    this.root.add(padGroup);

    const padMat = new THREE.MeshStandardMaterial({
      color: 0x20d6b8,
      emissive: 0x0b7061,
      emissiveIntensity: 1.1,
      roughness: 0.28,
      metalness: 0.4,
    });
    const padDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.036, 24), padMat);
    padDisc.position.y = 0.018;
    padGroup.add(padDisc);

    this._chimeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.105, 0.125, 32),
      new THREE.MeshBasicMaterial({ color: 0x62ffe4, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    this._chimeRing.rotation.x = -Math.PI * 0.5;
    this._chimeRing.position.y = 0.04;
    padGroup.add(this._chimeRing);

    this.interactables.push({
      mesh: padDisc,
      highlightMaterial: padMat,
      baseEmissiveIntensity: 1.1,
      label: 'Pad Acústico 3D — Acorde Espacial',
      canGrab: false,
      onActivate: () => {
        this._chimePulse = 1.0;
        this.audio.play('chime');
      },
    });
  }

  _registerGrabbable(mesh, label, radius, bounciness) {
    const homePos = mesh.position.clone();
    const homeQuat = mesh.quaternion.clone();

    const item = {
      mesh,
      highlightMaterial: mesh.material,
      baseEmissiveIntensity: mesh.material.emissiveIntensity || 0.85,
      label,
      canGrab: true,
      radius,
      bounciness,
      isGrabbed: false,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      resetToHome: () => {
        item.isGrabbed = false;
        item.velocity.set(0, 0, 0);
        item.angularVelocity.set(0, 0, 0);
        mesh.position.copy(homePos);
        mesh.quaternion.copy(homeQuat);
      },
    };

    this.grabbables.push(item);
    this.interactables.push(item);
    return item;
  }

  _addBox(x, y, z, w, h, d, material, castShadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.environmentGroup.add(mesh);
    return mesh;
  }

  _createAccentMaterial(emissiveIntensity = 1.2) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x26d8ff,
      emissive: 0x26d8ff,
      emissiveIntensity,
      roughness: 0.25,
      metalness: 0.2,
    });
    this.accentMaterials.push(mat);
    return mat;
  }

  _createGridTexture(size, bgHex, subGridHex, mainGridHex, subDivs) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = subGridHex;
    ctx.lineWidth = 2;
    const step = size / subDivs;
    for (let i = 1; i < subDivs; i++) {
      const p = i * step;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    ctx.strokeStyle = mainGridHex;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, size - 4, size - 4);
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  _createWallPanelTexture(size, bgHex, panelHex, seamHex) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgHex;
    ctx.fillRect(0, 0, size, size);

    // Horizontal architectural sci-fi paneling
    ctx.fillStyle = panelHex;
    ctx.fillRect(14, 14, size - 28, size * 0.45);
    ctx.fillRect(14, size * 0.5 + 10, size - 28, size * 0.44);

    ctx.strokeStyle = seamHex;
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, size - 28, size * 0.45);
    ctx.strokeRect(14, size * 0.5 + 10, size - 28, size * 0.44);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
