import * as THREE from '../vendor/three/three.module.min.js';

/**
 * Shared Android Chrome camera stream manager for both Passthrough and MediaPipe Hand Tracking.
 * Ref-counts active consumers so a single getUserMedia stream serves both features simultaneously
 * without hardware camera contention, and shuts down tracks cleanly when neither needs the camera.
 */
export class CameraManager {
  constructor() {
    this.video = null;
    this._lumaCanvas = null;
    this._lumaCtx = null;

    if (typeof document !== 'undefined') {
      this.video = document.createElement('video');
      this.video.playsInline = true;
      this.video.muted = true;
      this.video.autoplay = true;
      this.video.setAttribute('playsinline', '');
      this.video.setAttribute('muted', '');
      this.video.style.display = 'none';
      if (document.body) {
        document.body.appendChild(this.video);
      }

      // Tiny offscreen canvas for periodic dark/covered-lens occlusion detection
      this._lumaCanvas = document.createElement('canvas');
      this._lumaCanvas.width = 16;
      this._lumaCanvas.height = 16;
      this._lumaCtx = this._lumaCanvas.getContext('2d', { willReadFrequently: true });
    }

    this.stream = null;
    this.videoTexture = null;
    this.facingMode = 'environment'; // Rear camera by default for VR passthrough & first-person hands
    this.isActive = false;
    this.lastError = '';
    this.isOccludedWarning = false;

    this._consumers = new Set();
    this._pendingPromise = null;

    this._lumaTimer = 0;
    this._darkSeconds = 0;

    this.onOcclusionChange = null;
  }

  static checkBrowserSupport() {
    const loc = typeof location !== 'undefined' ? location : (typeof window !== 'undefined' ? window.location : null);
    const hostname = loc ? loc.hostname : '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const secure = typeof window !== 'undefined' && Boolean(window.isSecureContext);
    if (!secure && !isLocalhost) {
      return {
        supported: false,
        reason: 'El acceso a la cámara requiere abrir la web mediante HTTPS (por ejemplo, GitHub Pages).',
      };
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      return {
        supported: false,
        reason: 'Este navegador no soporta navigator.mediaDevices.getUserMedia para acceder a la cámara.',
      };
    }
    return { supported: true, reason: '' };
  }

  checkSupport() {
    const res = CameraManager.checkBrowserSupport();
    return { ok: res.supported, error: res.reason };
  }

  getFacingLabelEs() {
    return this.isRearCamera ? 'Trasera' : 'Frontal';
  }

  isCameraLikelyOccluded() {
    return Boolean(this.isOccludedWarning);
  }

  stopAll() {
    this._consumers.clear();
    this._stopStream();
  }

  getVideoAspect() {
    if (this.video && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
      return this.video.videoWidth / this.video.videoHeight;
    }
    return 4 / 3;
  }

  get isRearCamera() {
    return this.facingMode === 'environment';
  }

  hasLiveFrame() {
    return this.isActive && this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.videoHeight > 0;
  }

  /**
   * Acquires the shared camera stream for a named consumer ('hands' or 'passthrough').
   * Returns { ok: boolean, error: string }.
   */
  async acquire(consumerId) {
    const support = CameraManager.checkBrowserSupport();
    if (!support.supported) {
      this.lastError = support.reason;
      return { ok: false, error: support.reason };
    }

    this._consumers.add(consumerId);

    if (this.isActive && this.stream) {
      return { ok: true, error: '' };
    }

    if (this._pendingPromise) {
      const res = await this._pendingPromise;
      if (!res.ok) this._consumers.delete(consumerId);
      return res;
    }

    this._pendingPromise = this._startStream(this.facingMode);
    const result = await this._pendingPromise;
    this._pendingPromise = null;

    if (!result.ok) {
      this._consumers.delete(consumerId);
    }
    return result;
  }

  release(consumerId) {
    this._consumers.delete(consumerId);
    if (this._consumers.size === 0) {
      this._stopStream();
    }
  }

  /**
   * Switches between rear ('environment') and front ('user') camera while preserving active consumers.
   */
  async toggleFacingMode() {
    const nextFacing = this.facingMode === 'environment' ? 'user' : 'environment';
    if (this._consumers.size === 0) {
      this.facingMode = nextFacing;
      return { ok: true, facingMode: this.facingMode, error: '' };
    }

    this._stopStream();
    const res = await this._startStream(nextFacing);
    if (!res.ok) {
      // Attempt to restore previous camera if target facing mode does not exist on this device
      await this._startStream(this.facingMode);
      return { ok: false, facingMode: this.facingMode, error: res.error };
    }
    return { ok: true, facingMode: this.facingMode, error: '' };
  }

