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
import { YouTubeCinemaScreen3D, CURATED_YOUTUBE_VIDEOS } from './youtubeScreen.js';

/**
 * MobileQuestVR Web — Entry point & Android Chrome VR / Mixed-Reality / 3D YouTube Cinema manager.
 */
class MobileQuestVRWebApp {
  constructor() {
    this.canvas = document.getElementById('vr-canvas');
    this.viewportEl = document.getElementById('vr-viewport');

    this.ui = {
      // CSS3D Dual-Eye YouTube Stage
      css3dLeft: document.getElementById('css3d-left'),
      css3dCameraLeft: document.getElementById('css3d-camera-left'),
      ytCardLeft: document.getElementById('yt-card-left'),
      ytPlayerLeft: document.getElementById('yt-player-left'),
      css3dRight: document.getElementById('css3d-right'),
      css3dCameraRight: document.getElementById('css3d-camera-right'),
      ytCardRight: document.getElementById('yt-card-right'),
      ytPlayerRight: document.getElementById('yt-player-right'),

      // Banners & Modals
      httpsWarning: document.getElementById('https-warning'),
      btnDismissHttps: document.getElementById('btn-dismiss-https'),
      cameraAlert: document.getElementById('camera-alert'),
      cameraAlertText: document.getElementById('camera-alert-text'),
      btnDismissCameraAlert: document.getElementById('btn-dismiss-camera-alert'),

      youtubeErrorBanner: document.getElementById('youtube-error-banner'),
      ytErrorText: document.getElementById('yt-error-text'),
      ytErrorExternalLink: document.getElementById('yt-error-external-link'),
      btnYtErrorPick: document.getElementById('btn-yt-error-pick'),
      btnYtErrorClose: document.getElementById('btn-yt-error-close'),

      externalLinkBar: document.getElementById('external-link-bar'),
      externalLinkTitle: document.getElementById('external-link-title'),
      externalLinkNote: document.getElementById('external-link-note'),
      externalLinkAnchor: document.getElementById('external-link-anchor'),
      btnCloseExternalLink: document.getElementById('btn-close-external-link'),

      youtubePickerModal: document.getElementById('youtube-picker-modal'),
      btnYtPickerClose: document.getElementById('btn-yt-picker-close'),
      btnYtPickerDone: document.getElementById('btn-yt-picker-done'),
      ytUrlForm: document.getElementById('yt-url-form'),
      ytUrlInput: document.getElementById('yt-url-input'),
      ytUrlError: document.getElementById('yt-url-error'),
      ytPresetsList: document.getElementById('yt-presets-list'),
      ytPickerExternalLink: document.getElementById('yt-picker-external-link'),

      // Mono HUD
      hudMono: document.getElementById('hud-mono'),
      hudStereo: document.getElementById('hud-stereo'),
      statusSubtitle: document.getElementById('status-subtitle'),
      pillYoutube: document.getElementById('pill-youtube'),
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

      youtubeControlsBar: document.getElementById('youtube-controls-bar'),
      btnYtPlay: document.getElementById('btn-yt-play'),
      btnYtPause: document.getElementById('btn-yt-pause'),
      btnYtSize: document.getElementById('btn-yt-size'),
      btnYtPick: document.getElementById('btn-yt-pick'),
      btnYtBring: document.getElementById('btn-yt-bring'),
      btnYtClose: document.getElementById('btn-yt-close'),

      grabControls: document.getElementById('grab-controls'),
      btnGrabNear: document.getElementById('btn-grab-near'),
      btnGrabFar: document.getElementById('btn-grab-far'),
      btnGrabRelease: document.getElementById('btn-grab-release'),

      btnHome: document.getElementById('btn-home'),
      btnYoutubeOpen: document.getElementById('btn-youtube-open'),
      btnYoutubeOpenText: document.getElementById('btn-youtube-open-text'),
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

      // Stereo HUD
      btnExitVr: document.getElementById('btn-exit-vr'),
      btnHomeVr: document.getElementById('btn-home-vr'),
      btnRecenterVr: document.getElementById('btn-recenter-vr'),
      btnPassthroughVr: document.getElementById('btn-passthrough-vr'),
      btnHandsVr: document.getElementById('btn-hands-vr'),
      btnYtPlayVr: document.getElementById('btn-yt-play-vr'),
      btnYtPauseVr: document.getElementById('btn-yt-pause-vr'),
      btnYtSizeVr: document.getElementById('btn-yt-size-vr'),
      btnYtCloseVr: document.getElementById('btn-yt-close-vr'),

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

      // Real Official YouTube 3D Cinema Screen (Dual-Eye CSS3D + 3D WebGL Frame + 3D Controls)
      this.youtubeScreen = new YouTubeCinemaScreen3D({
        scene: this.scene,
        headAnchor: this.stereo.centerEyeAnchor,
        audio: this.audio,
        stageLeftEl: this.ui.css3dLeft,
        cameraLeftEl: this.ui.css3dCameraLeft,
        cardLeftEl: this.ui.ytCardLeft,
        mountLeftEl: this.ui.ytPlayerLeft,
        stageRightEl: this.ui.css3dRight,
        cameraRightEl: this.ui.css3dCameraRight,
        cardRightEl: this.ui.ytCardRight,
        mountRightEl: this.ui.ytPlayerRight,
        callbacks: {
          onOpenUrlPicker: () => this.openYouTubePicker(),
          onOpenStateChange: (isOpen) => {
            // Keep WebGL and CSS3D YouTube aligned pixel-for-pixel in Stereo VR
            this.stereo.setForceDirectStereo(isOpen);
            if (!isOpen) {
              this._hideYouTubeError();
            }
            this._syncUiState();
          },
          onStateChange: () => {
            this._syncUiState();
          },
          onPlayerError: (errInfo) => {
            this._showYouTubeError(errInfo);
          },
          onClearError: () => {
            this._hideYouTubeError();
          },
        },
      });

      // Meta Quest-style 3D Floating Apps Launcher (Chrome, YouTube 3D VR, Google, Ajustes, Volver)
      this.appsMenu = new AppsMenu3D(this.scene, this.stereo.centerEyeAnchor, this.audio, {
        onOpenExternalApp: (name, url) => this.openExternalApp(name, url),
        onOpenYouTubeVR: () => this.openYouTubeCinema(),
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

      // Register room objects, 3D settings menu, 3D apps launcher, and 3D YouTube cinema controls
      this.interaction.registerInteractables(this.room.interactables);
      this.interaction.registerInteractables(this.floatingMenu.interactables);
      this.interaction.registerInteractables(this.appsMenu.interactables);
      this.interaction.registerInteractables(this.youtubeScreen.interactables);

      // Single tap on canvas unlocks audio and triggers gaze/object interaction
      this.headTracker.onCanvasTap = () => {
        this.audio.unlock();
        this.interaction.triggerPrimaryAction();
      };

      this._populateYouTubePresets();
      this._bindUiEvents();
      this.headTracker.tryAutoStartSensors();
      this._syncUiState();

      this.ui.statusSubtitle.textContent = 'Entorno 3D activo • YouTube 3D, Manos MediaPipe y Passthrough listos';
      requestAnimationFrame((t) => this._animate(t));
    } catch (err) {
      console.error('[MobileQuestVR Web] Initialization error:', err);
      this.ui.fatalErrorMsg.textContent = `No se pudo iniciar WebGL: ${err?.message || err}`;
      this.ui.fatalError.classList.remove('hidden');
    }
  }

  _populateYouTubePresets() {
    if (!this.ui.ytPresetsList) return;
    this.ui.ytPresetsList.innerHTML = '';

    for (const preset of CURATED_YOUTUBE_VIDEOS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'yt-preset-btn';
      btn.innerHTML = `<strong>${preset.title}</strong><span>${preset.subtitle}</span>`;
      btn.addEventListener('click', async () => {
        this.audio.unlock();
        this.ui.ytUrlError.classList.add('hidden');
        this.closeYouTubePicker();
        await this.youtubeScreen.loadVideo(preset.id, preset.title);
        this.ui.statusSubtitle.textContent = `YouTube 3D listo: ${preset.title} (pulsa ▶ manualmente)`;
      });
      this.ui.ytPresetsList.appendChild(btn);
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

  _showYouTubeError(errInfo) {
    this.ui.ytErrorText.textContent = errInfo.message || 'Este vídeo no permite reproducción incrustada en YouTube.';
    this.ui.ytErrorExternalLink.href = errInfo.externalUrl || this.youtubeScreen.externalUrl;
    this.ui.youtubeErrorBanner.classList.remove('hidden');
    this.ui.statusSubtitle.textContent = 'YouTube: vídeo bloqueado para incrustar (enlace externo disponible)';
  }

  _hideYouTubeError() {
    this.ui.youtubeErrorBanner.classList.add('hidden');
  }

  openYouTubePicker() {
    this.ui.ytUrlError.classList.add('hidden');
    this.ui.ytPickerExternalLink.href = this.youtubeScreen.externalUrl;
    this.ui.youtubePickerModal.classList.remove('hidden');
  }

  closeYouTubePicker() {
    this.ui.youtubePickerModal.classList.add('hidden');
  }

  async openYouTubeCinema() {
    this.appsMenu.setVisible(false);
    await this.youtubeScreen.open();
    if (this.stereo.stereoEnabled) {
      await this.youtubeScreen.setStereoMode(true);
      this._showCameraAlert(
        'YouTube 3D activo en Modo Estéreo (2 ojos sincronizados con youtube-nocookie.com y proyección directa alineada). Pulsa ▶ manualmente para iniciar.',
        'info',
        5500
      );
    } else {
      this._showCameraAlert(
        'Pantalla flotante 3D de YouTube lista. Pulsa ▶ Reproducir manualmente o toca 🔗 Cambiar URL para cargar cualquier vídeo.',
        'info',
        4500
      );
    }
    this.ui.statusSubtitle.textContent = `YouTube 3D abierto • ${this.youtubeScreen.currentVideoTitle}`;
    this._syncUiState();
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

    // YouTube Error Banner buttons
    this.ui.btnYtErrorClose.addEventListener('click', () => {
      this._hideYouTubeError();
    });
    this.ui.btnYtErrorPick.addEventListener('click', () => {
      this._hideYouTubeError();
      this.openYouTubePicker();
    });

    // YouTube Picker Modal
    this.ui.btnYtPickerClose.addEventListener('click', () => this.closeYouTubePicker());
    this.ui.btnYtPickerDone.addEventListener('click', () => this.closeYouTubePicker());
    this.ui.youtubePickerModal.addEventListener('click', (e) => {
      if (e.target === this.ui.youtubePickerModal) {
        this.closeYouTubePicker();
      }
    });

    this.ui.ytUrlForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      this.audio.unlock();
      const raw = this.ui.ytUrlInput.value;
      const res = await this.youtubeScreen.loadVideo(raw);
      if (!res.ok) {
        this.ui.ytUrlError.textContent = res.error;
        this.ui.ytUrlError.classList.remove('hidden');
        return;
      }
      this.ui.ytUrlError.classList.add('hidden');
      this.ui.ytUrlInput.value = '';
      this.closeYouTubePicker();
      if (this.stereo.stereoEnabled) {
        await this.youtubeScreen.setStereoMode(true);
      }
      this.ui.statusSubtitle.textContent = `Vídeo cargado (${res.videoId}) • Pulsa ▶ manualmente para reproducir`;
      this._syncUiState();
    });

    // YouTube HUD & Stereo Controls
    this.ui.btnYoutubeOpen.addEventListener('click', () => {
      this.audio.unlock();
      if (this.youtubeScreen.isOpen) {
        this.youtubeScreen.summonInFrontOfHead();
      } else {
        this.openYouTubeCinema();
      }
    });

    this.ui.btnYtPlay.addEventListener('click', () => {
      this.audio.unlock();
      this.youtubeScreen.play();
    });
    this.ui.btnYtPause.addEventListener('click', () => {
      this.audio.unlock();
      this.youtubeScreen.pause();
    });
    this.ui.btnYtSize.addEventListener('click', () => {
      this.audio.unlock();
      this.youtubeScreen.cycleSize();
    });
    this.ui.btnYtPick.addEventListener('click', () => {
      this.audio.unlock();
      this.openYouTubePicker();
    });
    this.ui.btnYtBring.addEventListener('click', () => {
      this.audio.unlock();
      this.youtubeScreen.summonInFrontOfHead();
    });
    this.ui.btnYtClose.addEventListener('click', () => {
      this.audio.unlock();
      this.youtubeScreen.close();
      this.ui.statusSubtitle.textContent = 'Pantalla YouTube 3D cerrada';
    });

    this.ui.btnYtPlayVr.addEventListener('click', () => {
      this.audio.unlock();
      this.youtubeScreen.play();
    });
    this.ui.btnYtPauseVr.addEventListener('click', () => {
      this.audio.unlock();
      this.youtubeScreen.pause();
    });
    this.ui.btnYtSizeVr.addEventListener('click', () => {
      this.audio.unlock();
      this.youtubeScreen.cycleSize();
    });
    this.ui.btnYtCloseVr.addEventListener('click', () => {
      this.audio.unlock();
      this.youtubeScreen.close();
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

    // Desktop keyboard shortcuts (ignored while typing inside URL input)
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        if (e.code === 'Escape') {
          this.closeYouTubePicker();
        }
        return;
      }

      if (e.code === 'KeyR') {
        this.recenterView();
      } else if (e.code === 'KeyM') {
        this.floatingMenu.summonInFrontOfHead();
      } else if (e.code === 'KeyH') {
        this.summonHomeApps();
      } else if (e.code === 'KeyY') {
        this.openYouTubeCinema();
      } else if (e.code === 'KeyP') {
        this.togglePassthrough();
      } else if (e.code === 'Space') {
        e.preventDefault();
        this.audio.unlock();
        this.interaction.triggerPrimaryAction();
      } else if (e.code === 'KeyV') {
        this.toggleVrMode();
      } else if (e.code === 'Escape') {
        if (!this.ui.youtubePickerModal.classList.contains('hidden')) {
          this.closeYouTubePicker();
        } else if (this.stereo.stereoEnabled) {
          this.exitVrMode();
        }
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
    await this.youtubeScreen.setStereoMode(true);
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
      // Fullscreen optional
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
    await this.youtubeScreen.setStereoMode(false);
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
    this.youtubeScreen?.dispose();
    this.handTracker?.dispose();
    this.cameraManager?.stopAll();
  }

  _syncUiState() {
    const isStereo = this.stereo.stereoEnabled;
    this.ui.hudMono.classList.toggle('hidden', isStereo);
    this.ui.hudStereo.classList.toggle('hidden', !isStereo);

    // VR / Normal mode button label
    this.ui.btnVrModeText.textContent = isStereo ? 'Modo Normal' : 'Modo VR';

    // YouTube 3D Cinema state
    const ytOpen = this.youtubeScreen.isOpen;
    const sizeShort = this.youtubeScreen.currentSizePreset.shortLabel;
    this.ui.btnYoutubeOpen.classList.toggle('btn-active', ytOpen);
    this.ui.btnYoutubeOpenText.textContent = ytOpen ? 'YouTube: ON' : 'YouTube 3D';
    this.ui.pillYoutube.classList.toggle('hidden', !ytOpen);
    this.ui.pillYoutube.textContent = `YouTube 3D (${sizeShort})`;
    this.ui.pillYoutube.classList.toggle('pill-active', ytOpen && this.youtubeScreen.playbackState === 'playing');
    this.ui.pillYoutube.classList.toggle('pill-warn', ytOpen && this.youtubeScreen.playbackState === 'error');
    this.ui.pillYoutube.classList.toggle('pill-muted', !ytOpen || (this.youtubeScreen.playbackState !== 'playing' && this.youtubeScreen.playbackState !== 'error'));

    this.ui.btnYtSize.textContent = `Tamaño: ${sizeShort}`;
    this.ui.btnYtSizeVr.textContent = `Tam: ${sizeShort}`;
    this.ui.ytPickerExternalLink.href = this.youtubeScreen.externalUrl;

    // Show/hide stereo mini YouTube controls
    for (const el of [this.ui.btnYtPlayVr, this.ui.btnYtPauseVr, this.ui.btnYtSizeVr, this.ui.btnYtCloseVr]) {
      el.classList.toggle('hidden', !ytOpen);
    }

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

    // 7. Stereoscopic VR or Normal Mono WebGL render (updates camera world matrices)
    this.stereo.render(this.scene);

    // 8. Exact frame-locked Dual-Eye CSS3D projection & stereo sync for YouTube 3D Cinema Screen
    this.youtubeScreen.update(dt, this.stereo);

    // 9. Live HUD updates, camera occlusion check & 3D Telemetry Board at ~4 Hz
    this._updateLiveHud(dt);
  }

  _updateLiveHud(dt) {
    const isHolding = Boolean(this.interaction.heldItem);
    const hoveredLabel = this.interaction.getStatusLabel();

    if (!this.stereo.stereoEnabled) {
      this.ui.grabControls.classList.toggle('hidden', !isHolding);
      this.ui.youtubeControlsBar.classList.toggle('hidden', !this.youtubeScreen.isOpen || isHolding);

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

      const ytSummary = this.youtubeScreen.isOpen
        ? `Abierto (${this.youtubeScreen.currentSizePreset.shortLabel}) — ${this.youtubeScreen.playbackState}`
        : 'Cerrado (abre desde Inicio → YouTube)';

      this.telemetryBoard.refresh({
        fps: this._currentFps,
        stereoEnabled: this.stereo.stereoEnabled,
        barrelEnabled: this.stereo.barrelDistortionEnabled,
        forceDirectStereo: this.stereo.forceDirectStereo,
        ipdMm: this.stereo.getIpdMillimeters(),
        sensorLabel: this.headTracker.sensorStatusLabel,
        euler: this.headTracker.telemetryEulerDeg,
        targetLabel: hoveredLabel || 'Ninguno',
        handStatus: this.handBridge.getStatusSummary(),
        passthroughStatus: passthroughSummary,
        youtubeStatus: ytSummary,
        gestureLabel: this.handTracker.enabled ? this.handTracker.primaryGestureLabel : '—',
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new MobileQuestVRWebApp();
});
