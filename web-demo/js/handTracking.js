import * as THREE from '../vendor/three/three.module.min.js';
import { FilesetResolver, HandLandmarker } from '../vendor/mediapipe/vision_bundle.mjs';

const WASM_CDN_CANDIDATES = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm',
  'https://unpkg.com/@mediapipe/tasks-vision@1.2.3/wasm',
];

const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Official 21-landmark MediaPipe hand connections
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring
  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [5, 9], [9, 13], [13, 17],             // Palm arch
];

const FINGERTIP_IDS = new Set([4, 8, 12, 16, 20]);

/**
 * One-Euro adaptive low-pass filter (Casiez et al., 2012) for smooth, low-lag 3D hand joints.
 */
class OneEuroVec3 {
  constructor(minCutoff = 2.0, beta = 0.14, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.initialized = false;
    this.prev = new THREE.Vector3();
    this.prevDeriv = new THREE.Vector3();
  }

  reset() {
    this.initialized = false;
  }

  filter(value, dt) {
    if (!this.initialized || dt <= 1e-5) {
      this.initialized = true;
      this.prev.copy(value);
      this.prevDeriv.set(0, 0, 0);
      return value.clone();
    }

    const alphaD = this._alpha(this.dCutoff, dt);
    const out = new THREE.Vector3();

    for (const axis of ['x', 'y', 'z']) {
      const deriv = (value[axis] - this.prev[axis]) / dt;
      const fDeriv = THREE.MathUtils.lerp(this.prevDeriv[axis], deriv, alphaD);
      const cutoff = this.minCutoff + this.beta * Math.abs(fDeriv);
      const alpha = this._alpha(cutoff, dt);
      const filtered = THREE.MathUtils.lerp(this.prev[axis], value[axis], alpha);
      this.prev[axis] = filtered;
      this.prevDeriv[axis] = fDeriv;
      out[axis] = filtered;
    }

    return out;
  }

  _alpha(cutoffHz, dt) {
    const tau = 1 / (2 * Math.PI * cutoffHz);
    return 1 / (1 + tau / dt);
  }
}

/**
 * Scale-invariant geometric classifier for real MediaPipe 21-landmark skeletons.
 * Recognizes: 'pinch' (pellizco with hysteresis), 'fist' (puño), and 'open_palm' (mano abierta).
 */
export function classifyHandGesture(joints, wasPinching = false) {
  if (!joints || joints.length < 21) {
    return {
      gesture: 'none',
      labelEs: 'Sin mano',
      isPinching: false,
      pinchStrength: 0,
      isFist: false,
      isOpenPalm: false,
    };
  }

  const wrist = joints[0];
  const middleMcp = joints[9];
  const palmScale = Math.max(0.035, wrist.distanceTo(middleMcp));

  const indexCurl = computeFingerCurl(joints, 5, 6, 8, wrist);
  const middleCurl = computeFingerCurl(joints, 9, 10, 12, wrist);
  const ringCurl = computeFingerCurl(joints, 13, 14, 16, wrist);
  const pinkyCurl = computeFingerCurl(joints, 17, 18, 20, wrist);

  const pinchDist = joints[4].distanceTo(joints[8]);
  const pinchRatio = pinchDist / palmScale;

  // Hysteresis thresholds prevent flickering during VR grabbing
  const enterThresh = 0.42;
  const exitThresh = 0.56;
  const pinchStrength = THREE.MathUtils.clamp((0.88 - pinchRatio) / (0.88 - 0.30), 0, 1);

  const indexExt = indexCurl < 0.36;
  const middleExt = middleCurl < 0.38;
  const ringExt = ringCurl < 0.40;
  const pinkyExt = pinkyCurl < 0.42;

  // Evaluate closed fist first so a thumb tucked against a curled index finger is never misread as a pinch
  const isFist = indexCurl > 0.58 && middleCurl > 0.58 && ringCurl > 0.58 && pinkyCurl > 0.58;
  const isPinching = !isFist && (wasPinching ? pinchRatio <= exitThresh : pinchRatio <= enterThresh);
  const isOpenPalm = !isFist && !isPinching && indexExt && middleExt && ringExt && pinkyExt;

  let gesture = 'none';
  let labelEs = 'Mano detectada';
  if (isFist) {
    gesture = 'fist';
    labelEs = 'Puño';
  } else if (isPinching) {
    gesture = 'pinch';
    labelEs = 'Pinza';
  } else if (isOpenPalm) {
    gesture = 'open_palm';
    labelEs = 'Mano abierta';
  }

  return {
    gesture,
    labelEs,
    isPinching,
    pinchStrength,
    isFist,
    isOpenPalm,
  };
}

