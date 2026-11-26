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

function drawAppIcon(ctx, iconType, cx, cy, r) {
  ctx.save();
  switch (iconType) {
    case 'chrome': {
      // Tri-color circular browser emblem + blue center core
      const segs = [
        { start: -Math.PI * 0.85, end: -Math.PI * 0.15, color: '#ea4335' },
        { start: -Math.PI * 0.15, end: Math.PI * 0.55, color: '#fbbc05' },
        { start: Math.PI * 0.55, end: Math.PI * 1.15, color: '#34a853' },
      ];
      for (const s of segs) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, s.start, s.end);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.48, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.37, 0, Math.PI * 2);
      ctx.fillStyle = '#4285f4';
      ctx.fill();
      break;
    }

    case 'youtube': {
      drawRoundedRect(ctx, cx - r * 1.12, cy - r * 0.78, r * 2.24, r * 1.56, r * 0.36);
      ctx.fillStyle = '#ff0033';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.30, cy - r * 0.40);
      ctx.lineTo(cx + r * 0.48, cy);
      ctx.lineTo(cx - r * 0.30, cy + r * 0.40);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }

    case 'google': {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.font = `800 ${Math.round(r * 1.32)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#4285f4';
      ctx.fillText('G', cx, cy + 2);

      // Colored accent arc around ring
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.92, -Math.PI * 0.75, -Math.PI * 0.15);
      ctx.strokeStyle = '#ea4335';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.92, Math.PI * 0.35, Math.PI * 0.95);
      ctx.strokeStyle = '#34a853';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.92, Math.PI * 0.95, Math.PI * 1.25);
      ctx.strokeStyle = '#fbbc05';
      ctx.stroke();
      break;
    }

    case 'settings': {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#143356';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#38e2ff';
      ctx.stroke();

      // Gear teeth
      ctx.fillStyle = '#d9f6ff';
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * r * 0.52, cy + Math.sin(a) * r * 0.52);
        ctx.rotate(a);
        ctx.fillRect(-r * 0.14, -r * 0.11, r * 0.28, r * 0.22);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.44, 0, Math.PI * 2);
      ctx.fillStyle = '#d9f6ff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.20, 0, Math.PI * 2);
      ctx.fillStyle = '#143356';
      ctx.fill();
      break;
    }

    case 'home': {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0e3c4a';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#28f0a2';
      ctx.stroke();

      // Stylized VR headset silhouette
      drawRoundedRect(ctx, cx - r * 0.62, cy - r * 0.34, r * 1.24, r * 0.68, r * 0.22);
      ctx.fillStyle = '#eafff6';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, cy, r * 0.16, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.25, cy, r * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#0e3c4a';
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function paintTileCanvas(canvas, title, subtitle, iconType, state = 'idle') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const bg = state === 'pressed'
    ? 'rgba(30, 198, 142, 0.94)'
    : state === 'hover'
      ? 'rgba(26, 98, 168, 0.95)'
      : 'rgba(11, 26, 48, 0.92)';

  const border = state === 'pressed'
    ? '#8cffd8'
    : state === 'hover'
      ? '#6be6ff'
      : 'rgba(64, 196, 255, 0.48)';

  drawRoundedRect(ctx, 6, 6, w - 12, h - 12, 26);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = state === 'hover' ? 6 : 3;
  ctx.strokeStyle = border;
  ctx.stroke();

  drawAppIcon(ctx, iconType, w * 0.5, h * 0.39, 54);

  ctx.fillStyle = '#f2faff';
  ctx.font = '800 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, w * 0.5, h * 0.74);

  ctx.fillStyle = '#9ec6e8';
  ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(subtitle, w * 0.5, h * 0.87);
}

/**
 * Meta Quest-style 3D Floating Application Launcher Dock.
 * Displays 3D interactive icon tiles for Chrome, YouTube, Google, Ajustes, and Volver a MobileQuestVR.
 * External services open honestly as external browser/app links (never fake iframes).
 */
export class AppsMenu3D {
  constructor(scene, headAnchor, audio, actions) {
    this.scene = scene;
    this.headAnchor = headAnchor;
    this.audio = audio;
    this.actions = actions;

    this.root = new THREE.Group();
    this.root.name = 'AppsMenu3D';
    this.scene.add(this.root);

    this.visible = true;
    this.interactables = [];
    this._tiles = [];

    this._buildDock();
    this.snapToPose(-22, 1.56, -0.22);
  }

  _buildDock() {
    const dockW = 1.18;
    const dockH = 0.42;

    // Dock translucent holo backdrop
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 1180;
    bgCanvas.height = 420;
    const ctx = bgCanvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 420);
    grad.addColorStop(0, 'rgba(7, 17, 36, 0.90)');
    grad.addColorStop(1, 'rgba(4, 10, 24, 0.94)');
    drawRoundedRect(ctx, 8, 8, 1164, 404, 34);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(56, 206, 255, 0.80)';
    ctx.stroke();

    ctx.fillStyle = '#38e2ff';
    ctx.font = '800 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('INICIO  •  MENÚ FLOTANTE DE APLICACIONES', 590, 44);

    ctx.fillStyle = 'rgba(154, 194, 228, 0.82)';
    ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('YouTube abre el Cine 3D en VR  •  Chrome y Google abren enlaces externos', 590, 386);

    const bgTex = new THREE.CanvasTexture(bgCanvas);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    const bgMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(dockW, dockH),
      new THREE.MeshBasicMaterial({ map: bgTex, transparent: true, side: THREE.DoubleSide })
    );
    this.root.add(bgMesh);

    const apps = [
      {
        id: 'chrome',
        title: 'Chrome',
        subtitle: 'Enlace web ↗',
        icon: 'chrome',
        onClick: () => this.actions.onOpenExternalApp('Chrome', 'https://www.google.com/chrome/'),
      },
      {
        id: 'youtube',
        title: 'YouTube',
        subtitle: 'Cine 3D VR',
        icon: 'youtube',
        onClick: () => {
          if (typeof this.actions.onOpenYouTubeVR === 'function') {
            this.actions.onOpenYouTubeVR();
          } else {
            this.actions.onOpenExternalApp('YouTube', 'https://m.youtube.com/');
          }
        },
      },
      {
        id: 'google',
        title: 'Google',
        subtitle: 'Buscador ↗',
        icon: 'google',
        onClick: () => this.actions.onOpenExternalApp('Google', 'https://www.google.com/'),
      },
      {
        id: 'settings',
        title: 'Ajustes',
        subtitle: 'Panel VR 3D',
        icon: 'settings',
        onClick: () => this.actions.onOpenSettings(),
      },
      {
        id: 'home',
        title: 'MobileQuestVR',
        subtitle: 'Volver a sala',
        icon: 'home',
        onClick: () => this.actions.onReturnToVR(),
      },
    ];

    const tileW = 0.205;
    const tileH = 0.255;
    const spacing = 0.222;
    const startX = -((apps.length - 1) * spacing) * 0.5;

    apps.forEach((app, idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 290;
      paintTileCanvas(canvas, app.title, app.subtitle, app.icon, 'idle');

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(tileW, tileH),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      );
      mesh.position.set(startX + idx * spacing, -0.008, 0.014);
      this.root.add(mesh);

      const tile = {
        ...app,
        mesh,
        canvas,
        tex,
        baseZ: 0.014,
        hovered: false,
        pressTimer: 0,
      };
      this._tiles.push(tile);

      this.interactables.push({
        mesh,
        label: `App: ${app.title}`,
        canGrab: false,
        onHoverChange: (hovered) => {
          tile.hovered = hovered;
          paintTileCanvas(canvas, app.title, app.subtitle, app.icon, tile.pressTimer > 0 ? 'pressed' : hovered ? 'hover' : 'idle');
          tex.needsUpdate = true;
        },
        onActivate: () => {
          tile.pressTimer = 0.2;
          paintTileCanvas(canvas, app.title, app.subtitle, app.icon, 'pressed');
          tex.needsUpdate = true;
          this.audio.play('select');
          app.onClick();
        },
      });
    });
  }

  summonInFrontOfHead() {
    this.visible = true;
    this.root.visible = true;
    this.snapToPose(0, 1.48, -0.14);
    this.audio.play('recenter');
  }

  setVisible(isVisible) {
    this.visible = Boolean(isVisible);
    this.root.visible = this.visible;
    for (const tile of this._tiles) {
      tile.mesh.visible = this.visible;
    }
  }

  snapToPose(yawOffsetDeg = 0, distance = 1.52, verticalOffset = -0.16) {
    const headPos = new THREE.Vector3();
    const headQuat = new THREE.Quaternion();
    this.headAnchor.getWorldPosition(headPos);
    this.headAnchor.getWorldQuaternion(headQuat);

    const flatFwd = FORWARD.clone().applyQuaternion(headQuat);
    flatFwd.y = 0;
    if (flatFwd.lengthSq() < 0.001) flatFwd.set(0, 0, -1);
    flatFwd.normalize();

    const dir = flatFwd.applyAxisAngle(UP, THREE.MathUtils.degToRad(-yawOffsetDeg));
    const pos = headPos.clone().addScaledVector(dir, distance);
    pos.y = THREE.MathUtils.clamp(headPos.y + verticalOffset, 1.02, 2.05);
    this.root.position.copy(pos);

    const lookMatrix = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(headPos.x, pos.y + 0.08, headPos.z), UP);
    const quat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
    this.root.quaternion.copy(quat);
  }

  update(dt) {
    if (!this.visible) return;
    for (const tile of this._tiles) {
      if (tile.pressTimer > 0) {
        tile.pressTimer = Math.max(0, tile.pressTimer - dt);
        if (tile.pressTimer === 0) {
          paintTileCanvas(tile.canvas, tile.title, tile.subtitle, tile.icon, tile.hovered ? 'hover' : 'idle');
          tile.tex.needsUpdate = true;
        }
      }
      const targetZ = tile.pressTimer > 0 ? tile.baseZ - 0.008 : tile.hovered ? tile.baseZ + 0.018 : tile.baseZ;
      tile.mesh.position.z = THREE.MathUtils.lerp(tile.mesh.position.z, targetZ, 1 - Math.exp(-18 * dt));
    }
  }
}
