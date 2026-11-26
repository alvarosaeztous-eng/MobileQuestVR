import * as THREE from '../vendor/three/three.module.min.js';

const ZEE = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);
const Q_CAMERA_BACK = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around X

/**
 * 3DoF Head Tracking powered by the W3C DeviceOrientation API on Android Chrome,
 * paired with smooth touch-drag / mouse-drag fallback and desktop keyboard exploration.
 */
export class HeadTracker {
  constructor(stereoRig, canvas) {
    this.rig = stereoRig;
    this.canvas = canvas;

    this.sensorEnabled = false;
    this.sensorActive = false;
    this.sensorStatusLabel = 'Modo táctil';

    this.enableNeckModel = true;
    this.neckHeight = 0.075;
    this.neckForward = 0.08;

    // Sensor quaternions
    this._eulerTemp = new THREE.Euler();
    this._qScreen = new THREE.Quaternion();
    this._rawSensorQuat = new THREE.Quaternion();
    this._yawRecenterOffset = new THREE.Quaternion();
    this._targetQuat = new THREE.Quaternion();
    this._filteredQuat = new THREE.Quaternion();
    this._hasFirstSensorSample = false;

    // Touch / Mouse fallback yaw & pitch (radians)
    this.manualYaw = 0;
    this.manualPitch = -0.06;
    this._isDragging = false;
    this._activePointerId = null;
    this._lastPointerX = 0;
    this._lastPointerY = 0;
    this._dragDistance = 0;

    // Optional keyboard look/movement (handy on desktop browser)
    this._keys = new Set();

    // Telemetry output
    this.telemetryEulerDeg = { yaw: 0, pitch: 0, roll: 0 };

    // Callback when a short tap (not a drag) happens on the canvas
    this.onCanvasTap = null;

    this._onDeviceOrientation = this._handleDeviceOrientation.bind(this);
    this._onOrientationChange = this._handleScreenOrientationChange.bind(this);
    this._screenAngleRad = this._readScreenOrientationRad();

    this._bindPointerAndKeyboard();
  }

