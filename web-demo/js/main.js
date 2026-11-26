import * as THREE from '../vendor/three/three.module.min.js';
import { ProceduralAudio } from './audio.js';
import { StereoRenderer } from './stereoRenderer.js';
import { HeadTracker } from './headTracker.js';
import { VirtualRoom } from './room.js';
import { FloatingMenu3D, TelemetryBoard3D } from './floatingMenu.js';
import { AppsMenu3D } from './appsMenu.js';
import { VRInteractionController } from './interaction.js';
import { CameraManager } from './cameraManager.js';
import { MediaPipeHandTracker } from './handTracking.js';
import { HandTrackingBridge } from './handTrackingHook.js';

/**
 * MobileQuestVR Web (Phase 2) — Entry point & Android Chrome VR / Mixed-Reality lifecycle manager.
 */
class MobileQuestVRWebApp {
  constructor() {
    this.canvas = document.getElementById('vr-canvas');
    this.viewportEl = document.getElementById('vr-viewport');

    this.ui = {
      httpsWarning: document.getElementById('https-warning'),
      btnDismissHttps: document.getElementById('btn-dismiss-https'),
      cameraAlert: document.getElementById('camera-alert'),
      cameraAlertText: document.getElementById('camera-alert-text'),
      btnDismissCameraAlert: document.getElementById('btn-dismiss-camera-alert'),
      externalLinkBar: document.getElementById('external-link-bar'),
      externalLinkTitle: document.getElementById('external-link-title'),
      externalLinkNote: document.getElementById('external-link-note'),
      externalLinkAnchor: document.getElementById('external-link-anchor'),
      btnCloseExternalLink: document.getElementById('btn-close-external-link'),

      hudMono: document.getElementById('hud-mono'),
      hudStereo: document.getElementById('hud-stereo'),
      statusSubtitle: document.getElementById('status-subtitle'),
      pillPassthrough: document.getElementById('pill-passthrough'),
      pillHands: document.getElementById('pill-hands'),
      pillSensor: document.getElementById('pill-sensor'),
      pillFps: document.getElementById('pill-fps'),

      handPipCard: document.getElementById('hand-pip-card'),
      handPipGesture: document.getElementById('hand-pip-gesture'),
      handPipCanvas: document.getElementById('hand-pip-canvas'),
      btnFlipCameraPip: document.getElementById('btn-flip-camera-pip'),

      targetToast: document.getElementById('target-toast'),
      targetLabel: document.getElementById('target-label'),
      grabControls: document.getElementById('grab-controls'),
      btnGrabNear: document.getElementById('btn-grab-near'),
      btnGrabFar: document.getElementById('btn-grab-far'),
      btnGrabRelease: document.getElementById('btn-grab-release'),

      btnHome: document.getElementById('btn-home'),
      btnVrMode: document.getElementById('btn-vr-mode'),
      btnVrModeText: document.getElementById('btn-vr-mode-text'),
      btnPassthrough: document.getElementById('btn-passthrough'),
      btnPassthroughText: document.getElementById('btn-passthrough-text'),
      btnHands: document.getElementById('btn-hands'),
      btnHandsText: document.getElementById('btn-hands-text'),
      btnHead: document.getElementById('btn-head'),
      btnHeadText: document.getElementById('btn-head-text'),
      btnRecenter: document.getElementById('btn-recenter'),
      btnSummonMenu: document.getElementById('btn-summon-menu'),
      btnAction: document.getElementById('btn-action'),
      btnActionText: document.getElementById('btn-action-text'),
      btnFlipCamera: document.getElementById('btn-flip-camera'),
      btnFlipCameraText: document.getElementById('btn-flip-camera-text'),

      btnExitVr: document.getElementById('btn-exit-vr'),
      btnHomeVr: document.getElementById('btn-home-vr'),
      btnRecenterVr: document.getElementById('btn-recenter-vr'),
      btnPassthroughVr: document.getElementById('btn-passthrough-vr'),
      btnHandsVr: document.getElementById('btn-hands-vr'),

      fatalError: document.getElementById('webgl-error'),
      fatalErrorMsg: document.getElementById('webgl-error-msg'),
    };

    this.wakeLock = null;
    this.passthroughEnabled = false;
    this._passthroughBusy = false;
    this._handsBusy = false;
    this._occlusionWarned = false;
    this._alertHideTimeout = null;

    this._fpsFrames = 0;
    this._fpsAccum = 0;
    this._currentFps = 60;
    this._telemetryTimer = 0;
    this._lastTime = performance.now();

    this._init();
  }

