import * as THREE from '../vendor/three/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);

// 1 Three.js world meter = 500 CSS px so a 1.92m x 1.08m cinema screen renders at crisp 1:1 native 960x540px
export const WORLD_TO_CSS = 500;
export const PLAYER_CSS_WIDTH = 960;
export const PLAYER_CSS_HEIGHT = 540;

export const SCREEN_SIZE_PRESETS = [
  { id: 'small', label: 'Pequeña (S)', shortLabel: 'S', worldW: 1.36, worldH: 0.765 },
  { id: 'medium', label: 'Mediana (M)', shortLabel: 'M', worldW: 1.92, worldH: 1.08 },
  { id: 'large', label: 'Grande (L)', shortLabel: 'L', worldW: 2.56, worldH: 1.44 },
];

export const CURATED_YOUTUBE_VIDEOS = [
  {
    id: 'M7lc1UVf-VE',
    title: 'Demo oficial YouTube Developers',
    subtitle: 'Vídeo oficial API YouTube (incrustación permitida)',
  },
  {
    id: 'aqz-KE-bpKQ',
    title: 'Big Buck Bunny 4K 60fps',
    subtitle: 'Blender Foundation • Película abierta',
  },
  {
    id: 'eRsGyueVLvQ',
    title: 'Sintel — Cortometraje 3D',
    subtitle: 'Blender Foundation • Cine abierto',
  },
];

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts an 11-character YouTube video ID from any standard YouTube URL
 * (watch, youtu.be, shorts, live, embed, youtube-nocookie) or a raw video ID.
 */
export function parseYouTubeVideoId(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (YOUTUBE_ID_RE.test(trimmed)) {
    return trimmed;
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  const parts = parsed.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const id = parts[0] || '';
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    const vParam = parsed.searchParams.get('v');
    if (vParam && YOUTUBE_ID_RE.test(vParam)) {
      return vParam;
    }

    if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
      const id = parts[1];
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
  }

  return null;
}