function computeFingerCurl(joints, mcpIdx, pipIdx, tipIdx, wrist) {
  const mcp = joints[mcpIdx];
  const pip = joints[pipIdx];
  const tip = joints[tipIdx];

  const b1 = pip.clone().sub(mcp);
  const b2 = tip.clone().sub(pip);
  let bendScore = 0.5;
  if (b1.lengthSq() > 1e-6 && b2.lengthSq() > 1e-6) {
    const cosA = THREE.MathUtils.clamp(b1.normalize().dot(b2.normalize()), -1, 1);
    bendScore = THREE.MathUtils.clamp((0.95 - cosA) / 1.20, 0, 1);
  }

  const distMcp = Math.max(1e-4, wrist.distanceTo(mcp));
  const distTip = wrist.distanceTo(tip);
  const ratio = distTip / distMcp;
  const distScore = THREE.MathUtils.clamp((1.82 - ratio) / 0.78, 0, 1);

  return THREE.MathUtils.clamp(bendScore * 0.6 + distScore * 0.4, 0, 1);
}

/**
 * Real MediaPipe Tasks Vision HandLandmarker integration for Android Chrome VR.
 * - Uses shared CameraManager stream (no camera conflicts with Passthrough).
 * - Renders real 3D 21-joint + 21-bone hand skeletons + laser pointer ray in VR space.
 * - Optionally draws live 2D landmarks & connections onto the compact Mono camera PIP canvas.
 * - Never simulates or fakes tracking: reports exact real status and error causes.
 */
export class MediaPipeHandTracker {
  constructor(sceneOrOpts, centerEyeAnchor, cameraManager, pipCanvas = null) {
    if (sceneOrOpts && typeof sceneOrOpts === 'object' && 'scene' in sceneOrOpts && !sceneOrOpts.isScene) {
      this.scene = sceneOrOpts.scene;
      this.centerEyeAnchor = sceneOrOpts.centerEyeAnchor;
      this.cameraManager = sceneOrOpts.cameraManager;
      this.pipCanvas = sceneOrOpts.pipCanvas || null;
      this.onOpenPalmSummon = sceneOrOpts.onOpenPalmSummon || null;
    } else {
      this.scene = sceneOrOpts;
      this.centerEyeAnchor = centerEyeAnchor;
      this.cameraManager = cameraManager;
      this.pipCanvas = pipCanvas;
      this.onOpenPalmSummon = null;
    }

    this.pipCtx = this.pipCanvas ? this.pipCanvas.getContext('2d') : null;

    this.landmarker = null;
    this.delegateUsed = '';
    this.enabled = false;
    this.isLoading = false;
    this.status = 'inactive'; // 'inactive' | 'loading' | 'active' | 'error'
    this.statusMessage = 'Desactivado';
    this.lastError = '';

    this.detectedHandCount = 0;
    this.primaryGestureLabel = 'Ninguno';
    this._lastVideoTime = -1;
    this._lastInferenceMs = 0;
    this._minInferenceIntervalMs = 33; // ~30 Hz max inference so 60 FPS WebGL stays smooth on mobile

    // Per-hand tracking state (up to 2 hands)
    this._handSlots = [this._createHandSlot(0), this._createHandSlot(1)];

    // Open-palm steady hold gesture to summon the App Launcher / Home menu
    this._openPalmTimer = 0;
    this._openPalmFired = false;

    // 3D pointer laser line for primary tracked hand
    this._laserLine = this._createLaserLine();
    this.scene.add(this._laserLine);
  }

  async enable() {
    if (this.enabled) return { ok: true, error: '' };
    if (this.isLoading) return { ok: false, error: 'Cargando MediaPipe Hand Landmarker…' };

    this.isLoading = true;
    this.status = 'loading';
    this.statusMessage = 'Solicitando permiso de cámara…';
    this.lastError = '';

    // 1. Acquire real camera permission & stream first
    const camRes = await this.cameraManager.acquire('hands');
    if (!camRes.ok) {
      this.isLoading = false;
      this.status = 'error';
      this.lastError = camRes.error;
      this.statusMessage = camRes.error;
      return { ok: false, error: camRes.error };
    }

    // 2. Initialize real MediaPipe HandLandmarker (cached once loaded)
    if (!this.landmarker) {
      this.statusMessage = 'Descargando modelo MediaPipe HandLandmarker…';
      try {
        await this._initLandmarker();
      } catch (err) {
        this.cameraManager.release('hands');
        this.isLoading = false;
        this.status = 'error';
        const reason = `No se pudo cargar MediaPipe Tasks Vision (comprueba conexión a internet): ${err?.message || err}`;
        this.lastError = reason;
        this.statusMessage = reason;
        return { ok: false, error: reason };
      }
    }

    this.isLoading = false;
    this.enabled = true;
    this.status = 'active';
    this.statusMessage = `Activo (${this.delegateUsed}) — Muestra tu mano a la cámara`;
    this._lastVideoTime = -1;
    return { ok: true, error: '' };
  }

