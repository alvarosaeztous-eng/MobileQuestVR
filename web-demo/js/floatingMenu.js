import * as THREE from '../vendor/three/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

/**
 * Draws a crisp high-DPI button texture on an offscreen canvas.
 */
function paintButtonCanvas(canvas, label, state = 'idle') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const bg = state === 'pressed'
    ? 'rgba(34, 214, 150, 0.94)'
    : state === 'hover'
      ? 'rgba(32, 128, 206, 0.94)'
      : 'rgba(14, 34, 62, 0.92)';

  const border = state === 'pressed'
    ? '#80ffd4'
    : state === 'hover'
      ? '#6be4ff'
      : 'rgba(54, 198, 255, 0.65)';

  // Rounded rect background
  drawRoundedRect(ctx, 4, 4, w - 8, h - 8, 18);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = state === 'hover' ? 5 : 3;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.fillStyle = '#f2faff';
  ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w * 0.5, h * 0.5 + 1);
}

/**
 * 3D World-Space Holographic Floating Control Hub with interactive raycasted 3D buttons,
 * pinnable/lazy-follow anchor behavior, and real-time label updates.
 */
export class FloatingMenu3D {
  constructor(scene, headAnchor, audio, actions) {
    this.scene = scene;
    this.headAnchor = headAnchor;
    this.audio = audio;
    this.actions = actions;

    this.root = new THREE.Group();
    this.root.name = 'FloatingMenu3D';
    this.scene.add(this.root);

    this.isPinned = true;
    this.visible = true;
    this.followDistance = 1.66;
    this.verticalOffset = -0.06;
    this.deadzoneDeg = 42;

    this._targetPos = new THREE.Vector3();
    this._targetQuat = new THREE.Quaternion();
    this._buttons = new Map();
    this.interactables = [];

    this._buildPanel();
    this.snapToComfortablePose(26);
  }

