import * as THREE from '../vendor/three/three.module.min.js';
import { ProceduralAudio } from './audio.js';
import { StereoRenderer } from './stereoRenderer.js';
import { HeadTracker } from './headTracker.js';
import { VirtualRoom } from './room.js';
import { FloatingMenu3D, TelemetryBoard3D } from './floatingMenu.js';
import { VRInteractionController } from './interaction.js';
import { HandTrackingBridge } from './handTrackingHook.js';

/**
 * MobileQuestVR Web — Entry point & Android Chrome VR lifecycle manager.
 */
class MobileQuestVRWebApp {
  constructor() {
    this.canvas = document.getElementById('vr-canvas');
    this.viewportEl = document.getElementById('vr-viewport');

    this.ui = {
      httpsWarning: document.getElementById('https-warning'),
      btnDismissHttps: document.getElementById('btn-dismiss-https'),
      hudMono: document.getElementById('hud-mono'),
      hudStereo: document.getElementById('hud-stereo'),
      statusSubtitle: document.getElementById('status-subtitle'),
      pillSensor: document.getElementById('pill-sensor'),
      pillFps: document.getElementById('pill-fps'),
      targetToast: document.getElementById('target-toast'),
      targetLabel: document.getElementById('target-label'),
      grabControls: document.getElementById('grab-controls'),
      btnGrabNear: document.getElementById('btn-grab-near'),
      btnGrabFar: document.getElementById('btn-grab-far'),
      btnGrabRelease: document.getElementById('btn-grab-release'),
      btnVrMode: document.getElementById('btn-vr-mode'),
      btnRecenter: document.getElementById('btn-recenter'),
      btnAction: document.getElementById('btn-action'),
      btnActionText: document.getElementById('btn-action-text'),
      btnSummonMenu: document.getElementById('btn-summon-menu'),
      btnSensor: document.getElementById('btn-sensor'),
      btnSensorText: document.getElementById('btn-sensor-text'),
      btnExitVr: document.getElementById('btn-exit-vr'),
      btnRecenterVr: document.getElementById('btn-recenter-vr'),
      fatalError: document.getElementById('webgl-error'),
      fatalErrorMsg: document.getElementById('webgl-error-msg'),
    };

    this.wakeLock = null;
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
      this.handBridge = new HandTrackingBridge();

      this.floatingMenu = new FloatingMenu3D(this.scene, this.stereo.centerEyeAnchor, this.audio, {
        onRecenter: () => this.recenterView(),
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

      // Register both room objects and 3D floating menu buttons into the unified raycaster
      this.interaction.registerInteractables(this.room.interactables);
      this.interaction.registerInteractables(this.floatingMenu.interactables);

      // Single tap on canvas unlocks audio and triggers gaze interaction (essential in Cardboard VR!)
      this.headTracker.onCanvasTap = () => {
        this.audio.unlock();
        this.interaction.triggerPrimaryAction();
      };

      this._bindUiEvents();
      this.headTracker.tryAutoStartSensors();
      this._syncUiState();

      this.ui.statusSubtitle.textContent = 'Habitación 3D activa • Listo para Modo VR';
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

  _bindUiEvents() {
    window.addEventListener('resize', () => {
      this.stereo.resize(window.innerWidth, window.innerHeight);
    });

    const unlockOnce = () => {
      this.audio.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });

    // Enter / Exit VR Mode
    this.ui.btnVrMode.addEventListener('click', () => {
      this.audio.unlock();
      this.enterVrMode();
    });

    this.ui.btnExitVr.addEventListener('click', () => {
      this.audio.unlock();
      this.exitVrMode();
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

    // Summon 3D floating menu right in front of user
    this.ui.btnSummonMenu.addEventListener('click', () => {
      this.audio.unlock();
      this.floatingMenu.summonInFrontOfHead();
    });

    // Manual Gyroscope toggle/permission trigger
    this.ui.btnSensor.addEventListener('click', async () => {
      this.audio.unlock();
      if (this.headTracker.sensorEnabled && this.headTracker.sensorActive) {
        this.headTracker.disableGyroscope();
      } else {
        await this.headTracker.enableGyroscope();
      }
      this._syncUiState();
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

    // Sync UI if Android exits fullscreen via system back gesture
    document.addEventListener('fullscreenchange', () => {
      this.stereo.resize(window.innerWidth, window.innerHeight);
    });
  }

  async enterVrMode() {
    this.stereo.setStereoEnabled(true);
    this._syncUiState();
    this.audio.play('select');

    // Request gyroscope permission inside user gesture
    await this.headTracker.enableGyroscope();

    // Request fullscreen + landscape lock + wake lock (graceful fallback if unsupported)
    try {
      const rootEl = document.documentElement;
      if (!document.fullscreenElement && rootEl.requestFullscreen) {
        await rootEl.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch {
      // Fullscreen may be blocked in embedded iframes; stereo split still works seamlessly
    }

    try {
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        await screen.orientation.lock('landscape');
      }
    } catch {
      // Orientation lock requires fullscreen on Android Chrome
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

  _syncUiState() {
    const isStereo = this.stereo.stereoEnabled;
    this.ui.hudMono.classList.toggle('hidden', isStereo);
    this.ui.hudStereo.classList.toggle('hidden', !isStereo);

    const gyroActive = this.headTracker.sensorActive;
    this.ui.pillSensor.textContent = this.headTracker.sensorStatusLabel;
    this.ui.pillSensor.classList.toggle('pill-active', gyroActive);
    this.ui.pillSensor.classList.toggle('pill-muted', !gyroActive);
    this.ui.btnSensorText.textContent = gyroActive ? 'Gyro: ON' : 'Giroscopio';

    this.floatingMenu.syncState({
      stereoEnabled: isStereo,
      barrelEnabled: this.stereo.barrelDistortionEnabled,
      ipdMm: this.stereo.getIpdMillimeters(),
      lightingName: this.room.currentPreset.name,
      sensorLabel: this.headTracker.sensorStatusLabel,
    });
  }

  _animate(now) {
    requestAnimationFrame((t) => this._animate(t));

    const dt = Math.min(Math.max((now - this._lastTime) * 0.001, 0.001), 0.1);
    this._lastTime = now;
    const elapsed = now * 0.001;

    // 1. Head tracking (DeviceOrientation API or touch/mouse drag)
    this.headTracker.update(dt);

    // 2. Room animations & physics
    this.room.update(dt, elapsed);

    // 3. Phase 2 hand tracking hook (no-op until MediaPipe provider is bound)
    this.handBridge.update(dt, this.interaction);

    // 4. Interaction raycast, gaze dwell, and grab physics
    this.interaction.update(dt);

    // 5. 3D floating menu animations & lazy-follow anchor
    this.floatingMenu.update(dt);

    // 6. Stereoscopic or Mono WebGL render
    this.stereo.render(this.scene);

    // 7. Update HUD target toast, grab controls, and FPS/Telemetry at 4 Hz
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

      this.ui.pillFps.textContent = `${Math.round(this._currentFps)} FPS`;
      this._syncUiState();

      this.telemetryBoard.refresh({
        fps: this._currentFps,
        stereoEnabled: this.stereo.stereoEnabled,
        barrelEnabled: this.stereo.barrelDistortionEnabled,
        ipdMm: this.stereo.getIpdMillimeters(),
        sensorLabel: this.headTracker.sensorStatusLabel,
        euler: this.headTracker.telemetryEulerDeg,
        targetLabel: hoveredLabel || 'Ninguno',
        handStatus: this.handBridge.getStatusSummary(),
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.mobileQuestVR = new MobileQuestVRWebApp();
});