  disable() {
    this.enabled = false;
    this.isLoading = false;
    this.status = 'inactive';
    this.statusMessage = 'Desactivado';
    this.detectedHandCount = 0;
    this.primaryGestureLabel = 'Ninguno';
    this._openPalmTimer = 0;
    this._openPalmFired = false;

    for (const slot of this._handSlots) {
      slot.isTracked = false;
      slot.wasPinching = false;
      slot.visual.root.visible = false;
      for (const f of slot.filters) f.reset();
    }
    this._laserLine.visible = false;
    this._clearPip();
    this.cameraManager.release('hands');
  }

  getStatusText() {
    if (this.status === 'active') {
      if (this.detectedHandCount > 0) {
        return `MediaPipe activo (${this.detectedHandCount} mano${this.detectedHandCount > 1 ? 's' : ''}) — ${this.primaryGestureLabel}`;
      }
      return `MediaPipe activo (${this.delegateUsed}) — Sin manos visibles`;
    }
    if (this.status === 'loading') return this.statusMessage;
    if (this.status === 'error') return `Error: ${this.lastError}`;
    return 'Desactivado (pulsa Manos para activar)';
  }

  /**
   * Runs real MediaPipe inference on the latest live camera frame, updates 3D skeletons + 2D PIP,
   * and returns an external pointer packet for VRInteractionController (or null if no hand tracked).
   */
  update(dt, nowMs, showPip = false) {
    if (!this.enabled || !this.landmarker) {
      this._laserLine.visible = false;
      return null;
    }

    if (!this.cameraManager.hasLiveFrame()) {
      this._laserLine.visible = false;
      return null;
    }

    const video = this.cameraManager.video;

    // Run MediaPipe inference when a new camera frame arrives (respecting mobile throttle)
    if (video.currentTime !== this._lastVideoTime && nowMs - this._lastInferenceMs >= this._minInferenceIntervalMs) {
      this._lastVideoTime = video.currentTime;
      this._lastInferenceMs = nowMs;

      try {
        const result = this.landmarker.detectForVideo(video, Math.round(nowMs));
        this._processDetectionResult(result, dt, nowMs, showPip);
      } catch (err) {
        // Avoid crashing render loop if a single frame fails during orientation transition
        console.warn('[MobileQuestVR] Frame MediaPipe omitido:', err);
      }
    }

    // Expire hands if temporarily lost for > 280 ms
    let activeSlot = null;
    let count = 0;
    for (const slot of this._handSlots) {
      if (slot.isTracked && nowMs - slot.lastSeenMs > 280) {
        slot.isTracked = false;
        slot.wasPinching = false;
        slot.visual.root.visible = false;
        for (const f of slot.filters) f.reset();
      }
      if (slot.isTracked) {
        count++;
        if (!activeSlot) activeSlot = slot;
      }
    }
    this.detectedHandCount = count;

    if (!activeSlot) {
      this.primaryGestureLabel = 'Ninguno';
      this._laserLine.visible = false;
      this._openPalmTimer = 0;
      this._openPalmFired = false;
      return null;
    }

    this.primaryGestureLabel = activeSlot.gestureState.labelEs;

    // Open-palm hold (~0.95s) summons the floating Apps/Home menu cleanly
    if (activeSlot.gestureState.isOpenPalm) {
      this._openPalmTimer += dt;
      if (!this._openPalmFired && this._openPalmTimer >= 0.95) {
        this._openPalmFired = true;
        if (typeof this.onOpenPalmSummon === 'function') {
          this.onOpenPalmSummon();
        }
      }
    } else {
      this._openPalmTimer = 0;
      this._openPalmFired = false;
    }

    // Update 3D pointer laser from hand pinch point
    const rayOrigin = activeSlot.pinchPoint;
    const rayDir = activeSlot.aimDirection;
    const isSelecting = activeSlot.gestureState.isPinching || activeSlot.gestureState.isFist;

    this._updateLaser(rayOrigin, rayDir, isSelecting);

    return {
      active: true,
      origin: rayOrigin.clone(),
      direction: rayDir.clone(),
      isPinching: activeSlot.gestureState.isPinching,
      isFist: activeSlot.gestureState.isFist,
      isOpenPalm: activeSlot.gestureState.isOpenPalm,
      gesture: activeSlot.gestureState.gesture,
      gestureLabel: activeSlot.gestureState.labelEs,
      pinchStrength: activeSlot.gestureState.pinchStrength,
    };
  }