  _init() {
    this._checkHttpsBanner();

    try {
      this.audio = new ProceduralAudio();
      this.scene = new THREE.Scene();

      this.stereo = new StereoRenderer(this.canvas);
      this.scene.add(this.stereo.trackingOrigin);

      this.headTracker = new HeadTracker(this.stereo, this.canvas);
      this.room = new VirtualRoom(this.scene, this.audio);
      this.interaction = new VRInteractionController(this.scene, this.stereo.centerEyeAnchor, this.audio);

      // Shared real mobile camera stream manager (Passthrough + MediaPipe Hand Tracking)
      this.cameraManager = new CameraManager();

      // Real MediaPipe Tasks Vision Hand Landmarker (never simulated)
      this.handTracker = new MediaPipeHandTracker({
        scene: this.scene,
        centerEyeAnchor: this.stereo.centerEyeAnchor,
        cameraManager: this.cameraManager,
        pipCanvas: this.ui.handPipCanvas,
        onOpenPalmSummon: () => {
          this.summonHomeApps();
          this._showCameraAlert('Mano abierta detectada: Menú de Inicio / Apps 3D abierto.', 'info', 2800);
        },
      });

      this.handBridge = new HandTrackingBridge();
      this.handBridge.bindProvider(this.handTracker);

      // Meta Quest-style 3D Floating Apps Launcher (Chrome, YouTube, Google, Ajustes, Volver)
      this.appsMenu = new AppsMenu3D(this.scene, this.stereo.centerEyeAnchor, this.audio, {
        onOpenExternalApp: (name, url) => this.openExternalApp(name, url),
        onOpenSettings: () => this.floatingMenu.summonInFrontOfHead(),
        onReturnToVR: () => this.returnToMobileQuestVR(),
      });

      // 3D Floating Settings Panel
      this.floatingMenu = new FloatingMenu3D(this.scene, this.stereo.centerEyeAnchor, this.audio, {
        onRecenter: () => this.recenterView(),
        onSummonApps: () => this.summonHomeApps(),
        onTogglePassthrough: () => this.togglePassthrough(),
        onToggleHands: () => this.toggleHands(),
        onToggleHeadTracking: () => this.toggleHeadTracking(),
        onFlipCamera: () => this.flipCamera(),
        onToggleStereo: () => this.toggleVrMode(),
        onToggleBarrel: () => {
          this.stereo.toggleBarrelDistortion();
          this._syncUiState();
        },
        onAdjustIpd: (deltaMm) => {
          this.stereo.adjustIpdMillimeters(deltaMm);
          this._syncUiState();
        },
        onCycleLighting: () => {
          this.room.cycleLightingPreset();
          this._syncUiState();
        },
        onResetObjects: () => {
          this.room.resetAllGrabbables();
        },
      });

      this.telemetryBoard = new TelemetryBoard3D(this.scene, this.room.telemetryMount);

      // Register room objects, 3D settings menu, and 3D apps launcher into unified raycaster
      this.interaction.registerInteractables(this.room.interactables);
      this.interaction.registerInteractables(this.floatingMenu.interactables);
      this.interaction.registerInteractables(this.appsMenu.interactables);

      // Single tap on canvas unlocks audio and triggers gaze/object interaction
      this.headTracker.onCanvasTap = () => {
        this.audio.unlock();
        this.interaction.triggerPrimaryAction();
      };

      this._bindUiEvents();
      this.headTracker.tryAutoStartSensors();
      this._syncUiState();

      this.ui.statusSubtitle.textContent = 'Entorno 3D activo • Manos MediaPipe y Passthrough listos';
      requestAnimationFrame((t) => this._animate(t));
    } catch (err) {
      console.error('[MobileQuestVR Web] Initialization error:', err);
      this.ui.fatalErrorMsg.textContent = `No se pudo iniciar WebGL: ${err?.message || err}`;
      this.ui.fatalError.classList.remove('hidden');
    }
  }

