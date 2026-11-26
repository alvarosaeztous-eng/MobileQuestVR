/**
 * Phase 2 MediaPipe Tasks Vision integration contract.
 * Detects real browser camera & secure-context capabilities without simulating or faking tracking.
 * When Phase 2 (@mediapipe/tasks-vision HandLandmarker) is added, it registers its live hand provider
 * through bindProvider() and forwards 3D pinch rays directly to VRInteractionController.
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
      return 'Pendiente Fase 2 (requiere HTTPS para cámara)';
    }
    if (!this.hasCameraApi) {
      return 'Pendiente Fase 2 (cámara no detectada)';
    }
    return 'Listo para Fase 2 (MediaPipe Tasks Vision + Cámara HTTPS)';
  }

  bindProvider(provider) {
    this.provider = provider;
  }

  update(dt, interactionController) {
    if (!this.provider) return;
    const pointer = this.provider.update(dt);
    interactionController.setExternalPointer(pointer);
  }
}