  async _initLandmarker() {
    let wasmFileset = null;
    let lastWasmErr = null;

    for (const baseUrl of WASM_CDN_CANDIDATES) {
      try {
        wasmFileset = await FilesetResolver.forVisionTasks(baseUrl);
        break;
      } catch (err) {
        lastWasmErr = err;
      }
    }

    if (!wasmFileset) {
      throw lastWasmErr || new Error('No se pudo descargar el runtime WebAssembly de MediaPipe.');
    }

    // Try GPU delegate first for optimal mobile speed, then fall back cleanly to CPU delegate
    for (const delegate of ['GPU', 'CPU']) {
      try {
        this.landmarker = await HandLandmarker.createFromOptions(wasmFileset, {
          baseOptions: {
            modelAssetPath: HAND_MODEL_URL,
            delegate,
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.50,
        });
        this.delegateUsed = delegate;
        return;
      } catch (err) {
        console.warn(`[MobileQuestVR] MediaPipe delegate ${delegate} falló:`, err);
        if (delegate === 'CPU') throw err;
      }
    }
  }

  _processDetectionResult(result, dt, nowMs, showPip) {
    const normHands = result?.landmarks || [];
    const worldHands = result?.worldLandmarks || [];
    const handednessList = result?.handedness || result?.handednesses || [];

    const mirrorX = !this.cameraManager.isRearCamera; // Mirror horizontally for front selfie camera
    const aspect = this.cameraManager.getVideoAspect();
    const hFovDeg = 66;
    const tanHalfH = Math.tan(THREE.MathUtils.degToRad(hFovDeg * 0.5));
    const tanHalfV = tanHalfH / Math.max(0.4, aspect);

    // Draw optional live 2D camera preview + landmark connections in Mono mode
    if (showPip && this.pipCtx && this.pipCanvas) {
      this._drawPipOverlay(this.cameraManager.video, normHands, mirrorX);
    }

    const handCount = Math.min(2, normHands.length);
    for (let h = 0; h < handCount; h++) {
      const slot = this._handSlots[h];
      const normLm = normHands[h];
      const worldLm = worldHands[h] && worldHands[h].length === 21 ? worldHands[h] : null;

      if (!normLm || normLm.length < 21) continue;

      // Estimate real metric depth Z from apparent palm size (Wrist #0 -> Middle MCP #9 ≈ 0.088 m)
      const wNorm = normLm[0];
      const mNorm = normLm[9];
      const uWrist = mirrorX ? 1 - wNorm.x : wNorm.x;
      const uMid = mirrorX ? 1 - mNorm.x : mNorm.x;

      const angDx = (uMid - uWrist) * 2 * tanHalfH;
      const angDy = (mNorm.y - wNorm.y) * 2 * tanHalfV;
      const angPalm = Math.max(0.055, Math.hypot(angDx, angDy));
      const depthZ = THREE.MathUtils.clamp(0.088 / angPalm, 0.28, 0.92);

      const wristCam = this._unproject(uWrist, wNorm.y, depthZ, tanHalfH, tanHalfV);
      const mpWrist = worldLm ? this._mpWorldToCam(worldLm[0], mirrorX) : null;

      // Transform all 21 landmarks into Three.js world space with One-Euro smoothing
      this.centerEyeAnchor.updateMatrixWorld(true);
      for (let i = 0; i < 21; i++) {
        let localCamPos;
        if (worldLm && mpWrist) {
          const mpPos = this._mpWorldToCam(worldLm[i], mirrorX);
          localCamPos = wristCam.clone().add(mpPos.sub(mpWrist));
        } else {
          const u = mirrorX ? 1 - normLm[i].x : normLm[i].x;
          const relZ = normLm[i].z * (depthZ * 1.6);
          localCamPos = this._unproject(u, normLm[i].y, depthZ + relZ, tanHalfH, tanHalfV);
        }

        const filteredCam = slot.filters[i].filter(localCamPos, Math.max(dt, 0.016));
        slot.worldJoints[i].copy(filteredCam).applyMatrix4(this.centerEyeAnchor.matrixWorld);
      }

      // Evaluate real gestures (open_palm, fist, pinch)
      slot.gestureState = classifyHandGesture(slot.worldJoints, slot.wasPinching);
      slot.wasPinching = slot.gestureState.isPinching;
      slot.handedness = handednessList[h]?.[0]?.categoryName || 'Hand';
      slot.isTracked = true;
      slot.lastSeenMs = nowMs;

      // Compute pinch midpoint & ergonomic shoulder-to-hand aim ray
      slot.pinchPoint.copy(slot.worldJoints[4]).add(slot.worldJoints[8]).multiplyScalar(0.5);

      const eyeWorld = new THREE.Vector3();
      const eyeQuat = new THREE.Quaternion();
      this.centerEyeAnchor.getWorldPosition(eyeWorld);
      this.centerEyeAnchor.getWorldQuaternion(eyeQuat);

      const sideOffset = slot.handedness === 'Left' ? -0.18 : 0.18;
      const shoulder = eyeWorld
        .clone()
        .add(new THREE.Vector3(sideOffset, -0.22, 0.05).applyQuaternion(eyeQuat));

      const rayFromShoulder = slot.pinchPoint.clone().sub(shoulder).normalize();
      const fingerDir = slot.worldJoints[8].clone().sub(slot.worldJoints[5]).normalize();
      slot.aimDirection.copy(rayFromShoulder).multiplyScalar(0.72).addScaledVector(fingerDir, 0.28).normalize();

      this._updateHandVisual(slot);
    }
  }

  _unproject(u, v, depthZ, tanHalfH, tanHalfV) {
    // Camera looks along -Z in Three.js! +X right, +Y up, -Z forward into scene
    const ndcX = (u - 0.5) * 2;
    const ndcY = (0.5 - v) * 2;
    return new THREE.Vector3(ndcX * tanHalfH * depthZ, ndcY * tanHalfV * depthZ - 0.02, -depthZ);
  }

  _mpWorldToCam(lm, mirrorX) {
    // MediaPipe world landmarks: +X right, +Y down, +Z away from camera -> Three.js camera frame: +X right, +Y up, -Z forward
    return new THREE.Vector3(mirrorX ? -lm.x : lm.x, -lm.y, -lm.z);
  }

  _createHandSlot(index) {
    const filters = [];
    const worldJoints = [];
    for (let i = 0; i < 21; i++) {
      filters.push(new OneEuroVec3(2.2, 0.16, 1.0));
      worldJoints.push(new THREE.Vector3());
    }

    const visual = this._createHandVisual(index);
    this.scene.add(visual.root);

    return {
      index,
      handedness: 'Unknown',
      isTracked: false,
      lastSeenMs: 0,
      wasPinching: false,
      filters,
      worldJoints,
      pinchPoint: new THREE.Vector3(),
      aimDirection: new THREE.Vector3(0, 0, -1),
      gestureState: { gesture: 'none', labelEs: 'Ninguno', isPinching: false, pinchStrength: 0, isFist: false, isOpenPalm: false },
      visual,
    };
  }

  _createHandVisual(index) {
    const root = new THREE.Group();
    root.name = `VRHand3D_${index}`;
    root.visible = false;

    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x35e2ff,
      emissive: 0x0f7ba6,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.35,
    });

