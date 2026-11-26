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
function paintButtonCanvas(canvas, label, state = 'idle', activeAccent = false) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  let bg = 'rgba(14, 34, 62, 0.92)';
  let border = 'rgba(54, 198, 255, 0.65)';

  if (state === 'pressed') {
    bg = 'rgba(34, 214, 150, 0.95)';
    border = '#80ffd4';
  } else if (state === 'hover') {
    bg = 'rgba(32, 128, 206, 0.95)';
    border = '#6be4ff';
  } else if (activeAccent) {
    bg = 'rgba(12, 82, 108, 0.94)';
    border = '#38e8b8';
  }

  drawRoundedRect(ctx, 4, 4, w - 8, h - 8, 18);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = state === 'hover' ? 5 : 3;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.fillStyle = '#f2faff';
  ctx.font = '700 25px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w * 0.5, h * 0.5 + 1);
}

/**
 * 3D World-Space Holographic Floating Settings Hub with interactive raycasted 3D buttons,
 * pinnable/lazy-follow anchor behavior, and live state updates for VR, Head, Hands & Passthrough.
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
    this.verticalOffset = -0.02;
    this.deadzoneDeg = 42;

    this._targetPos = new THREE.Vector3();
    this._targetQuat = new THREE.Quaternion();
    this._buttons = new Map();
    this.interactables = [];

    this._buildPanel();
    this.snapToComfortablePose(28);
  }

  _buildPanel() {
    const panelW = 0.96;
    const panelH = 0.84;

    this._bgCanvas = document.createElement('canvas');
    this._bgCanvas.width = 960;
    this._bgCanvas.height = 840;
    this._bgTexture = new THREE.CanvasTexture(this._bgCanvas);
    this._bgTexture.colorSpace = THREE.SRGBColorSpace;
    this._paintBackdrop('64.0 mm', 'Táctil', 'Manos OFF');

    const bgMat = new THREE.MeshBasicMaterial({
      map: this._bgTexture,
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
    });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), bgMat);
    this.root.add(backdrop);

    // Row 1: Recenter & Apps Launcher
    this._addButton('recenter', 'RECENTRAR VISTA', -0.22, 0.235, 0.41, 0.082, () => {
      this.actions.onRecenter();
    });
    this._addButton('apps', 'INICIO / APPS 3D', 0.22, 0.235, 0.41, 0.082, () => {
      this.actions.onSummonApps();
    });

    // Row 2: Passthrough Real Camera & Real MediaPipe Hand Tracking
    this._addButton('passthrough', 'PASSTHROUGH: OFF', -0.22, 0.138, 0.41, 0.082, () => {
      this.actions.onTogglePassthrough();
    });
    this._addButton('hands', 'MANOS REAL: OFF', 0.22, 0.138, 0.41, 0.082, () => {
      this.actions.onToggleHands();
    });

    // Row 3: Head Tracking ON/OFF & Camera Facing (Rear/Front)
    this._addButton('head', 'CABEZA: ON', -0.22, 0.041, 0.41, 0.082, () => {
      this.actions.onToggleHeadTracking();
    });
    this._addButton('camFacing', 'CÁMARA: TRASERA', 0.22, 0.041, 0.41, 0.082, () => {
      this.actions.onFlipCamera();
    });

    // Row 4: Stereo VR Mode & Barrel Lens Distortion
    this._addButton('stereo', 'MODO: NORMAL', -0.22, -0.056, 0.41, 0.082, () => {
      this.actions.onToggleStereo();
    });
    this._addButton('barrel', 'LENTE BARREL: ON', 0.22, -0.056, 0.41, 0.082, () => {
      this.actions.onToggleBarrel();
    });

    // Row 5: IPD -1 mm | live readout | IPD +1 mm
    this._addButton('ipdMinus', 'IPD −1 mm', -0.30, -0.156, 0.25, 0.080, () => {
      this.actions.onAdjustIpd(-1);
    });
    this._addButton('ipdPlus', 'IPD +1 mm', 0.30, -0.156, 0.25, 0.080, () => {
      this.actions.onAdjustIpd(1);
    });

    // Row 6: Lighting Preset & Reset Objects
    this._addButton('lighting', 'LUZ: STUDIO CYBER', -0.22, -0.256, 0.41, 0.082, () => {
      this.actions.onCycleLighting();
    });
    this._addButton('reset', 'REINICIAR OBJETOS', 0.22, -0.256, 0.41, 0.082, () => {
      this.actions.onResetObjects();
    });

    // Row 7: Pin/Follow Toggle (centered bottom)
    this._addButton('pin', 'MENÚ: ANCLADO', 0, -0.346, 0.48, 0.068, () => {
      this.togglePinned();
    });
  }

  _paintBackdrop(ipdText, sensorText, handSummary) {
    const cacheKey = `${ipdText}|${sensorText}|${handSummary}`;
    if (this._lastBackdropKey === cacheKey) return;
    this._lastBackdropKey = cacheKey;

    const ctx = this._bgCanvas.getContext('2d');
    const w = this._bgCanvas.width;
    const h = this._bgCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(7, 18, 36, 0.91)');
    grad.addColorStop(1, 'rgba(4, 11, 24, 0.94)');

    drawRoundedRect(ctx, 8, 8, w - 16, h - 16, 28);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(47, 214, 255, 0.85)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(47, 214, 255, 0.035)';
    for (let y = 20; y < h - 20; y += 14) {
      ctx.fillRect(14, y, w - 28, 2);
    }

    ctx.fillStyle = '#38e2ff';
    ctx.font = '800 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MOBILEQUEST VR  •  AJUSTES 3D', w * 0.5, 52);

    ctx.fillStyle = '#9ec4e6';
    ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`Cabeza: ${sensorText}  •  ${handSummary}`, w * 0.5, 92);

    // Center IPD Readout Pill (aligned with Row 5 y = -0.156 => canvas y = 576)
    drawRoundedRect(ctx, w * 0.5 - 122, 536, 244, 80, 16);
    ctx.fillStyle = 'rgba(9, 25, 48, 0.95)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(56, 226, 255, 0.45)';
    ctx.stroke();

    ctx.fillStyle = '#7ec8f2';
    ctx.font = '700 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('DISTANCIA IPD', w * 0.5, 558);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 29px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(ipdText, w * 0.5, 592);

    this._bgTexture.needsUpdate = true;
  }

  _addButton(id, label, x, y, width, height, onClick) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * 1000);
    canvas.height = Math.round(height * 1000);
    paintButtonCanvas(canvas, label, 'idle', false);

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
      activeAccent: false,
      baseZ: 0.012,
      pressTimer: 0,
      hovered: false,
      setVisual: (newLabel, activeAccent = false) => {
        if (record.label === newLabel && record.activeAccent === activeAccent) return;
        record.label = newLabel;
        record.activeAccent = activeAccent;
        paintButtonCanvas(
          canvas,
          newLabel,
          record.pressTimer > 0 ? 'pressed' : record.hovered ? 'hover' : 'idle',
          activeAccent
        );
        texture.needsUpdate = true;
      },
    };

    const interactable = {
      mesh,
      label: `Ajustes: ${label}`,
      canGrab: false,
      onHoverChange: (isHovered) => {
        record.hovered = isHovered;
        paintButtonCanvas(
          canvas,
          record.label,
          record.pressTimer > 0 ? 'pressed' : isHovered ? 'hover' : 'idle',
          record.activeAccent
        );
        texture.needsUpdate = true;
      },
      onActivate: () => {
        record.pressTimer = 0.18;
        paintButtonCanvas(canvas, record.label, 'pressed', record.activeAccent);
        texture.needsUpdate = true;
        this.audio.play('select');
        onClick();
      },
    };

    this._buttons.set(id, record);
    this.interactables.push(interactable);
  }

  syncState({
    stereoEnabled,
    barrelEnabled,
    ipdMm,
    lightingName,
    sensorLabel,
    headEnabled,
    handsEnabled,
    handsStatusShort,
    passthroughEnabled,
    cameraFacingLabel,
  }) {
    this._buttons.get('stereo')?.setVisual(stereoEnabled ? 'MODO: VR ESTÉREO' : 'MODO: NORMAL', stereoEnabled);
    this._buttons.get('barrel')?.setVisual(barrelEnabled ? 'LENTE BARREL: ON' : 'LENTE BARREL: OFF', barrelEnabled);
    this._buttons.get('lighting')?.setVisual(`LUZ: ${lightingName.toUpperCase()}`, false);
    this._buttons.get('pin')?.setVisual(this.isPinned ? 'MENÚ: ANCLADO' : 'MENÚ: SEGUIMIENTO', !this.isPinned);
    this._buttons.get('head')?.setVisual(headEnabled ? 'CABEZA: ON' : 'CABEZA: OFF', headEnabled);
    this._buttons.get('hands')?.setVisual(handsEnabled ? 'MANOS REAL: ON' : 'MANOS REAL: OFF', handsEnabled);
    this._buttons.get('passthrough')?.setVisual(passthroughEnabled ? 'PASSTHROUGH: ON' : 'PASSTHROUGH: OFF', passthroughEnabled);
    this._buttons.get('camFacing')?.setVisual(`CÁMARA: ${cameraFacingLabel}`, false);

    this._paintBackdrop(`${ipdMm.toFixed(1)} mm`, sensorLabel, handsStatusShort || 'Manos OFF');
  }

  togglePinned() {
    this.isPinned = !this.isPinned;
    this._buttons.get('pin')?.setVisual(this.isPinned ? 'MENÚ: ANCLADO' : 'MENÚ: SEGUIMIENTO', !this.isPinned);
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
    for (const btn of this._buttons.values()) {
      if (btn.pressTimer > 0) {
        btn.pressTimer = Math.max(0, btn.pressTimer - dt);
        if (btn.pressTimer === 0) {
          paintButtonCanvas(btn.canvas, btn.label, btn.hovered ? 'hover' : 'idle', btn.activeAccent);
          btn.texture.needsUpdate = true;
        }
      }
      const targetZ = btn.pressTimer > 0 ? btn.baseZ - 0.008 : btn.hovered ? btn.baseZ + 0.012 : btn.baseZ;
      btn.mesh.position.z = THREE.MathUtils.lerp(btn.mesh.position.z, targetZ, 1 - Math.exp(-18 * dt));
    }

    if (this.isPinned) return;

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

    const lookMatrix = new THREE.Matrix4().lookAt(outPos, new THREE.Vector3(headPos.x, outPos.y + 0.06, headPos.z), UP);
    outQuat.setFromRotationMatrix(lookMatrix);
    outQuat.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
  }
}

/**
 * Wall-mounted live holographic telemetry board inside the room (stays visible in Passthrough too).
 */