export function getYouTubeExternalUrl(videoId) {
  if (!videoId || !YOUTUBE_ID_RE.test(videoId)) {
    return 'https://m.youtube.com/';
  }
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * Maps official YouTube IFrame Player API error codes into clear Spanish messages.
 */
export function describeYouTubeError(code) {
  switch (Number(code)) {
    case 101:
    case 150:
      return {
        isEmbedRestricted: true,
        message: 'Este vídeo no permite reproducción incrustada (restricción del propietario en YouTube, código ' + code + '). Puedes abrirlo directamente en YouTube externo.',
      };
    case 100:
      return {
        isEmbedRestricted: false,
        message: 'Vídeo no encontrado, privado o eliminado en YouTube (código 100).',
      };
    case 2:
      return {
        isEmbedRestricted: false,
        message: 'La URL o identificador del vídeo de YouTube no es válido (código 2).',
      };
    case 5:
      return {
        isEmbedRestricted: false,
        message: 'El reproductor HTML5 de YouTube encontró un problema con este vídeo en el navegador (código 5).',
      };
    default:
      return {
        isEmbedRestricted: true,
        message: `YouTube devolvió un error de reproducción incrustada (código ${code}). Prueba a abrirlo en YouTube externo.`,
      };
  }
}

function epsilon(value) {
  return Math.abs(value) < 1e-10 ? 0 : value;
}

/**
 * Computes exact Three.js-matched CSS3D perspective transform strings so a real DOM YouTube iframe
 * aligns pixel-for-pixel with a 3D WebGL quad in both Mono and Dual-Eye Stereo VR cameras.
 * Automatically culls when behind or clipped by the camera plane so CSS never inverts the quad.
 */
export function computeCss3dProjection(camera, screenObject, worldW, worldH, pxW, pxH, viewW, viewH) {
  const safeW = Math.max(1, viewW);
  const safeH = Math.max(1, viewH);

  camera.updateMatrixWorld(false);
  screenObject.updateMatrixWorld(false);

  // Check all 4 corners in camera space to prevent CSS behind-camera inversion artifacts
  const hw = worldW * 0.5;
  const hh = worldH * 0.5;
  const localCorners = [
    new THREE.Vector3(-hw, hh, 0),
    new THREE.Vector3(hw, hh, 0),
    new THREE.Vector3(-hw, -hh, 0),
    new THREE.Vector3(hw, -hh, 0),
  ];

  let maxCornerZ = -Infinity;
  for (const c of localCorners) {
    c.applyMatrix4(screenObject.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    if (c.z > maxCornerZ) maxCornerZ = c.z;
  }

  // Also ensure the viewer is in front of the screen (front face points along +Z of screenObject)
  const screenWorldPos = new THREE.Vector3();
  const screenWorldQuat = new THREE.Quaternion();
  const camWorldPos = new THREE.Vector3();
  screenObject.getWorldPosition(screenWorldPos);
  screenObject.getWorldQuaternion(screenWorldQuat);
  camera.getWorldPosition(camWorldPos);

  const screenNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(screenWorldQuat);
  const toCamera = camWorldPos.sub(screenWorldPos);
  const frontFacing = screenNormal.dot(toCamera) > 0.02;

  if (maxCornerZ >= -0.08 || !frontFacing) {
    return {
      visible: false,
      fovPx: 600,
      perspectiveOriginX: 50,
      cameraTransform: '',
      objectTransform: '',
    };
  }

  const heightHalf = safeH * 0.5;
  const widthHalf = safeW * 0.5;
  const fovPx = camera.projectionMatrix.elements[5] * heightHalf;
  const frustumShiftX = camera.projectionMatrix.elements[8] || 0;
  const perspectiveOriginX = (0.5 - frustumShiftX * 0.5) * 100;

  // Camera CSS matrix (column-major -> CSS matrix3d, Y inverted, translation scaled by WORLD_TO_CSS)
  const ce = camera.matrixWorldInverse.elements;
  const camTx = ce[12] * WORLD_TO_CSS;
  const camTy = ce[13] * WORLD_TO_CSS;
  const camTz = ce[14] * WORLD_TO_CSS;

  const cameraMatrixCss =
    `matrix3d(${epsilon(ce[0])},${epsilon(-ce[1])},${epsilon(ce[2])},${epsilon(ce[3])},` +
    `${epsilon(ce[4])},${epsilon(-ce[5])},${epsilon(ce[6])},${epsilon(ce[7])},` +
    `${epsilon(ce[8])},${epsilon(-ce[9])},${epsilon(ce[10])},${epsilon(ce[11])},` +
    `${epsilon(camTx)},${epsilon(-camTy)},${epsilon(camTz)},${epsilon(ce[15])})`;

  const cameraTransform = `translateZ(${epsilon(fovPx)}px) ${cameraMatrixCss} translate(${widthHalf}px, ${heightHalf}px)`;

  // Object CSS matrix (scaled to match worldW/worldH in WORLD_TO_CSS px space)
  const scaleX = (worldW * WORLD_TO_CSS) / pxW;
  const scaleY = (worldH * WORLD_TO_CSS) / pxH;
  const objWorld = screenObject.matrixWorld.clone();
  objWorld.elements[12] *= WORLD_TO_CSS;
  objWorld.elements[13] *= WORLD_TO_CSS;
  objWorld.elements[14] *= WORLD_TO_CSS;
  objWorld.multiply(new THREE.Matrix4().makeScale(scaleX, scaleY, 1));

  const oe = objWorld.elements;
  const objectTransform =
    `translate(-50%, -50%) matrix3d(${epsilon(oe[0])},${epsilon(oe[1])},${epsilon(oe[2])},${epsilon(oe[3])},` +
    `${epsilon(-oe[4])},${epsilon(-oe[5])},${epsilon(-oe[6])},${epsilon(-oe[7])},` +
    `${epsilon(oe[8])},${epsilon(oe[9])},${epsilon(oe[10])},${epsilon(oe[11])},` +
    `${epsilon(oe[12])},${epsilon(oe[13])},${epsilon(oe[14])},${epsilon(oe[15])})`;

  return {
    visible: true,
    fovPx,
    perspectiveOriginX,
    cameraTransform,
    objectTransform,
  };
}

// Singleton official YouTube IFrame Player API loader
let ytApiPromise = null;

function loadOfficialYouTubeIframeApi(timeoutMs = 10000) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('YouTube IFrame API requiere un entorno de navegador.'));
  }

  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT);
  }

  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ytApiPromise = null;
        reject(new Error('No se pudo cargar la API oficial de YouTube (comprueba tu conexión o bloqueador de contenido).'));
      }
    }, timeoutMs);

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') {
        try {
          prevReady();
        } catch {
          // Ignore prior handler errors
        }
      }
      if (!settled && window.YT && typeof window.YT.Player === 'function') {
        settled = true;
        clearTimeout(timer);
        resolve(window.YT);
      }
    };

    const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          ytApiPromise = null;
          reject(new Error('Error de red al descargar https://www.youtube.com/iframe_api.'));
        }
      };
      document.head.appendChild(script);
    }
  });

  return ytApiPromise;
}

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

function paintControlButton(canvas, label, state = 'idle', accent = false) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  let bg = 'rgba(13, 28, 52, 0.94)';
  let border = 'rgba(56, 198, 255, 0.62)';

  if (state === 'pressed') {
    bg = 'rgba(34, 214, 150, 0.96)';
    border = '#92ffda';
  } else if (state === 'hover') {
    bg = 'rgba(30, 118, 196, 0.96)';
    border = '#72e8ff';
  } else if (accent === 'play') {
    bg = 'rgba(182, 20, 44, 0.94)';
    border = '#ff6b80';
  } else if (accent === 'close') {
    bg = 'rgba(72, 22, 34, 0.94)';
    border = 'rgba(255, 110, 130, 0.72)';
  }

  drawRoundedRect(ctx, 4, 4, w - 8, h - 8, 16);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = state === 'hover' ? 5 : 3;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.fillStyle = '#f4fbff';
  ctx.font = '800 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w * 0.5, h * 0.5 + 1);
}