  /**
   * Requests DeviceOrientation permission (needed on some mobile browsers) and starts listening.
   * Must be called inside a user gesture handler for maximum browser compatibility.
   */
  async enableGyroscope() {
    if (typeof window.DeviceOrientationEvent === 'undefined') {
      this.sensorStatusLabel = 'Sin sensor (Táctil)';
      return false;
    }

    try {
      if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        const result = await window.DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') {
          this.sensorStatusLabel = 'Permiso denegado (Táctil)';
          return false;
        }
      }
    } catch {
      this.sensorStatusLabel = 'Requiere HTTPS (Táctil)';
      return false;
    }

    this._startSensorListeners();
    return true;
  }

  /**
   * Attempts passive sensor attachment on page load (works directly on Android Chrome over HTTPS).
   */
  tryAutoStartSensors() {
    if (typeof window.DeviceOrientationEvent === 'undefined') return;
    if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
      // Wait for explicit user gesture on browsers requiring permission prompt
      this.sensorStatusLabel = 'Pulsa Giroscopio / VR';
      return;
    }
    this._startSensorListeners();
  }

  _startSensorListeners() {
    if (this.sensorEnabled) return;
    this.sensorEnabled = true;
    this._screenAngleRad = this._readScreenOrientationRad();
    window.addEventListener('deviceorientation', this._onDeviceOrientation, true);
    window.addEventListener('orientationchange', this._onOrientationChange);
    if (screen.orientation && screen.orientation.addEventListener) {
      screen.orientation.addEventListener('change', this._onOrientationChange);
    }
  }

  disableGyroscope() {
    this.sensorEnabled = false;
    this.sensorActive = false;
    this._hasFirstSensorSample = false;
    this.sensorStatusLabel = 'Modo táctil';
    window.removeEventListener('deviceorientation', this._onDeviceOrientation, true);
    window.removeEventListener('orientationchange', this._onOrientationChange);
    if (screen.orientation && screen.orientation.removeEventListener) {
      screen.orientation.removeEventListener('change', this._onOrientationChange);
    }
  }

  recenter() {
    if (this.sensorActive && this._hasFirstSensorSample) {
      this._yawRecenterOffset.copy(this._computeYawRecenterQuaternion(this._rawSensorQuat));
      this._targetQuat.copy(this._yawRecenterOffset).multiply(this._rawSensorQuat);
      this._filteredQuat.copy(this._targetQuat);
    } else {
      this.manualYaw = 0;
      this.manualPitch = -0.06;
      this._filteredQuat.setFromEuler(new THREE.Euler(this.manualPitch, this.manualYaw, 0, 'YXZ'));
    }
    this._applyPose(this._filteredQuat);
  }

  update(dt) {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.1);

    if (this.sensorActive && this._hasFirstSensorSample) {
      this._targetQuat.copy(this._yawRecenterOffset).multiply(this._rawSensorQuat);

      // Velocity-adaptive SLERP: rock-steady when still, snappy when turning head quickly
      const angleDiff = this._filteredQuat.angleTo(this._targetQuat);
      const speedFactor = THREE.MathUtils.clamp(angleDiff / 0.14, 0, 1);
      const smoothingRate = THREE.MathUtils.lerp(15, 58, speedFactor);
      const alpha = 1 - Math.exp(-smoothingRate * safeDt);
      this._filteredQuat.slerp(this._targetQuat, alpha);
    } else {
      this._updateKeyboardLookAndMove(safeDt);
      this._targetQuat.setFromEuler(new THREE.Euler(this.manualPitch, this.manualYaw, 0, 'YXZ'));
      const alpha = 1 - Math.exp(-20 * safeDt);
      this._filteredQuat.slerp(this._targetQuat, alpha);
    }

    this._applyPose(this._filteredQuat);

    // Update signed Euler telemetry in degrees
    this._eulerTemp.setFromQuaternion(this._filteredQuat, 'YXZ');
    this.telemetryEulerDeg.pitch = THREE.MathUtils.radToDeg(this._eulerTemp.x);
    this.telemetryEulerDeg.yaw = THREE.MathUtils.radToDeg(this._eulerTemp.y);
    this.telemetryEulerDeg.roll = THREE.MathUtils.radToDeg(this._eulerTemp.z);
  }

  _handleDeviceOrientation(event) {
    if (event.alpha === null || event.beta === null || event.gamma === null) {
      return;
    }

    const alpha = THREE.MathUtils.degToRad(event.alpha);
    const beta = THREE.MathUtils.degToRad(event.beta);
    const gamma = THREE.MathUtils.degToRad(event.gamma);
    const orient = this._screenAngleRad;

    // Verified W3C DeviceOrientation (Z-X'-Y'') -> Three.js camera quaternion
    this._eulerTemp.set(beta, alpha, -gamma, 'YXZ');
    this._rawSensorQuat.setFromEuler(this._eulerTemp);
    this._rawSensorQuat.multiply(Q_CAMERA_BACK);
    this._qScreen.setFromAxisAngle(ZEE, -orient);
    this._rawSensorQuat.multiply(this._qScreen);

    if (!this._hasFirstSensorSample) {
      this._hasFirstSensorSample = true;
      this.sensorActive = true;
      this.sensorStatusLabel = 'Giroscopio activo';
      this._yawRecenterOffset.copy(this._computeYawRecenterQuaternion(this._rawSensorQuat));
      this._filteredQuat.copy(this._yawRecenterOffset).multiply(this._rawSensorQuat);
    }
  }

  _handleScreenOrientationChange() {
    this._screenAngleRad = this._readScreenOrientationRad();
  }

  _readScreenOrientationRad() {
    let angle = 0;
    if (screen.orientation && typeof screen.orientation.angle === 'number') {
      angle = screen.orientation.angle;
    } else if (typeof window.orientation === 'number') {
      angle = window.orientation;
    }
    return THREE.MathUtils.degToRad(angle);
  }

  _computeYawRecenterQuaternion(qRaw) {
    const fwd = FORWARD.clone().applyQuaternion(qRaw);
    let flatX = fwd.x;
    let flatZ = fwd.z;

    if (flatX * flatX + flatZ * flatZ < 0.0025) {
      // Pole safeguard when looking straight up/down
      const upVec = UP.clone().applyQuaternion(qRaw);
      if (fwd.y > 0) {
        flatX = upVec.x;
        flatZ = upVec.z;
      } else {
        flatX = -upVec.x;
        flatZ = -upVec.z;
      }
    }

    // In Three.js right-handed Y-up, camera neutral look is -Z.
    // Rotating around +Y by +atan2(fwd.x, -fwd.z) brings horizontal gaze back to (0, 0, -1).
    const yawRad = Math.atan2(flatX, -flatZ);
    return new THREE.Quaternion().setFromAxisAngle(UP, yawRad);
  }

  _applyPose(headQuat) {
    this.rig.headPivot.quaternion.copy(headQuat);

    if (this.enableNeckModel) {
      // Subtle cervical pivot displacement so looking up/down feels natural in 3DoF
      const neckToEyes = new THREE.Vector3(0, this.neckHeight, -this.neckForward).applyQuaternion(headQuat);
      this.rig.headPivot.position.set(
        neckToEyes.x,
        neckToEyes.y - this.neckHeight,
        neckToEyes.z
      );
    } else {
      this.rig.headPivot.position.set(0, 0, 0);
    }
  }

  _bindPointerAndKeyboard() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this._activePointerId !== null) return;
      this._activePointerId = e.pointerId;
      this._isDragging = true;
      this._lastPointerX = e.clientX;
      this._lastPointerY = e.clientY;
      this._dragDistance = 0;
      if (this.canvas.setPointerCapture) {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          // Safe ignore on synthetic events
        }
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this._isDragging || e.pointerId !== this._activePointerId) return;
      const dx = e.clientX - this._lastPointerX;
      const dy = e.clientY - this._lastPointerY;
      this._lastPointerX = e.clientX;
      this._lastPointerY = e.clientY;
      this._dragDistance += Math.hypot(dx, dy);

      // Drag look works when gyro is inactive (or horizontal yaw nudge even with gyro)
      const sensitivity = 0.0042;
      if (!this.sensorActive) {
        this.manualYaw -= dx * sensitivity;
        this.manualPitch = THREE.MathUtils.clamp(
          this.manualPitch - dy * sensitivity,
          -Math.PI * 0.46,
          Math.PI * 0.46
        );
      } else if (this._dragDistance > 14) {
        // Gentle horizontal yaw adjustment when swiping in gyro mode
        const deltaYaw = new THREE.Quaternion().setFromAxisAngle(UP, -dx * sensitivity * 0.6);
        this._yawRecenterOffset.premultiply(deltaYaw);
      }
    });

    const endPointer = (e) => {
      if (e.pointerId !== this._activePointerId) return;
      const wasTap = this._dragDistance < 12;
      this._isDragging = false;
      this._activePointerId = null;

      if (wasTap && typeof this.onCanvasTap === 'function') {
        this.onCanvasTap(e);
      }
    };

    this.canvas.addEventListener('pointerup', endPointer);
    this.canvas.addEventListener('pointercancel', endPointer);

    window.addEventListener('keydown', (e) => {
      this._keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
    });
  }

  _updateKeyboardLookAndMove(dt) {
    const turnSpeed = 1.45;
    if (this._keys.has('ArrowLeft')) this.manualYaw += turnSpeed * dt;
    if (this._keys.has('ArrowRight')) this.manualYaw -= turnSpeed * dt;
    if (this._keys.has('ArrowUp')) this.manualPitch = Math.min(Math.PI * 0.45, this.manualPitch + turnSpeed * dt);
    if (this._keys.has('ArrowDown')) this.manualPitch = Math.max(-Math.PI * 0.45, this.manualPitch - turnSpeed * dt);

    let moveZ = 0;
    let moveX = 0;
    if (this._keys.has('KeyW')) moveZ += 1;
    if (this._keys.has('KeyS')) moveZ -= 1;
    if (this._keys.has('KeyD')) moveX += 1;
    if (this._keys.has('KeyA')) moveX -= 1;

    if (moveX !== 0 || moveZ !== 0) {
      const fwd = FORWARD.clone().applyQuaternion(this._filteredQuat);
      fwd.y = 0;
      if (fwd.lengthSq() > 0.001) fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();

      const step = new THREE.Vector3()
        .addScaledVector(fwd, moveZ)
        .addScaledVector(right, moveX)
        .normalize()
        .multiplyScalar(1.8 * dt);

      const pos = this.rig.trackingOrigin.position;
      pos.x = THREE.MathUtils.clamp(pos.x + step.x, -2.5, 2.5);
      pos.z = THREE.MathUtils.clamp(pos.z + step.z, -2.3, 2.5);
    }
  }
}
