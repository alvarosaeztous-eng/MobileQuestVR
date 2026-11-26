export { CameraManager } from './cameraManager.js';
export {
  MediaPipeHandTracker,
  HAND_CONNECTIONS,
  classifyHandGesture,
} from './handTracking.js';

/**
 * Bridge connecting the active real hand-tracking provider (MediaPipeHandTracker)
 * to VRInteractionController without ever simulating or faking hand detection.
 */
export class HandTrackingBridge {
  constructor() {
    this.provider = null;
    this.hasCameraApi = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
    this.isSecureOrigin = Boolean(window.isSecureContext);
  }

  getStatusSummary() {
    if (this.provider) {
      return this.provider.getStatusText();
    }
    if (!this.isSecureOrigin) {
      return 'Cámara bloqueada (requiere HTTPS)';
    }
    if (!this.hasCameraApi) {
      return 'Cámara no compatible en este navegador';
    }
    return 'MediaPipe real inactivo (pulsa Manos ON)';
  }

  bindProvider(provider) {
    this.provider = provider;
  }

  update(dt, nowMs, interactionController, showPip = false) {
    if (!this.provider) {
      interactionController.setExternalPointer(null);
      return null;
    }
    const pointer = this.provider.update(dt, nowMs, showPip);
    interactionController.setExternalPointer(pointer);
    return pointer;
  }
}