/**
 * 3D Floating YouTube Cinema Screen inside MobileQuestVR:
 * - Official YouTube IFrame Player API using https://www.youtube-nocookie.com
 * - Exact Dual-Eye CSS3D projection locked to a 3D WebGL Cinema Frame + 3D Control Bar
 * - Manual Play first (autoplay: 0), synchronized dual-eye stereo playback (left audio, right muted)
 * - Embed-error detection (codes 101/150/etc.) with external YouTube fallback
 */
export class YouTubeCinemaScreen3D {
  constructor({
    scene,
    headAnchor,
    audio,
    stageLeftEl,
    cameraLeftEl,
    cardLeftEl,
    mountLeftEl,
    stageRightEl,
    cameraRightEl,
    cardRightEl,
    mountRightEl,
    callbacks = {},
  }) {
    this.scene = scene;
    this.headAnchor = headAnchor;
    this.audio = audio;
    this.callbacks = callbacks;

    // Dual-eye CSS3D DOM nodes
    this.stageLeftEl = stageLeftEl;
    this.cameraLeftEl = cameraLeftEl;
    this.cardLeftEl = cardLeftEl;
    this.mountLeftEl = mountLeftEl;

    this.stageRightEl = stageRightEl;
    this.cameraRightEl = cameraRightEl;
    this.cardRightEl = cardRightEl;
    this.mountRightEl = mountRightEl;

    // 3D WebGL Cinema Assembly
    this.root = new THREE.Group();
    this.root.name = 'YouTubeCinemaScreen3D';
    this.root.visible = false;
    this.scene.add(this.root);

    this.screenAnchor = new THREE.Object3D();
    this.screenAnchor.name = 'YouTubeScreenAperture';
    this.root.add(this.screenAnchor);

    this.isOpen = false;
    this.isStereoMode = false;
    this.sizeIndex = 1; // Medium (1.92m x 1.08m) by default
    this.currentVideoId = CURATED_YOUTUBE_VIDEOS[0].id;
    this.currentVideoTitle = CURATED_YOUTUBE_VIDEOS[0].title;
    this.playbackState = 'idle'; // 'idle' | 'loading' | 'cued' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'
    this.lastError = '';
    this.isEmbedRestricted = false;

    this._leftPlayer = null;
    this._rightPlayer = null;
    this._leftReady = false;
    this._rightReady = false;
    this._pendingLoadVideoId = null;
    this._syncTimer = 0;
    this._apiLoading = false;

    this._buttons = new Map();
    this.interactables = [];

    this._build3DCinemaFrame();
    this._applyScreenSizeGeometry();
  }

  get currentSizePreset() {
    return SCREEN_SIZE_PRESETS[this.sizeIndex];
  }

  get externalUrl() {
    return getYouTubeExternalUrl(this.currentVideoId);
  }