  _buildPanel() {
    const panelW = 0.92;
    const panelH = 0.66;

    // Holographic panel backdrop with CanvasTexture header & glowing border
    this._bgCanvas = document.createElement('canvas');
    this._bgCanvas.width = 920;
    this._bgCanvas.height = 660;
    this._bgTexture = new THREE.CanvasTexture(this._bgCanvas);
    this._bgTexture.colorSpace = THREE.SRGBColorSpace;
    this._paintBackdrop('64.0 mm', 'Táctil');

    const bgMat = new THREE.MeshBasicMaterial({
      map: this._bgTexture,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
    });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), bgMat);
    this.root.add(backdrop);

    // Row 1: Recenter & Stereo Mode
    this._addButton('recenter', 'RECENTRAR VISTA', -0.21, 0.145, 0.39, 0.088, () => {
      this.actions.onRecenter();
    });
    this._addButton('stereo', 'VISTA: MONO', 0.21, 0.145, 0.39, 0.088, () => {
      this.actions.onToggleStereo();
    });

    // Row 2: Barrel Lens & Lighting Preset
    this._addButton('barrel', 'LENTE BARREL: ON', -0.21, 0.042, 0.39, 0.088, () => {
      this.actions.onToggleBarrel();
    });
    this._addButton('lighting', 'LUZ: STUDIO CYBER', 0.21, 0.042, 0.39, 0.088, () => {
      this.actions.onCycleLighting();
    });

    // Row 3: IPD -1 mm | (live readout painted on panel) | IPD +1 mm
    this._addButton('ipdMinus', 'IPD −1 mm', -0.285, -0.062, 0.24, 0.084, () => {
      this.actions.onAdjustIpd(-1);
    });
    this._addButton('ipdPlus', 'IPD +1 mm', 0.285, -0.062, 0.24, 0.084, () => {
      this.actions.onAdjustIpd(1);
    });

    // Row 4: Reset Objects & Pin/Follow Menu
    this._addButton('reset', 'REINICIAR OBJETOS', -0.21, -0.168, 0.39, 0.088, () => {
      this.actions.onResetObjects();
    });
    this._addButton('pin', 'MENÚ: ANCLADO', 0.21, -0.168, 0.39, 0.088, () => {
      this.togglePinned();
    });
  }

  _paintBackdrop(ipdText, sensorText) {
    const cacheKey = `${ipdText}|${sensorText}`;
    if (this._lastBackdropKey === cacheKey) return;
    this._lastBackdropKey = cacheKey;

    const ctx = this._bgCanvas.getContext('2d');
    const w = this._bgCanvas.width;
    const h = this._bgCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Translucent dark holo plate
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(7, 18, 36, 0.90)');
    grad.addColorStop(1, 'rgba(4, 11, 24, 0.92)');

    drawRoundedRect(ctx, 8, 8, w - 16, h - 16, 28);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(47, 214, 255, 0.85)';
    ctx.stroke();

    // Subtle scanline texture
    ctx.fillStyle = 'rgba(47, 214, 255, 0.04)';
    for (let y = 20; y < h - 20; y += 12) {
      ctx.fillRect(14, y, w - 28, 2);
    }

    // Header
    ctx.fillStyle = '#38e2ff';
    ctx.font = '800 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MOBILEQUEST VR  •  MENÚ 3D', w * 0.5, 58);

    ctx.fillStyle = '#9ec4e6';
    ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`Sensor: ${sensorText}  •  Apunta 1.1s o toca la pantalla`, w * 0.5, 102);

    // Center IPD Readout Pill
    drawRoundedRect(ctx, w * 0.5 - 122, 350, 244, 82, 16);
    ctx.fillStyle = 'rgba(9, 25, 48, 0.94)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(56, 226, 255, 0.45)';
    ctx.stroke();

    ctx.fillStyle = '#7ec8f2';
    ctx.font = '700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('DISTANCIA IPD', w * 0.5, 374);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(ipdText, w * 0.5, 408);

    // Footer hint
    ctx.fillStyle = 'rgba(154, 194, 228, 0.78)';
    ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Fase 2: MediaPipe Hand Tracking preparado para cámara Android', w * 0.5, h - 42);

    this._bgTexture.needsUpdate = true;
  }

  _addButton(id, label, x, y, width, height, onClick) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * 1000);
    canvas.height = Math.round(height * 1000);
    paintButtonCanvas(canvas, label, 'idle');

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    mesh.position.set(x, y, 0.012);
    this.root.add(mesh);

    const record = {
      id,
      mesh,
      canvas,
      texture,
      label,
      baseZ: 0.012,
      pressTimer: 0,
      hovered: false,
      setLabel: (newLabel) => {
        if (record.label === newLabel) return;
        record.label = newLabel;
        paintButtonCanvas(canvas, newLabel, record.pressTimer > 0 ? 'pressed' : record.hovered ? 'hover' : 'idle');
        texture.needsUpdate = true;
      },
    };

    const interactable = {
      mesh,
      label: `Menú: ${label}`,
      canGrab: false,
      onHoverChange: (isHovered) => {
        record.hovered = isHovered;
        paintButtonCanvas(canvas, record.label, record.pressTimer > 0 ? 'pressed' : isHovered ? 'hover' : 'idle');
        texture.needsUpdate = true;
      },
      onActivate: () => {
        record.pressTimer = 0.18;
        paintButtonCanvas(canvas, record.label, 'pressed');
        texture.needsUpdate = true;
        this.audio.play('select');
        onClick();
      },
    };

    this._buttons.set(id, record);
    this.interactables.push(interactable);
  }

  syncState({ stereoEnabled, barrelEnabled, ipdMm, lightingName, sensorLabel }) {
    this._buttons.get('stereo')?.setLabel(stereoEnabled ? 'VISTA: STEREO VR' : 'VISTA: MONO');
    this._buttons.get('barrel')?.setLabel(barrelEnabled ? 'LENTE BARREL: ON' : 'LENTE BARREL: OFF');
    this._buttons.get('lighting')?.setLabel(`LUZ: ${lightingName.toUpperCase()}`);
    this._buttons.get('pin')?.setLabel(this.isPinned ? 'MENÚ: ANCLADO' : 'MENÚ: SEGUIMIENTO');
    this._paintBackdrop(`${ipdMm.toFixed(1)} mm`, sensorLabel);
  }

  togglePinned() {
    this.isPinned = !this.isPinned;
    this._buttons.get('pin')?.setLabel(this.isPinned ? 'MENÚ: ANCLADO' : 'MENÚ: SEGUIMIENTO');
    if (!this.isPinned) {
      this._computeDesiredPose(0, this._targetPos, this._targetQuat);
    }
  }

  summonInFrontOfHead() {
    this.visible = true;
    this.root.visible = true;
    this.snapToComfortablePose(0);
    this.audio.play('recenter');
  }

  snapToComfortablePose(yawOffsetDeg) {
    this._computeDesiredPose(yawOffsetDeg, this._targetPos, this._targetQuat);
    this.root.position.copy(this._targetPos);
    this.root.quaternion.copy(this._targetQuat);
  }

  update(dt) {
    // Animate physical Z depression feedback on 3D buttons
    for (const btn of this._buttons.values()) {
      if (btn.pressTimer > 0) {
        btn.pressTimer = Math.max(0, btn.pressTimer - dt);
        if (btn.pressTimer === 0) {
          paintButtonCanvas(btn.canvas, btn.label, btn.hovered ? 'hover' : 'idle');
          btn.texture.needsUpdate = true;
        }
      }
      const targetZ = btn.pressTimer > 0 ? btn.baseZ - 0.008 : btn.hovered ? btn.baseZ + 0.012 : btn.baseZ;
      btn.mesh.position.z = THREE.MathUtils.lerp(btn.mesh.position.z, targetZ, 1 - Math.exp(-18 * dt));
    }

    if (this.isPinned) return;

    // Lazy-follow: stay still while reading buttons, smoothly glide back if user turns > deadzoneDeg
    const headPos = new THREE.Vector3();
    const headQuat = new THREE.Quaternion();
    this.headAnchor.getWorldPosition(headPos);
    this.headAnchor.getWorldQuaternion(headQuat);

    const flatFwd = FORWARD.clone().applyQuaternion(headQuat);
    flatFwd.y = 0;
    if (flatFwd.lengthSq() > 0.001) flatFwd.normalize();

    const toMenu = this.root.position.clone().sub(headPos);
    toMenu.y = 0;
    const angleDeg = toMenu.lengthSq() > 0.01
      ? THREE.MathUtils.radToDeg(flatFwd.angleTo(toMenu.normalize()))
      : 180;

    if (angleDeg > this.deadzoneDeg) {
      this._computeDesiredPose(0, this._targetPos, this._targetQuat);
    }

    const alpha = 1 - Math.exp(-5.5 * dt);
    this.root.position.lerp(this._targetPos, alpha);
    this.root.quaternion.slerp(this._targetQuat, alpha);
  }

  _computeDesiredPose(yawOffsetDeg, outPos, outQuat) {
    const headPos = new THREE.Vector3();
    const headQuat = new THREE.Quaternion();
    this.headAnchor.getWorldPosition(headPos);
    this.headAnchor.getWorldQuaternion(headQuat);

    const flatFwd = FORWARD.clone().applyQuaternion(headQuat);
    flatFwd.y = 0;
    if (flatFwd.lengthSq() < 0.001) flatFwd.set(0, 0, -1);
    flatFwd.normalize();

    const dir = flatFwd.applyAxisAngle(UP, THREE.MathUtils.degToRad(-yawOffsetDeg));
    outPos.copy(headPos).addScaledVector(dir, this.followDistance);
    outPos.y = THREE.MathUtils.clamp(headPos.y + this.verticalOffset, 1.15, 2.2);

    // Orient panel front (+Z) cleanly toward user head
    const lookMatrix = new THREE.Matrix4().lookAt(outPos, new THREE.Vector3(headPos.x, outPos.y + 0.06, headPos.z), UP);
    outQuat.setFromRotationMatrix(lookMatrix);
    // PlaneGeometry faces +Z; lookAt faces -Z, so rotate 180 deg around Y
    outQuat.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
  }
}