export class TelemetryBoard3D {
  constructor(scene, mountObject) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 960;
    this.canvas.height = 660;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.95,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 1.02), mat);
    this.mesh.position.copy(mountObject.position);
    this.mesh.quaternion.copy(mountObject.quaternion);
    scene.add(this.mesh);

    this.refresh({
      fps: 60,
      stereoEnabled: false,
      barrelEnabled: true,
      ipdMm: 64,
      sensorLabel: 'Táctil',
      euler: { yaw: 0, pitch: 0, roll: 0 },
      targetLabel: 'Ninguno',
      handStatus: 'Desactivado (MediaPipe real listo)',
      passthroughStatus: 'Sala virtual 3D',
      gestureLabel: '—',
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
    ctx.font = '800 31px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('MOBILEQUEST VR WEB  —  TELEMETRÍA FASE 2', 38, 34);

    const fmt = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}°`;
    const lines = [
      `RENDIMIENTO :  ${data.fps.toFixed(0)} FPS   |   Three.js + MediaPipe`,
      `ÓPTICA VR   :  ${data.stereoEnabled ? 'Stereo VR (Izq/Der)' : 'Normal (Mono)'}  |  Barrel: ${data.barrelEnabled ? 'ON' : 'OFF'}  |  IPD: ${data.ipdMm.toFixed(1)} mm`,
      `CABEZA 3DoF :  ${data.sensorLabel}`,
      `ORIENTACIÓN :  Yaw ${fmt(data.euler.yaw)}    Pitch ${fmt(data.euler.pitch)}    Roll ${fmt(data.euler.roll)}`,
      `PASSTHROUGH :  ${data.passthroughStatus || 'Sala virtual 3D'}`,
      `MANOS REAL  :  ${data.handStatus}`,
      `GESTO ACTIVO:  ${data.gestureLabel || '—'}   |   FOCO: ${data.targetLabel || 'Ninguno'}`,
      '',
      'GESTOS REALES (CON CÁMARA ACTIVA):',
      '  • Pinza (pulgar + índice) : Seleccionar botón o agarrar/soltar objeto 3D',
      '  • Puño cerrado            : Agarrar objeto 3D apuntado con láser',
      '  • Mano abierta (0.9s)     : Invocar Menú Flotante de Apps / Inicio',
    ];

    ctx.font = '600 23px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    let y = 98;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i >= 8 ? '#89c4ea' : '#eaf6ff';
      ctx.fillText(lines[i], 38, y);
      y += 42;
    }

    this.texture.needsUpdate = true;
  }
}