  _checkHttpsBanner() {
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!window.isSecureContext && !isLocalhost) {
      this.ui.httpsWarning.classList.remove('hidden');
    }
    this.ui.btnDismissHttps.addEventListener('click', () => {
      this.ui.httpsWarning.classList.add('hidden');
    });
  }

  _showCameraAlert(message, tone = 'error', autoHideMs = 0) {
    if (this._alertHideTimeout) {
      clearTimeout(this._alertHideTimeout);
      this._alertHideTimeout = null;
    }

    this.ui.cameraAlertText.textContent = message;
    this.ui.cameraAlert.classList.remove('hidden', 'is-warn', 'is-info');
    if (tone === 'warn') this.ui.cameraAlert.classList.add('is-warn');
    if (tone === 'info') this.ui.cameraAlert.classList.add('is-info');

    if (autoHideMs > 0) {
      this._alertHideTimeout = setTimeout(() => {
        this.ui.cameraAlert.classList.add('hidden');
        this._alertHideTimeout = null;
      }, autoHideMs);
    }
  }

  _hideCameraAlert() {
    if (this._alertHideTimeout) {
      clearTimeout(this._alertHideTimeout);
      this._alertHideTimeout = null;
    }
    this.ui.cameraAlert.classList.add('hidden');
  }

  _bindUiEvents() {
    window.addEventListener('resize', () => {
      this.stereo.resize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('pagehide', () => {
      this._shutdownHardware();
    });

    const unlockOnce = () => {
      this.audio.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });

    this.ui.btnDismissCameraAlert.addEventListener('click', () => {
      this._hideCameraAlert();
    });

    this.ui.btnCloseExternalLink.addEventListener('click', () => {
      this.ui.externalLinkBar.classList.add('hidden');
    });

    // Home / Apps Launcher
    this.ui.btnHome.addEventListener('click', () => {
      this.audio.unlock();
      this.summonHomeApps();
    });
    this.ui.btnHomeVr.addEventListener('click', () => {
      this.audio.unlock();
      this.summonHomeApps();
    });

    // VR Mode / Normal Mode
    this.ui.btnVrMode.addEventListener('click', () => {
      this.audio.unlock();
      this.toggleVrMode();
    });
    this.ui.btnExitVr.addEventListener('click', () => {
      this.audio.unlock();
      this.exitVrMode();
    });

    // Real Camera Passthrough Mode
    this.ui.btnPassthrough.addEventListener('click', () => {
      this.audio.unlock();
      this.togglePassthrough();
    });
    this.ui.btnPassthroughVr.addEventListener('click', () => {
      this.audio.unlock();
      this.togglePassthrough();
    });

    // Real MediaPipe Hand Tracking
    this.ui.btnHands.addEventListener('click', () => {
      this.audio.unlock();
      this.toggleHands();
    });
    this.ui.btnHandsVr.addEventListener('click', () => {
      this.audio.unlock();
      this.toggleHands();
    });

    // Head Tracking ON/OFF
    this.ui.btnHead.addEventListener('click', () => {
      this.audio.unlock();
      this.toggleHeadTracking();
    });

    // Camera Rear / Front switch
    this.ui.btnFlipCamera.addEventListener('click', () => {
      this.audio.unlock();
      this.flipCamera();
    });
    this.ui.btnFlipCameraPip.addEventListener('click', () => {
      this.audio.unlock();
      this.flipCamera();
    });

    // Recenter view
    this.ui.btnRecenter.addEventListener('click', () => {
      this.audio.unlock();
      this.recenterView();
    });
    this.ui.btnRecenterVr.addEventListener('click', () => {
      this.audio.unlock();
      this.recenterView();
    });

    // Contextual touch select/grab button
    this.ui.btnAction.addEventListener('click', () => {
      this.audio.unlock();
      this.interaction.triggerPrimaryAction();
    });

    // Grab distance & release touch controls
    this.ui.btnGrabNear.addEventListener('click', () => {
      this.audio.unlock();
      this.interaction.adjustHoldDistance(-0.22);
    });
    this.ui.btnGrabFar.addEventListener('click', () => {
      this.audio.unlock();
      this.interaction.adjustHoldDistance(0.22);
    });
    this.ui.btnGrabRelease.addEventListener('click', () => {
      this.audio.unlock();
      this.interaction.releaseHeldObject(true);
    });

    // Summon 3D Settings Menu
    this.ui.btnSummonMenu.addEventListener('click', () => {
      this.audio.unlock();
      this.floatingMenu.summonInFrontOfHead();
    });

    // Mouse wheel adjusts held object distance on desktop testing
    this.canvas.addEventListener('wheel', (e) => {
      if (this.interaction.heldItem) {
        this.interaction.adjustHoldDistance(Math.sign(e.deltaY) * -0.14);
      }
    }, { passive: true });

    // Desktop keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR') {
        this.recenterView();
      } else if (e.code === 'KeyM') {
        this.floatingMenu.summonInFrontOfHead();
      } else if (e.code === 'KeyH') {
        this.summonHomeApps();
      } else if (e.code === 'KeyP') {
        this.togglePassthrough();
      } else if (e.code === 'Space') {
        e.preventDefault();
        this.audio.unlock();
        this.interaction.triggerPrimaryAction();
      } else if (e.code === 'KeyV') {
        this.toggleVrMode();
      } else if (e.code === 'Escape' && this.stereo.stereoEnabled) {
        this.exitVrMode();
      }
    });

    document.addEventListener('fullscreenchange', () => {
      this.stereo.resize(window.innerWidth, window.innerHeight);
    });
  }

  summonHomeApps() {
    this.appsMenu.summonInFrontOfHead();
    this.ui.statusSubtitle.textContent = 'Menú de Inicio 3D abierto • Apunta a un icono';
  }

  returnToMobileQuestVR() {
    this.appsMenu.setVisible(false);
    this.ui.externalLinkBar.classList.add('hidden');
    this.recenterView();
    this.ui.statusSubtitle.textContent = this.passthroughEnabled
      ? 'MobileQuestVR • Modo Passthrough con cámara real'
      : 'MobileQuestVR • Habitación Virtual 3D';
  }

  /**
   * Opens external web apps honestly in a new tab / Android compatible app link.
   * Never fakes private apps inside iframes. Shows a 1-tap fallback if popup is blocked
   * (which commonly occurs when invoked by Gaze Dwell or Hand Pinch instead of direct tap).
   */
  openExternalApp(name, url) {
    this.ui.externalLinkTitle.textContent = `Abrir ${name}`;
    this.ui.externalLinkAnchor.href = url;
    this.ui.externalLinkAnchor.textContent = `Abrir ${name} ↗`;

    let opened = null;
    try {
      opened = window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      opened = null;
    }

    if (opened) {
      this.ui.externalLinkNote.textContent = `${name} se abrió en una nueva pestaña externa. Puedes volver aquí en cualquier momento.`;
      this.ui.externalLinkBar.classList.remove('hidden');
      this.ui.statusSubtitle.textContent = `Enlace externo abierto: ${name}`;
    } else {
      this.ui.externalLinkNote.textContent = 'Chrome bloqueó la apertura automática (por mirada/gesto). Pulsa el botón para abrir en nueva pestaña o app Android.';
      this.ui.externalLinkBar.classList.remove('hidden');
      this.ui.statusSubtitle.textContent = `Toca "Abrir ${name} ↗" para continuar`;
    }
  }

  async togglePassthrough() {
    if (this._passthroughBusy) return;

    if (this.passthroughEnabled) {
      this.passthroughEnabled = false;
      this._occlusionWarned = false;
      this.stereo.setPassthrough(false);
      this.room.setPassthroughMode(false);
      this.cameraManager.release('passthrough');
      this._hideCameraAlert();
      this.ui.statusSubtitle.textContent = 'Sala Virtual 3D restaurada';
      this._syncUiState();
      return;
    }

    this._passthroughBusy = true;
    this._syncUiState();

    const res = await this.cameraManager.acquire('passthrough');
    this._passthroughBusy = false;

    if (!res.ok || !this.cameraManager.videoTexture) {
      this.passthroughEnabled = false;
      this.stereo.setPassthrough(false);
      this.room.setPassthroughMode(false);
      this._showCameraAlert(
        res.error || 'No se pudo activar Passthrough: sin acceso a la cámara real.',
        'error'
      );
      this._syncUiState();
      return;
    }

    this.passthroughEnabled = true;
    this._occlusionWarned = false;
    this.room.setPassthroughMode(true);
    this.stereo.setPassthrough(
      true,
      this.cameraManager.videoTexture,
      this.cameraManager.getVideoAspect(),
      !this.cameraManager.isRearCamera
    );

    this.ui.statusSubtitle.textContent = `Passthrough activo (${this.cameraManager.getFacingLabelEs()})`;
    this._showCameraAlert(
      'Modo Passthrough activo con cámara real. Nota: si tus gafas VR tapan la lente trasera, abre la tapa frontal del visor o vuelve a la Sala 3D.',
      'info',
      5500
    );
    this._syncUiState();
  }

  async toggleHands() {
    if (this._handsBusy) return;

    if (this.handTracker.enabled) {
      this.handTracker.disable();
      this.interaction.setExternalPointer(null);
      this._syncUiState();
      this.ui.statusSubtitle.textContent = 'Seguimiento de manos desactivado';
      return;
    }

    this._handsBusy = true;
    this.ui.statusSubtitle.textContent = 'Iniciando cámara y modelo MediaPipe HandLandmarker…';
    this._syncUiState();

    const res = await this.handTracker.enable();
    this._handsBusy = false;

    if (!res.ok) {
      this.interaction.setExternalPointer(null);
      this._showCameraAlert(
        res.error || 'No se pudo activar el seguimiento real de manos MediaPipe.',
        'error'
      );
      this.ui.statusSubtitle.textContent = 'Manos no disponibles (revisa el aviso)';
      this._syncUiState();
      return;
    }

    this.ui.statusSubtitle.textContent = `Manos MediaPipe activo (${this.handTracker.delegateUsed}) • Usa Pinza, Puño o Mano abierta`;
    this._showCameraAlert(
      `Seguimiento real de manos activo (${this.handTracker.delegateUsed}, cámara ${this.cameraManager.getFacingLabelEs().toLowerCase()}). Gestos: Pinza (seleccionar/agarrar), Puño (agarrar), Mano abierta (abrir Inicio).`,
      'info',
      5500
    );
    this._syncUiState();
  }

  async toggleHeadTracking() {
    await this.headTracker.toggleHeadTracking();
    this._syncUiState();
  }

  async flipCamera() {
    if (!this.cameraManager.isActive) return;
    const res = await this.cameraManager.toggleFacingMode();
    if (!res.ok) {
      this._showCameraAlert(res.error || 'No se pudo cambiar de cámara.', 'warn', 4500);
      return;
    }

    this._occlusionWarned = false;
    if (this.passthroughEnabled && this.cameraManager.videoTexture) {
      this.stereo.setPassthrough(
        true,
        this.cameraManager.videoTexture,
        this.cameraManager.getVideoAspect(),
        !this.cameraManager.isRearCamera
      );
    }
    this._showCameraAlert(`Cámara cambiada a: ${this.cameraManager.getFacingLabelEs()}.`, 'info', 2500);
    this._syncUiState();
  }

  async enterVrMode() {
    this.stereo.setStereoEnabled(true);
    this._syncUiState();
    this.audio.play('select');

    if (this.headTracker.headTrackingEnabled) {
      await this.headTracker.enableGyroscope();
    }

    try {
      const rootEl = document.documentElement;
      if (!document.fullscreenElement && rootEl.requestFullscreen) {
        await rootEl.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // Fullscreen may be blocked in embedded iframes; stereo split still works cleanly
    }

    try {
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        await screen.orientation.lock('landscape');
      }
    } catch {
      // Orientation lock optional
    }

    try {
      if ('wakeLock' in navigator && navigator.wakeLock.request) {
        this.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch {
      // WakeLock optional
    }

    this.stereo.resize(window.innerWidth, window.innerHeight);
    this.recenterView();
    this._syncUiState();
  }

  async exitVrMode() {
    this.stereo.setStereoEnabled(false);
    this._syncUiState();

    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore
    }

    try {
      if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      }
    } catch {
      // Ignore
    }

    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch {
        // Ignore
      }
      this.wakeLock = null;
    }

    this.stereo.resize(window.innerWidth, window.innerHeight);
  }

  toggleVrMode() {
    if (this.stereo.stereoEnabled) {
      this.exitVrMode();
    } else {
      this.enterVrMode();
    }
  }

  recenterView() {
    this.headTracker.recenter();
    this.audio.play('recenter');
  }

  _shutdownHardware() {
    this.handTracker?.dispose();
    this.cameraManager?.stopAll();
  }

  _syncUiState() {
    const isStereo = this.stereo.stereoEnabled;
    this.ui.hudMono.classList.toggle('hidden', isStereo);
    this.ui.hudStereo.classList.toggle('hidden', !isStereo);

    // VR / Normal mode button label
    this.ui.btnVrModeText.textContent = isStereo ? 'Modo Normal' : 'Modo VR';

    // Head tracking pill & button
    const headEnabled = this.headTracker.headTrackingEnabled;
    const gyroActive = headEnabled && this.headTracker.sensorActive;
    this.ui.pillSensor.textContent = this.headTracker.sensorStatusLabel;
    this.ui.pillSensor.classList.toggle('pill-active', gyroActive);
    this.ui.pillSensor.classList.toggle('pill-muted', !gyroActive);
    this.ui.btnHeadText.textContent = headEnabled ? 'Cabeza: ON' : 'Cabeza: OFF';
    this.ui.btnHead.classList.toggle('btn-active', headEnabled);

    // Passthrough pill & buttons
    const ptOn = this.passthroughEnabled && this.cameraManager.isActive;
    this.ui.pillPassthrough.textContent = ptOn
      ? `Passthrough (${this.cameraManager.getFacingLabelEs()})`
      : 'Sala 3D';
    this.ui.pillPassthrough.classList.toggle('pill-active', ptOn);
    this.ui.pillPassthrough.classList.toggle('pill-muted', !ptOn);
    this.ui.btnPassthroughText.textContent = this._passthroughBusy
      ? 'Abriendo…'
      : ptOn
        ? 'Sala 3D'
        : 'Passthrough';
    this.ui.btnPassthrough.classList.toggle('btn-active', ptOn);
    this.ui.btnPassthrough.classList.toggle('btn-busy', this._passthroughBusy);
    this.ui.btnPassthroughVr.classList.toggle('btn-active', ptOn);

    // Hand Tracking pill, buttons & Mono 2D PIP
    const handsOn = this.handTracker.enabled;
    const handCount = this.handTracker.detectedHandCount;
    this.ui.pillHands.textContent = this._handsBusy
      ? 'Manos: Cargando…'
      : handsOn
        ? `Manos: ${handCount > 0 ? `${handCount} (${this.handTracker.primaryGestureLabel})` : 'Buscando…'}`
        : 'Manos: OFF';
    this.ui.pillHands.classList.toggle('pill-active', handsOn && handCount > 0);
    this.ui.pillHands.classList.toggle('pill-warn', handsOn && handCount === 0);
    this.ui.pillHands.classList.toggle('pill-muted', !handsOn && !this._handsBusy);

    this.ui.btnHandsText.textContent = this._handsBusy
      ? 'Cargando…'
      : handsOn
        ? 'Manos: ON'
        : 'Manos: OFF';
    this.ui.btnHands.classList.toggle('btn-active', handsOn);
    this.ui.btnHands.classList.toggle('btn-busy', this._handsBusy);
    this.ui.btnHandsVr.classList.toggle('btn-active', handsOn);

    const showPip = !isStereo && handsOn && this.cameraManager.isActive;
    this.ui.handPipCard.classList.toggle('hidden', !showPip);
    if (showPip) {
      this.ui.handPipGesture.textContent = handCount > 0
        ? `Gesto: ${this.handTracker.primaryGestureLabel}`
        : 'Muestra tu mano a la cámara';
    }

    // Camera flip button visible whenever camera is active (Passthrough or Hands)
    const camActive = this.cameraManager.isActive;
    this.ui.btnFlipCamera.classList.toggle('hidden', !camActive);
    this.ui.btnFlipCameraText.textContent = this.cameraManager.getFacingLabelEs();

    // Sync 3D floating settings panel
    this.floatingMenu.syncState({
      stereoEnabled: isStereo,
      barrelEnabled: this.stereo.barrelDistortionEnabled,
      ipdMm: this.stereo.getIpdMillimeters(),
      lightingName: this.room.currentPreset.name,
      sensorLabel: this.headTracker.sensorStatusLabel,
      headEnabled,
      handsEnabled: handsOn,
      handsStatusShort: handsOn
        ? `Manos ON (${this.handTracker.primaryGestureLabel})`
        : 'Manos OFF',
      passthroughEnabled: ptOn,
      cameraFacingLabel: this.cameraManager.getFacingLabelEs().toUpperCase(),
    });
  }

  _animate(now) {
    requestAnimationFrame((t) => this._animate(t));

    const dt = Math.min(Math.max((now - this._lastTime) * 0.001, 0.001), 0.1);
    this._lastTime = now;
    const elapsed = now * 0.001;

    // 1. Head tracking (3DoF DeviceOrientation or touch/mouse fallback)
    this.headTracker.update(dt);

    // 2. Room animations & lightweight physics
    this.room.update(dt, elapsed);

    // 2.5. Monitor live camera luminance for covered/occluded VR visor lens
    this.cameraManager.update(dt);

    // 3. Keep Passthrough video aspect synced as camera orientation changes
    if (this.passthroughEnabled && this.cameraManager.hasLiveFrame()) {
      this.stereo.setPassthrough(
        true,
        this.cameraManager.videoTexture,
        this.cameraManager.getVideoAspect(),
        !this.cameraManager.isRearCamera
      );
    }

    // 4. Real MediaPipe Hand Tracking inference + 3D skeleton + laser pointer
    const showPip = !this.stereo.stereoEnabled && this.handTracker.enabled;
    this.handBridge.update(dt, now, this.interaction, showPip);

    // 5. Unified interaction raycast (hand laser OR gaze reticle), dwell & grab physics
    this.interaction.update(dt);

    // 6. 3D Floating Menus (Settings & Apps Launcher)
    this.floatingMenu.update(dt);
    this.appsMenu.update(dt);

    // 7. Stereoscopic VR or Normal Mono WebGL render (with optional Passthrough backdrop)
    this.stereo.render(this.scene);

    // 8. Live HUD updates, camera occlusion check & 3D Telemetry Board at ~4 Hz
    this._updateLiveHud(dt);
  }

  _updateLiveHud(dt) {
    const isHolding = Boolean(this.interaction.heldItem);
    const hoveredLabel = this.interaction.getStatusLabel();

    if (!this.stereo.stereoEnabled) {
      this.ui.grabControls.classList.toggle('hidden', !isHolding);

      if (hoveredLabel) {
        this.ui.targetLabel.textContent = hoveredLabel;
        this.ui.targetToast.classList.remove('hidden');
        this.ui.btnAction.classList.add('btn-highlight');
        this.ui.btnActionText.textContent = isHolding
          ? 'Soltar'
          : (this.interaction.hovered?.canGrab ? 'Agarrar' : 'Activar');
      } else {
        this.ui.targetToast.classList.add('hidden');
        this.ui.btnAction.classList.remove('btn-highlight');
        this.ui.btnActionText.textContent = 'Interactuar';
      }
    }

    this._fpsFrames++;
    this._fpsAccum += dt;
    this._telemetryTimer += dt;

    if (this._telemetryTimer >= 0.28) {
      this._currentFps = this._fpsAccum > 0.001 ? this._fpsFrames / this._fpsAccum : 60;
      this._fpsFrames = 0;
      this._fpsAccum = 0;
      this._telemetryTimer = 0;

      // Monitor if VR goggles are physically blocking the mobile camera lens
      if (this.cameraManager.isActive && this.cameraManager.hasLiveFrame()) {
        const occluded = this.cameraManager.isCameraLikelyOccluded();
        if (occluded && !this._occlusionWarned) {
          this._occlusionWarned = true;
          this._showCameraAlert(
            '⚠ La cámara se ve casi negra/tapada (las gafas VR pueden estar cubriendo la lente trasera). Abre la tapa frontal del visor, cambia de cámara o vuelve a la Sala Virtual 3D.',
            'warn'
          );
        } else if (!occluded && this._occlusionWarned) {
          this._occlusionWarned = false;
        }
      }

      this.ui.pillFps.textContent = `${Math.round(this._currentFps)} FPS`;
      this._syncUiState();

      const passthroughSummary = this.passthroughEnabled && this.cameraManager.isActive
        ? `Cámara real activa (${this.cameraManager.getFacingLabelEs()})${this._occlusionWarned ? ' [¡LENTE TAPADA!]' : ''}`
        : 'Sala Virtual 3D';

      this.telemetryBoard.refresh({
        fps: this._currentFps,
        stereoEnabled: this.stereo.stereoEnabled,
        barrelEnabled: this.stereo.barrelDistortionEnabled,
        ipdMm: this.stereo.getIpdMillimeters(),
        sensorLabel: this.headTracker.sensorStatusLabel,
        euler: this.headTracker.telemetryEulerDeg,
        targetLabel: hoveredLabel || 'Ninguno',
        handStatus: this.handBridge.getStatusSummary(),
        passthroughStatus: passthroughSummary,
        gestureLabel: this.handTracker.enabled ? this.handTracker.primaryGestureLabel : '—',
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MobileQuestVRWebApp();
});