  /**
   * Samples low-res average brightness every ~1.2s to warn the user if the VR headset visor
   * is physically blocking the phone's rear camera.
   */
  update(dt) {
    if (!this.hasLiveFrame()) {
      this._darkSeconds = 0;
      this._setOcclusion(false);
      return;
    }

    this._lumaTimer += dt;
    if (this._lumaTimer < 1.2) return;
    this._lumaTimer = 0;

    try {
      this._lumaCtx.drawImage(this.video, 0, 0, 16, 16);
      const pixels = this._lumaCtx.getImageData(0, 0, 16, 16).data;
      let lumaSum = 0;
      const count = 16 * 16;
      for (let i = 0; i < pixels.length; i += 4) {
        lumaSum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      }
      const avgLuma = lumaSum / count;

      if (avgLuma < 11) {
        this._darkSeconds += 1.2;
        if (this._darkSeconds >= 2.4) {
          this._setOcclusion(true);
        }
      } else {
        this._darkSeconds = 0;
        this._setOcclusion(false);
      }
    } catch {
      // Ignore transient canvas read errors
    }
  }

  _setOcclusion(occluded) {
    if (this.isOccludedWarning === occluded) return;
    this.isOccludedWarning = occluded;
    if (typeof this.onOcclusionChange === 'function') {
      this.onOcclusionChange(occluded);
    }
  }

  async _startStream(preferredFacing) {
    const constraintsList = [
      {
        video: {
          facingMode: { exact: preferredFacing },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      },
      {
        video: {
          facingMode: { ideal: preferredFacing },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let stream = null;
    let lastErr = null;

    for (const constraints of constraintsList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        lastErr = err;
        // Stop retrying immediately if user explicitly denied permission
        if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError')) {
          break;
        }
      }
    }

    if (!stream) {
      const msg = this._formatCameraError(lastErr);
      this.lastError = msg;
      this.isActive = false;
      return { ok: false, error: msg };
    }

    try {
      this.stream = stream;
      this.video.srcObject = stream;

      // Determine actual facing mode reported by the browser track
      const track = stream.getVideoTracks()[0];
      const settings = track && typeof track.getSettings === 'function' ? track.getSettings() : {};
      this.facingMode = settings.facingMode || preferredFacing;

      await this._waitForVideoReady(this.video);

      if (!this.videoTexture) {
        this.videoTexture = new THREE.VideoTexture(this.video);
        this.videoTexture.colorSpace = THREE.SRGBColorSpace;
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;
        this.videoTexture.generateMipmaps = false;
      } else {
        this.videoTexture.needsUpdate = true;
      }

      this.isActive = true;
      this.lastError = '';
      this._darkSeconds = 0;
      this._setOcclusion(false);
      return { ok: true, error: '' };
    } catch (err) {
      this._stopStream();
      const msg = `No se pudo iniciar la transmisión de vídeo de la cámara: ${err?.message || err}`;
      this.lastError = msg;
      return { ok: false, error: msg };
    }
  }

  _waitForVideoReady(videoEl) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Tiempo de espera agotado al recibir vídeo de la cámara.'));
        }
      }, 6000);

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };

      const onMeta = () => {
        videoEl.play().then(finish).catch(fail);
      };

      if (videoEl.readyState >= 2) {
        videoEl.play().then(finish).catch(fail);
      } else {
        videoEl.addEventListener('loadedmetadata', onMeta, { once: true });
      }
    });
  }

  _stopStream() {
    this.isActive = false;
    this._darkSeconds = 0;
    this._setOcclusion(false);

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      }
      this.stream = null;
    }

    this.video.srcObject = null;
  }

  _formatCameraError(err) {
    if (!err) return 'No se pudo acceder a la cámara del dispositivo.';
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Permiso de cámara denegado. Permite el acceso a la cámara en los ajustes de Chrome Android.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No se detectó ninguna cámara disponible en este dispositivo.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'La cámara está siendo usada por otra aplicación o el sistema impide abrirla.';
      case 'SecurityError':
        return 'Acceso a la cámara bloqueado por seguridad (se requiere HTTPS).';
      default:
        return `Error de cámara (${err.name || 'desconocido'}): ${err.message || 'no disponible'}`;
    }
  }

  dispose() {
    this._consumers.clear();
    this._stopStream();
    if (this.videoTexture) {
      this.videoTexture.dispose();
      this.videoTexture = null;
    }
    if (this.video.parentNode) {
      this.video.parentNode.removeChild(this.video);
    }
  }
}