/**
 * Wall-mounted live holographic telemetry board inside the virtual room.
 */
export class TelemetryBoard3D {
  constructor(scene, mountObject) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 960;
    this.canvas.height = 620;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.95,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.96), mat);
    this.mesh.position.copy(mountObject.position);
    this.mesh.quaternion.copy(mountObject.quaternion);
    scene.add(this.mesh);

    this._elapsed = 0;
    this.refresh({
      fps: 60,
      stereoEnabled: false,
      barrelEnabled: true,
      ipdMm: 64,
      sensorLabel: 'Táctil',
      euler: { yaw: 0, pitch: 0, roll: 0 },
      targetLabel: 'Ninguno',
      handStatus: 'Fase 2 (MediaPipe Tasks Vision)',
    });
  }

  refresh(data) {
    const ctx = this.canvas.getContext('2d');
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    drawRoundedRect(ctx, 8, 8, w - 16, h - 16, 22);
    ctx.fillStyle = 'rgba(5, 13, 28, 0.92)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(40, 200, 255, 0.85)';
    ctx.stroke();

    ctx.fillStyle = '#38e2ff';
    ctx.font = '800 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('MOBILEQUEST VR WEB  —  TELEMETRÍA EN VIVO', 38, 36);

    const fmt = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}°`;
    const lines = [
      `RENDIMIENTO :  ${data.fps.toFixed(0)} FPS   |   WebGL Three.js`,
      `ÓPTICA VR   :  ${data.stereoEnabled ? 'Stereo Split (Izq/Der)' : 'Mono'}  |  Barrel: ${data.barrelEnabled ? 'ON' : 'OFF'}  |  IPD: ${data.ipdMm.toFixed(1)} mm`,
      `GIROSCOPIO  :  ${data.sensorLabel}`,
      `ORIENTACIÓN :  Yaw ${fmt(data.euler.yaw)}    Pitch ${fmt(data.euler.pitch)}    Roll ${fmt(data.euler.roll)}`,
      `OBJETO FOCO :  ${data.targetLabel || 'Ninguno'}`,
      `MANOS       :  ${data.handStatus}`,
      '',
      'CONTROLES ANDROID CHROME:',
      '  • Botón MODO VR : Pantalla completa + Horizontal + Estereoscópico',
      '  • Mirada (1.1s) o toque en pantalla : Seleccionar / Agarrar / Soltar',
      '  • Botones − / + : Acercar o alejar objetos agarrados en el espacio 3D',
    ];

    ctx.font = '600 24px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    let y = 104;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i >= 7 ? '#89c4ea' : '#eaf6ff';
      ctx.fillText(lines[i], 38, y);
      y += 42;
    }

    this.texture.needsUpdate = true;
  }
}