    const boneMat = new THREE.MeshStandardMaterial({
      color: 0x1b6ca8,
      emissive: 0x09355a,
      emissiveIntensity: 0.7,
      roughness: 0.4,
      metalness: 0.3,
    });

    const pinchMat = new THREE.MeshBasicMaterial({
      color: 0x28f0a2,
      transparent: true,
      opacity: 0.88,
    });

    const jointGeo = new THREE.SphereGeometry(0.0085, 10, 8);
    const tipGeo = new THREE.SphereGeometry(0.011, 10, 8);
    const joints = [];

    for (let i = 0; i < 21; i++) {
      const m = new THREE.Mesh(FINGERTIP_IDS.has(i) ? tipGeo : jointGeo, jointMat);
      m.renderOrder = 20;
      root.add(m);
      joints.push(m);
    }

    const boneGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 1, 6);
    const bones = [];
    for (let b = 0; b < HAND_CONNECTIONS.length; b++) {
      const cyl = new THREE.Mesh(boneGeo, boneMat);
      cyl.renderOrder = 19;
      root.add(cyl);
      bones.push(cyl);
    }

    const pinchOrb = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 10), pinchMat);
    pinchOrb.visible = false;
    root.add(pinchOrb);

    return { root, joints, bones, pinchOrb, jointMat, boneMat };
  }

  _updateHandVisual(slot) {
    const v = slot.visual;
    v.root.visible = true;

    for (let i = 0; i < 21; i++) {
      v.joints[i].position.copy(slot.worldJoints[i]);
    }

    const up = new THREE.Vector3(0, 1, 0);
    const delta = new THREE.Vector3();
    for (let b = 0; b < HAND_CONNECTIONS.length; b++) {
      const [aIdx, bIdx] = HAND_CONNECTIONS[b];
      const pA = slot.worldJoints[aIdx];
      const pB = slot.worldJoints[bIdx];
      delta.subVectors(pB, pA);
      const len = delta.length();

      const cyl = v.bones[b];
      cyl.position.copy(pA).add(pB).multiplyScalar(0.5);
      if (len > 1e-5) {
        cyl.quaternion.setFromUnitVectors(up, delta.divideScalar(len));
      }
      cyl.scale.set(1, Math.max(0.001, len), 1);
    }

    // Gesture color feedback on joints
    const g = slot.gestureState.gesture;
    if (g === 'pinch') {
      v.jointMat.color.setHex(0x28f0a2);
      v.jointMat.emissive.setHex(0x109964);
    } else if (g === 'fist') {
      v.jointMat.color.setHex(0xffaa33);
      v.jointMat.emissive.setHex(0x995508);
    } else if (g === 'open_palm') {
      v.jointMat.color.setHex(0x52e8ff);
      v.jointMat.emissive.setHex(0x1482b3);
    } else {
      v.jointMat.color.setHex(0x35c8ff);
      v.jointMat.emissive.setHex(0x0f5d88);
    }

    const showPinch = slot.gestureState.pinchStrength > 0.35;
    v.pinchOrb.visible = showPinch;
    if (showPinch) {
      v.pinchOrb.position.copy(slot.pinchPoint);
      const s = THREE.MathUtils.lerp(0.65, 1.45, slot.gestureState.pinchStrength);
      v.pinchOrb.scale.setScalar(s);
    }
  }

  _createLaserLine() {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    const mat = new THREE.LineBasicMaterial({
      color: 0x38e2ff,
      transparent: true,
      opacity: 0.85,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    return line;
  }

  _updateLaser(origin, dir, activeSelect) {
    const end = origin.clone().addScaledVector(dir, 3.6);
    const posAttr = this._laserLine.geometry.attributes.position;
    posAttr.setXYZ(0, origin.x, origin.y, origin.z);
    posAttr.setXYZ(1, end.x, end.y, end.z);
    posAttr.needsUpdate = true;
    this._laserLine.material.color.setHex(activeSelect ? 0x28f0a2 : 0x38e2ff);
    this._laserLine.visible = true;
  }

  _drawPipOverlay(video, normHands, mirrorX) {
    const ctx = this.pipCtx;
    const w = this.pipCanvas.width;
    const h = this.pipCanvas.height;

    ctx.save();
    if (mirrorX) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    for (let handIdx = 0; handIdx < normHands.length; handIdx++) {
      const lm = normHands[handIdx];
      if (!lm || lm.length < 21) continue;

      const px = (i) => (mirrorX ? 1 - lm[i].x : lm[i].x) * w;
      const py = (i) => lm[i].y * h;

      // Draw finger bone connections
      ctx.strokeStyle = '#38e2ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(b), py(b));
      }
      ctx.stroke();

      // Draw 21 landmark dots
      for (let i = 0; i < 21; i++) {
        ctx.fillStyle = FINGERTIP_IDS.has(i) ? '#28f0a2' : '#ffffff';
        ctx.beginPath();
        ctx.arc(px(i), py(i), FINGERTIP_IDS.has(i) ? 3.4 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _clearPip() {
    if (!this.pipCtx || !this.pipCanvas) return;
    this.pipCtx.clearRect(0, 0, this.pipCanvas.width, this.pipCanvas.height);
  }

  dispose() {
    this.disable();
    if (this.landmarker && typeof this.landmarker.close === 'function') {
      try {
        this.landmarker.close();
      } catch {
        // Ignore close errors
      }
      this.landmarker = null;
    }
  }
}