  _build3DCinemaFrame() {
    // Frame container scaled by screen size
    this._frameGroup = new THREE.Group();
    this.root.add(this._frameGroup);

    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x0b1220,
      roughness: 0.32,
      metalness: 0.62,
    });
    const backMat = new THREE.MeshStandardMaterial({
      color: 0x060b14,
      roughness: 0.55,
      metalness: 0.4,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xff2b4a,
      emissive: 0xff1e3c,
      emissiveIntensity: 1.05,
      roughness: 0.25,
      metalness: 0.2,
    });

    // Opaque cinema backing plane slightly behind the CSS3D aperture (visible from back / while loading)
    this._backPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backMat);
    this._backPlane.position.z = -0.025;
    this._frameGroup.add(this._backPlane);

    // 4 solid border rails forming the outer cinema bezel
    this._bezelTop = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.04), bezelMat);
    this._bezelBottom = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 0.04), bezelMat);
    this._bezelLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.04), bezelMat);
    this._bezelRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.04), bezelMat);

    // Glowing accent strips around outer perimeter
    this._rimTop = new THREE.Mesh(new THREE.BoxGeometry(1, 0.012, 0.012), rimMat);
    this._rimBottom = new THREE.Mesh(new THREE.BoxGeometry(1, 0.012, 0.012), rimMat);

    this._frameGroup.add(
      this._bezelTop,
      this._bezelBottom,
      this._bezelLeft,
      this._bezelRight,
      this._rimTop,
      this._rimBottom
    );

    // Top holographic status bar (video title, state, stereo sync status)
    this._headerCanvas = document.createElement('canvas');
    this._headerCanvas.width = 1024;
    this._headerCanvas.height = 104;
    this._headerTex = new THREE.CanvasTexture(this._headerCanvas);
    this._headerTex.colorSpace = THREE.SRGBColorSpace;
    this._headerMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 0.155),
      new THREE.MeshBasicMaterial({ map: this._headerTex, transparent: true })
    );
    this.root.add(this._headerMesh);

    // Bottom 3D Interactive Control Dock (outside the iframe area so WebGL raycaster/reticle/hands hit it cleanly!)
    this._controlsGroup = new THREE.Group();
    this.root.add(this._controlsGroup);

    const dockBgCanvas = document.createElement('canvas');
    dockBgCanvas.width = 1280;
    dockBgCanvas.height = 148;
    const dctx = dockBgCanvas.getContext('2d');
    drawRoundedRect(dctx, 6, 6, 1268, 136, 26);
    dctx.fillStyle = 'rgba(6, 14, 28, 0.92)';
    dctx.fill();
    dctx.lineWidth = 4;
    dctx.strokeStyle = 'rgba(56, 206, 255, 0.72)';
    dctx.stroke();

    const dockTex = new THREE.CanvasTexture(dockBgCanvas);
    dockTex.colorSpace = THREE.SRGBColorSpace;
    const dockBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.66, 0.19),
      new THREE.MeshBasicMaterial({ map: dockTex, transparent: true })
    );
    this._controlsGroup.add(dockBg);

    const defs = [
      { id: 'play', label: '▶ REPRODUCIR', x: -0.66, w: 0.27, accent: 'play', action: () => this.play() },
      { id: 'pause', label: '⏸ PAUSAR', x: -0.37, w: 0.24, accent: false, action: () => this.pause() },
      { id: 'size', label: 'TAMAÑO: M', x: -0.09, w: 0.25, accent: false, action: () => this.cycleSize() },
      { id: 'url', label: '🔗 VÍDEO / URL', x: 0.20, w: 0.27, accent: false, action: () => this.callbacks.onOpenUrlPicker?.() },
      { id: 'bring', label: '◎ TRAER', x: 0.46, w: 0.20, accent: false, action: () => this.summonInFrontOfHead() },
      { id: 'close', label: '✕ CERRAR', x: 0.69, w: 0.22, accent: 'close', action: () => this.close() },
    ];

    for (const def of defs) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(def.w * 1150);
      canvas.height = 120;
      paintControlButton(canvas, def.label, 'idle', def.accent);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(def.w, 0.115),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      );
      mesh.position.set(def.x, 0, 0.012);
      this._controlsGroup.add(mesh);

      const record = {
        ...def,
        mesh,
        canvas,
        tex,
        baseZ: 0.012,
        hovered: false,
        pressTimer: 0,
        setLabel: (nextLabel) => {
          if (record.label === nextLabel) return;
          record.label = nextLabel;
          paintControlButton(canvas, nextLabel, record.pressTimer > 0 ? 'pressed' : record.hovered ? 'hover' : 'idle', def.accent);
          tex.needsUpdate = true;
        },
      };
      this._buttons.set(def.id, record);

      this.interactables.push({
        mesh,
        label: `YouTube 3D: ${def.label}`,
        canGrab: false,
        onHoverChange: (hovered) => {
          record.hovered = hovered;
          paintControlButton(canvas, record.label, record.pressTimer > 0 ? 'pressed' : hovered ? 'hover' : 'idle', def.accent);
          tex.needsUpdate = true;
        },
        onActivate: () => {
          record.pressTimer = 0.18;
          paintControlButton(canvas, record.label, 'pressed', def.accent);
          tex.needsUpdate = true;
          this.audio.play('select');
          def.action();
        },
      });
    }

    this._paintHeader();
  }

  _applyScreenSizeGeometry() {
    const { worldW, worldH, shortLabel } = this.currentSizePreset;
    const border = 0.055;

    this._backPlane.scale.set(worldW + border * 2, worldH + border * 2, 1);

    this._bezelTop.scale.set(worldW + border * 2, 1, 1);
    this._bezelTop.position.set(0, worldH * 0.5 + border * 0.5, -0.005);

    this._bezelBottom.scale.set(worldW + border * 2, 1, 1);
    this._bezelBottom.position.set(0, -(worldH * 0.5 + border * 0.5), -0.005);

    this._bezelLeft.scale.set(1, worldH + border * 2, 1);
    this._bezelLeft.position.set(-(worldW * 0.5 + border * 0.5), 0, -0.005);

    this._bezelRight.scale.set(1, worldH + border * 2, 1);
    this._bezelRight.position.set(worldW * 0.5 + border * 0.5, 0, -0.005);

    this._rimTop.scale.set(worldW + border * 2 + 0.02, 1, 1);
    this._rimTop.position.set(0, worldH * 0.5 + border + 0.008, 0.012);

    this._rimBottom.scale.set(worldW + border * 2 + 0.02, 1, 1);
    this._rimBottom.position.set(0, -(worldH * 0.5 + border + 0.008), 0.012);

    this._headerMesh.position.set(0, worldH * 0.5 + 0.165, 0.01);
    this._controlsGroup.position.set(0, -(worldH * 0.5 + 0.175), 0.02);

    this._buttons.get('size')?.setLabel(`TAMAÑO: ${shortLabel}`);
    this._paintHeader();
  }

  _paintHeader() {
    const stateTextMap = {
      idle: 'Iniciando reproductor oficial…',
      loading: 'Cargando API oficial de YouTube…',
      cued: 'Listo • Pulsa ▶ Reproducir manualmente',
      playing: this.isStereoMode ? 'Reproduciendo (Estéreo sincronizado 2 ojos)' : 'Reproduciendo en pantalla 3D',
      paused: 'En pausa',
      buffering: 'Cargando búfer de YouTube…',
      ended: 'Vídeo finalizado',
      error: 'Incrustación restringida / Error YouTube',
    };

    const statusLine = stateTextMap[this.playbackState] || 'YouTube 3D VR';
    const key = `${this.currentVideoTitle}|${this.currentVideoId}|${statusLine}|${this.currentSizePreset.shortLabel}`;
    if (this._lastHeaderKey === key) return;
    this._lastHeaderKey = key;

    const ctx = this._headerCanvas.getContext('2d');
    const w = this._headerCanvas.width;
    const h = this._headerCanvas.height;
    ctx.clearRect(0, 0, w, h);

    drawRoundedRect(ctx, 4, 4, w - 8, h - 8, 22);
    ctx.fillStyle = 'rgba(7, 15, 30, 0.92)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.playbackState === 'error' ? 'rgba(255, 92, 114, 0.85)' : 'rgba(255, 56, 86, 0.72)';
    ctx.stroke();

    // Red YouTube badge
    drawRoundedRect(ctx, 22, 24, 68, 52, 14);
    ctx.fillStyle = '#ff0033';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(48, 37);
    ctx.lineTo(72, 50);
    ctx.lineTo(48, 63);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const cleanTitle = this.currentVideoTitle.length > 44
      ? `${this.currentVideoTitle.slice(0, 43)}…`
      : this.currentVideoTitle;
    ctx.fillText(cleanTitle, 110, 18);

    ctx.fillStyle = this.playbackState === 'error' ? '#ffb3be' : '#9ed4f5';
    ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`${statusLine}  •  Pantalla ${this.currentSizePreset.label}`, 110, 56);

    this._headerTex.needsUpdate = true;
  }

  /**
   * Opens the 3D YouTube Cinema Screen inside VR and initializes the official YouTube IFrame Player API.
   * Never autoplays without user action (autoplay: 0).
   */
  async open(videoId = null) {
    if (videoId) {
      const parsed = parseYouTubeVideoId(videoId);
      if (parsed) {
        this.currentVideoId = parsed;
        const known = CURATED_YOUTUBE_VIDEOS.find((v) => v.id === parsed);
        this.currentVideoTitle = known ? known.title : `Vídeo YouTube (${parsed})`;
      }
    }

    const wasOpen = this.isOpen;
    this.isOpen = true;
    this.root.visible = true;
    this.lastError = '';
    this.isEmbedRestricted = false;

    if (!wasOpen) {
      this.summonInFrontOfHead();
    }

    this._syncCssStageVisibility();
    this.callbacks.onOpenStateChange?.(true);

    if (!this._leftPlayer) {
      this.playbackState = 'loading';
      this._paintHeader();
      this._notifyState();
      await this._ensurePlayersCreated();
    } else if (videoId) {
      this._cueVideoOnPlayers(this.currentVideoId);
    }

    if (this.isStereoMode && !this._rightPlayer) {
      await this._ensureRightPlayerCreated();
    }
  }

  close() {
    if (!this.isOpen) return;
    this.pause();
    this.isOpen = false;
    this.root.visible = false;
    this._syncCssStageVisibility();
    this.callbacks.onOpenStateChange?.(false);
    this._notifyState();
  }

  /**
   * Parses a user-entered YouTube URL or 11-char ID and cues it on the official player(s).
   */
  async loadVideo(rawInput, customTitle = null) {
    const parsedId = parseYouTubeVideoId(rawInput);
    if (!parsedId) {
      return {
        ok: false,
        error: 'URL no válida. Pega un enlace real de YouTube (ej. youtube.com/watch?v=... o youtu.be/...) o un ID de 11 caracteres.',
      };
    }

    this.currentVideoId = parsedId;
    const preset = CURATED_YOUTUBE_VIDEOS.find((v) => v.id === parsedId);
    this.currentVideoTitle = customTitle || preset?.title || `YouTube (${parsedId})`;
    this.lastError = '';
    this.isEmbedRestricted = false;
    this.callbacks.onClearError?.();

    if (!this.isOpen) {
      await this.open(parsedId);
      return { ok: true, videoId: parsedId };
    }

    if (this._leftReady && this._leftPlayer) {
      this._cueVideoOnPlayers(parsedId);
    } else {
      this._pendingLoadVideoId = parsedId;
      await this._ensurePlayersCreated();
    }

    this._paintHeader();
    this._notifyState();
    return { ok: true, videoId: parsedId };
  }

  play() {
    if (!this.isOpen) return;
    if (!this._leftPlayer || !this._leftReady) {
      this._ensurePlayersCreated();
      return;
    }

    try {
      this._leftPlayer.unMute?.();
      this._leftPlayer.playVideo();
    } catch (err) {
      console.warn('[MobileQuestVR] Left YouTube play error:', err);
    }

    if (this.isStereoMode && this._rightPlayer && this._rightReady) {
      try {
        const t = typeof this._leftPlayer.getCurrentTime === 'function' ? this._leftPlayer.getCurrentTime() : 0;
        this._rightPlayer.mute();
        if (Number.isFinite(t) && t > 0) {
          this._rightPlayer.seekTo(t, true);
        }
        this._rightPlayer.playVideo();
      } catch (err) {
        console.warn('[MobileQuestVR] Right YouTube play sync error:', err);
      }
    }
  }

  pause() {
    try {
      if (this._leftPlayer && this._leftReady) this._leftPlayer.pauseVideo();
    } catch {
      // Ignore
    }
    try {
      if (this._rightPlayer && this._rightReady) this._rightPlayer.pauseVideo();
    } catch {
      // Ignore
    }
  }

  cycleSize() {
    this.sizeIndex = (this.sizeIndex + 1) % SCREEN_SIZE_PRESETS.length;
    this._applyScreenSizeGeometry();
    this.audio.play('select');
    this._notifyState();
    return this.currentSizePreset;
  }

  setSizePreset(id) {
    const idx = SCREEN_SIZE_PRESETS.findIndex((p) => p.id === id);
    if (idx === -1) return;
    this.sizeIndex = idx;
    this._applyScreenSizeGeometry();
    this._notifyState();
  }

  summonInFrontOfHead(distance = 2.18) {
    const headPos = new THREE.Vector3();
    const headQuat = new THREE.Quaternion();
    this.headAnchor.getWorldPosition(headPos);
    this.headAnchor.getWorldQuaternion(headQuat);

    const flatFwd = FORWARD.clone().applyQuaternion(headQuat);
    flatFwd.y = 0;
    if (flatFwd.lengthSq() < 0.001) flatFwd.set(0, 0, -1);
    flatFwd.normalize();

    const pos = headPos.clone().addScaledVector(flatFwd, distance);
    pos.y = THREE.MathUtils.clamp(headPos.y + 0.06, 1.32, 2.25);
    this.root.position.copy(pos);

    const lookMatrix = new THREE.Matrix4().lookAt(pos, new THREE.Vector3(headPos.x, pos.y - 0.04, headPos.z), UP);
    const quat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
    this.root.quaternion.copy(quat);

    this.audio.play('recenter');
  }

  /**
   * Seamlessly switches between Mono (100% single viewport) and Dual-Eye Stereo VR (50%/50% synced viewports)
   * without destroying or reloading the primary left-eye YouTube player.
   */
  async setStereoMode(stereoEnabled) {
    const next = Boolean(stereoEnabled);
    if (next === this.isStereoMode) return;
    this.isStereoMode = next;

    this._syncCssStageVisibility();

    if (this.isOpen && this.isStereoMode) {
      await this._ensureRightPlayerCreated();
      this._syncRightEyeToLeft(true);
    } else if (!this.isStereoMode && this._rightPlayer && this._rightReady) {
      try {
        this._rightPlayer.pauseVideo();
      } catch {
        // Ignore
      }
    }

    this._paintHeader();
    this._notifyState();
  }

  _syncCssStageVisibility() {
    if (!this.stageLeftEl || !this.stageRightEl) return;

    if (!this.isOpen) {
      this.stageLeftEl.classList.add('hidden');
      this.stageRightEl.classList.add('hidden');
      return;
    }

    this.stageLeftEl.classList.remove('hidden');
    this.stageLeftEl.classList.toggle('is-stereo-left', this.isStereoMode);
    this.stageRightEl.classList.toggle('hidden', !this.isStereoMode);
  }

  _buildPlayerVars(isMutedEye) {
    const vars = {
      autoplay: 0, // Strict manual play — never depend on autoplay
      controls: 1,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      fs: 0,
      enablejsapi: 1,
    };

    if (isMutedEye) {
      vars.mute = 1;
    }

    if (typeof window !== 'undefined' && window.location && /^https?:\/\//i.test(window.location.origin)) {
      vars.origin = window.location.origin;
    }

    return vars;
  }

  async _ensurePlayersCreated() {
    if (this._apiLoading) return;
    if (!this.mountLeftEl) return;

    this._apiLoading = true;
    let YT;
    try {
      YT = await loadOfficialYouTubeIframeApi();
    } catch (err) {
      this._apiLoading = false;
      this.playbackState = 'error';
      this.lastError = err?.message || 'No se pudo cargar la API oficial de YouTube.';
      this.isEmbedRestricted = true;
      this._paintHeader();
      this.callbacks.onPlayerError?.({
        code: -1,
        message: this.lastError,
        externalUrl: this.externalUrl,
        videoId: this.currentVideoId,
      });
      this._notifyState();
      return;
    }
    this._apiLoading = false;

    if (!this._leftPlayer) {
      this._leftPlayer = new YT.Player(this.mountLeftEl, {
        host: 'https://www.youtube-nocookie.com',
        width: String(PLAYER_CSS_WIDTH),
        height: String(PLAYER_CSS_HEIGHT),
        videoId: this.currentVideoId,
        playerVars: this._buildPlayerVars(false),
        events: {
          onReady: (ev) => {
            this._leftReady = true;
            this._hardenIframeAttributes(ev.target);
            this._refreshTitleFromPlayer(ev.target);
            if (this._pendingLoadVideoId) {
              const id = this._pendingLoadVideoId;
              this._pendingLoadVideoId = null;
              this._cueVideoOnPlayers(id);
            } else {
              this.playbackState = 'cued';
              this._paintHeader();
              this._notifyState();
            }
          },
          onStateChange: (ev) => this._handleLeftStateChange(ev),
          onError: (ev) => this._handlePlayerError(ev.data),
        },
      });
    }

    if (this.isStereoMode && !this._rightPlayer) {
      await this._ensureRightPlayerCreated();
    }
  }

  async _ensureRightPlayerCreated() {
    if (this._rightPlayer || !this.mountRightEl) return;
    let YT;
    try {
      YT = await loadOfficialYouTubeIframeApi();
    } catch {
      return;
    }

    if (this._rightPlayer) return;

    this._rightPlayer = new YT.Player(this.mountRightEl, {
      host: 'https://www.youtube-nocookie.com',
      width: String(PLAYER_CSS_WIDTH),
      height: String(PLAYER_CSS_HEIGHT),
      videoId: this.currentVideoId,
      playerVars: this._buildPlayerVars(true),
      events: {
        onReady: (ev) => {
          this._rightReady = true;
          this._hardenIframeAttributes(ev.target);
          try {
            ev.target.mute();
          } catch {
            // Ignore
          }
          this._syncRightEyeToLeft(true);
        },
        onError: (ev) => {
          // Avoid duplicate error toast if left player already reported it
          if (this.playbackState !== 'error') {
            this._handlePlayerError(ev.data);
          }
        },
      },
    });
  }

  _hardenIframeAttributes(player) {
    try {
      const iframe = player?.getIframe?.();
      if (!iframe) return;
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      iframe.setAttribute('playsinline', '1');
    } catch {
      // Ignore
    }
  }

  _refreshTitleFromPlayer(player) {
    try {
      const data = player?.getVideoData?.();
      if (data && data.title) {
        this.currentVideoTitle = data.title;
        this._paintHeader();
      }
    } catch {
      // Ignore
    }
  }

  _cueVideoOnPlayers(videoId) {
    this.playbackState = 'cued';
    try {
      if (this._leftPlayer && this._leftReady) {
        this._leftPlayer.cueVideoById(videoId);
      }
    } catch (err) {
      console.warn('[MobileQuestVR] Error cueing left video:', err);
    }

    try {
      if (this._rightPlayer && this._rightReady) {
        this._rightPlayer.mute();
        this._rightPlayer.cueVideoById(videoId);
      }
    } catch {
      // Ignore
    }

    this._paintHeader();
    this._notifyState();
  }

  _handleLeftStateChange(ev) {
    const YTState = window.YT?.PlayerState || { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
    const st = ev.data;

    this._refreshTitleFromPlayer(ev.target);

    if (st === YTState.PLAYING) {
      this.playbackState = 'playing';
      this.lastError = '';
      this.isEmbedRestricted = false;
      this.callbacks.onClearError?.();
      if (this.isStereoMode) this._syncRightEyeToLeft(true);
    } else if (st === YTState.PAUSED) {
      this.playbackState = 'paused';
      if (this._rightPlayer && this._rightReady) {
        try {
          this._rightPlayer.pauseVideo();
        } catch {
          // Ignore
        }
      }
    } else if (st === YTState.BUFFERING) {
      this.playbackState = 'buffering';
      if (this._rightPlayer && this._rightReady) {
        try {
          this._rightPlayer.pauseVideo();
        } catch {
          // Ignore
        }
      }
    } else if (st === YTState.ENDED) {
      this.playbackState = 'ended';
      if (this._rightPlayer && this._rightReady) {
        try {
          this._rightPlayer.pauseVideo();
        } catch {
          // Ignore
        }
      }
    } else if (st === YTState.CUED || st === YTState.UNSTARTED) {
      this.playbackState = 'cued';
    }

    this._paintHeader();
    this._notifyState();
  }

  _handlePlayerError(code) {
    const info = describeYouTubeError(code);
    this.playbackState = 'error';
    this.lastError = info.message;
    this.isEmbedRestricted = info.isEmbedRestricted;
    this._paintHeader();
    this.callbacks.onPlayerError?.({
      code,
      message: info.message,
      isEmbedRestricted: info.isEmbedRestricted,
      externalUrl: this.externalUrl,
      videoId: this.currentVideoId,
    });
    this._notifyState();
  }

  _syncRightEyeToLeft(forcePlayState = false) {
    if (!this.isStereoMode || !this._leftPlayer || !this._leftReady || !this._rightPlayer || !this._rightReady) {
      return;
    }

    try {
      const YTState = window.YT?.PlayerState || { PLAYING: 1, PAUSED: 2 };
      const leftState = this._leftPlayer.getPlayerState?.();
      const leftTime = this._leftPlayer.getCurrentTime?.() || 0;
      const rightTime = this._rightPlayer.getCurrentTime?.() || 0;
      const rightData = this._rightPlayer.getVideoData?.();

      this._rightPlayer.mute();

      if (rightData && rightData.video_id && rightData.video_id !== this.currentVideoId) {
        if (leftState === YTState.PLAYING) {
          this._rightPlayer.loadVideoById({ videoId: this.currentVideoId, startSeconds: leftTime });
        } else {
          this._rightPlayer.cueVideoById({ videoId: this.currentVideoId, startSeconds: leftTime });
        }
        return;
      }

      if (leftState === YTState.PLAYING) {
        const drift = Math.abs(leftTime - rightTime);
        if (forcePlayState || drift > 0.35) {
          this._rightPlayer.seekTo(leftTime, true);
        }
        if (this._rightPlayer.getPlayerState?.() !== YTState.PLAYING) {
          this._rightPlayer.playVideo();
        }
      } else if (forcePlayState) {
        this._rightPlayer.pauseVideo();
        if (Math.abs(leftTime - rightTime) > 0.5) {
          this._rightPlayer.seekTo(leftTime, true);
        }
      }
    } catch {
      // Ignore transient iframe sync exceptions
    }
  }

  _notifyState() {
    this.callbacks.onStateChange?.({
      isOpen: this.isOpen,
      videoId: this.currentVideoId,
      title: this.currentVideoTitle,
      playbackState: this.playbackState,
      sizePreset: this.currentSizePreset,
      externalUrl: this.externalUrl,
      lastError: this.lastError,
    });
  }

  update(dt, stereoRenderer) {
    if (!this.isOpen) return;

    // Animate 3D control buttons Z feedback
    for (const btn of this._buttons.values()) {
      if (btn.pressTimer > 0) {
        btn.pressTimer = Math.max(0, btn.pressTimer - dt);
        if (btn.pressTimer === 0) {
          paintControlButton(btn.canvas, btn.label, btn.hovered ? 'hover' : 'idle', btn.accent);
          btn.tex.needsUpdate = true;
        }
      }
      const targetZ = btn.pressTimer > 0 ? btn.baseZ - 0.008 : btn.hovered ? btn.baseZ + 0.015 : btn.baseZ;
      btn.mesh.position.z = THREE.MathUtils.lerp(btn.mesh.position.z, targetZ, 1 - Math.exp(-18 * dt));
    }

    // Update exact CSS3D projections locked to the WebGL 3D camera(s)
    if (stereoRenderer) {
      this.root.updateMatrixWorld(true);
      const { worldW, worldH } = this.currentSizePreset;

      if (!stereoRenderer.stereoEnabled) {
        this._applyCss3dEye(
          stereoRenderer.monoCamera,
          this.stageLeftEl,
          this.cameraLeftEl,
          this.cardLeftEl,
          worldW,
          worldH,
          stereoRenderer.width,
          stereoRenderer.height
        );
      } else {
        const halfW = stereoRenderer.width * 0.5;
        this._applyCss3dEye(
          stereoRenderer.leftCamera,
          this.stageLeftEl,
          this.cameraLeftEl,
          this.cardLeftEl,
          worldW,
          worldH,
          halfW,
          stereoRenderer.height
        );
        this._applyCss3dEye(
          stereoRenderer.rightCamera,
          this.stageRightEl,
          this.cameraRightEl,
          this.cardRightEl,
          worldW,
          worldH,
          halfW,
          stereoRenderer.height
        );

        // Periodic gentle drift sync between Left and Right eyes while playing
        this._syncTimer += dt;
        if (this._syncTimer >= 1.2) {
          this._syncTimer = 0;
          if (this.playbackState === 'playing') {
            this._syncRightEyeToLeft(false);
          }
        }
      }
    }
  }

  _applyCss3dEye(camera, stageEl, cameraEl, cardEl, worldW, worldH, viewW, viewH) {
    if (!stageEl || !cameraEl || !cardEl) return;

    const proj = computeCss3dProjection(
      camera,
      this.screenAnchor,
      worldW,
      worldH,
      PLAYER_CSS_WIDTH,
      PLAYER_CSS_HEIGHT,
      viewW,
      viewH
    );

    if (!proj.visible) {
      cardEl.style.visibility = 'hidden';
      cardEl.style.pointerEvents = 'none';
      return;
    }

    stageEl.style.perspective = `${proj.fovPx}px`;
    stageEl.style.perspectiveOrigin = `${proj.perspectiveOriginX}% 50%`;
    cameraEl.style.width = `${viewW}px`;
    cameraEl.style.height = `${viewH}px`;
    cameraEl.style.transform = proj.cameraTransform;

    cardEl.style.visibility = 'visible';
    cardEl.style.pointerEvents = 'auto';
    cardEl.style.transform = proj.objectTransform;
  }

  dispose() {
    this.close();
    try {
      this._leftPlayer?.destroy?.();
    } catch {
      // Ignore
    }
    try {
      this._rightPlayer?.destroy?.();
    } catch {
      // Ignore
    }
    this._leftPlayer = null;
    this._rightPlayer = null;
    this._leftReady = false;
    this._rightReady = false;
  }
}
