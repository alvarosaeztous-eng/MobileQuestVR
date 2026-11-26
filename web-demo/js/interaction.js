import * as THREE from '../vendor/three/three.module.min.js';

const RETICLE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RETICLE_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec4 uBaseColor;
  uniform vec4 uProgressColor;
  uniform float uProgress;

  varying vec2 vUv;

  void main() {
    vec2 p = vUv - vec2(0.5);
    float r = length(p);
    float aa = 0.022;

    float outerMask = 1.0 - smoothstep(0.36 - aa, 0.36 + aa, r);
    float innerMask = smoothstep(0.22 - aa, 0.22 + aa, r);
    float ringMask = outerMask * innerMask;

    float dotMask = 1.0 - smoothstep(0.065 - aa, 0.065 + aa, r);

    // Clockwise radial progress starting from 12 o'clock
    float angle = atan(p.x, p.y);
    float normAngle = fract(angle / 6.2831853);
    float filled = step(normAngle, uProgress) * step(0.001, uProgress);

    vec4 ringCol = mix(uBaseColor, uProgressColor, filled);
    ringCol.a *= mix(0.58, 1.0, filled);

    vec3 rgb = ringCol.rgb * ringMask + uBaseColor.rgb * dotMask;
    float alpha = clamp(ringCol.a * ringMask + uBaseColor.a * dotMask, 0.0, 1.0);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(rgb, alpha);
  }
`;

/**
 * Unified VR Interaction System:
 * - Stereoscopic depth-matched SDF Gaze Reticle with 1.1s dwell selection,
 * - Instant touch/tap/button/spacebar selection,
 * - Smooth 3D grabbing, moving, depth adjustment, and velocity-based physics throwing,
 * - External pointer/pinch seam ready for Phase 2 MediaPipe Hand Tracking.
 */
export class VRInteractionController {
  constructor(scene, headAnchor, audio) {
    this.scene = scene;
    this.headAnchor = headAnchor;
    this.audio = audio;

    this.interactables = [];
    this.meshToInteractable = new Map();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 10.5;

    this.dwellSeconds = 1.1;
    this._dwellTimer = 0;
    this._dwellTriggered = false;

    this.hovered = null;
    this.heldItem = null;
    this.holdDistance = 1.25;

    this._lastHoldPos = new THREE.Vector3();
    this._smoothedVel = new THREE.Vector3();
    this._rayOrigin = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();
    this._headQuat = new THREE.Quaternion();

    // External hand-tracking pointer (driven by real MediaPipeHandTracker in Phase 2)
    this._externalPointer = null;
    this._externalWasPinching = false;
    this._externalWasFist = false;
    this._heldByHand = false;
    this._handLostHoldGrace = 0;

    this._buildReticle();
  }

  registerInteractables(list) {
    for (const item of list) {
      if (!item || !item.mesh) continue;
      this.interactables.push(item);
      this.meshToInteractable.set(item.mesh, item);
    }
  }

  /**
   * Extension point for Phase 2 MediaPipe Hand Tracking to drive ray/pinch interaction directly.
   */
  setExternalPointer(pointerState) {
    this._externalPointer = pointerState;
  }

  adjustHoldDistance(deltaMeters) {
    this.holdDistance = THREE.MathUtils.clamp(this.holdDistance + deltaMeters, 0.55, 2.35);
  }

  triggerPrimaryAction() {
    if (this.heldItem) {
      this.releaseHeldObject(true);
      return true;
    }

    if (this.hovered) {
      this._dwellTimer = 0;
      this._dwellTriggered = true;
      this._activateTarget(this.hovered);
      return true;
    }

    return false;
  }

  releaseHeldObject(applyThrow = true) {
    if (!this.heldItem) return;
    const item = this.heldItem;
    item.isGrabbed = false;

    if (applyThrow) {
      const throwVel = this._smoothedVel.clone().multiplyScalar(1.15);
      if (throwVel.length() > 8.0) {
        throwVel.setLength(8.0);
      }
      item.velocity.copy(throwVel);
      item.angularVelocity.set(
        (Math.random() - 0.5) * 3.0,
        (Math.random() - 0.5) * 3.0,
        (Math.random() - 0.5) * 3.0
      );
    }

    this.heldItem = null;
    this._heldByHand = false;
    this._handLostHoldGrace = 0;
    this.audio.play('release');
  }

  getStatusLabel() {
    if (this.heldItem) {
      return `Sosteniendo: ${this.heldItem.label}`;
    }
    return this.hovered ? this.hovered.label : '';
  }

  update(dt) {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.1);

    // Determine active pointer ray (real MediaPipe hand ray if detected, otherwise center-eye gaze)
    let usingExternal = false;
    if (this._externalPointer && this._externalPointer.active) {
      usingExternal = true;
      this._rayOrigin.copy(this._externalPointer.origin);
      this._rayDir.copy(this._externalPointer.direction).normalize();
    } else {
      this.headAnchor.getWorldPosition(this._rayOrigin);
      this.headAnchor.getWorldQuaternion(this._headQuat);
      this._rayDir.set(0, 0, -1).applyQuaternion(this._headQuat).normalize();
    }

    // Handle held grabbable tracking
    if (this.heldItem) {
      const targetPos = this._rayOrigin.clone().addScaledVector(this._rayDir, this.holdDistance);
      targetPos.y = Math.max(this.heldItem.radius + 0.04, targetPos.y);

      const alpha = 1 - Math.exp(-18 * safeDt);
      this.heldItem.mesh.position.lerp(targetPos, alpha);
      this.heldItem.mesh.rotation.y += 0.65 * safeDt;

      const instantVel = targetPos.clone().sub(this._lastHoldPos).divideScalar(safeDt);
      this._smoothedVel.lerp(instantVel, 0.35);
      this._lastHoldPos.copy(targetPos);

      this._updateReticle(this._rayOrigin, this._rayDir, targetPos, null, true, 0);

      if (this._heldByHand) {
        if (usingExternal) {
          this._handLostHoldGrace = 0;
          const stillHolding = Boolean(this._externalPointer.isPinching || this._externalPointer.isFist);
          if (!stillHolding && (this._externalWasPinching || this._externalWasFist)) {
            this.releaseHeldObject(true);
          }
          this._externalWasPinching = Boolean(this._externalPointer.isPinching);
          this._externalWasFist = Boolean(this._externalPointer.isFist);
        } else {
          // Brief grace period against single-frame tracking dropouts before releasing
          this._handLostHoldGrace += safeDt;
          if (this._handLostHoldGrace > 0.45) {
            this.releaseHeldObject(false);
          }
        }
      } else {
        this._externalWasPinching = usingExternal && Boolean(this._externalPointer.isPinching);
        this._externalWasFist = usingExternal && Boolean(this._externalPointer.isFist);
      }
      return;
    }

    // Raycast against visible registered interactables only
    this.raycaster.set(this._rayOrigin, this._rayDir);
    const meshes = [];
    for (const item of this.interactables) {
      if (this._isMeshEffectivelyVisible(item.mesh)) {
        meshes.push(item.mesh);
      }
    }
    const hits = this.raycaster.intersectObjects(meshes, false);

    let hitItem = null;
    let hitPoint = null;
    let hitNormal = null;
    let hitDistance = 2.2;

    if (hits.length > 0) {
      const first = hits[0];
      hitItem = this.meshToInteractable.get(first.object) || null;
      hitPoint = first.point;
      hitDistance = first.distance;
      if (first.face) {
        hitNormal = first.face.normal.clone().transformDirection(first.object.matrixWorld).normalize();
      }
    }

    this._setHoverTarget(hitItem);

    // Handle real MediaPipe hand gestures (pinch selects/grabs; fist grabs grabbables)
    if (usingExternal) {
      const pinching = Boolean(this._externalPointer.isPinching);
      const fist = Boolean(this._externalPointer.isFist);

      if (pinching && !this._externalWasPinching && hitItem) {
        this.holdDistance = THREE.MathUtils.clamp(hitDistance, 0.55, 2.0);
        this._activateTarget(hitItem, true);
      } else if (fist && !this._externalWasFist && hitItem && hitItem.canGrab) {
        this.holdDistance = THREE.MathUtils.clamp(hitDistance, 0.55, 2.0);
        this._activateTarget(hitItem, true);
      }

      this._externalWasPinching = pinching;
      this._externalWasFist = fist;
      const meter = Math.max(this._externalPointer.pinchStrength || 0, fist ? 1 : 0);
      this._updateReticle(this._rayOrigin, this._rayDir, hitPoint, hitNormal, Boolean(hitItem), meter);
      return;
    }

    this._externalWasPinching = false;
    this._externalWasFist = false;

    // Gaze dwell progression
    let dwellProgress = 0;
    if (hitItem && !this._dwellTriggered) {
      this._dwellTimer += safeDt;
      dwellProgress = THREE.MathUtils.clamp(this._dwellTimer / this.dwellSeconds, 0, 1);
      if (this._dwellTimer >= this.dwellSeconds) {
        this._dwellTriggered = true;
        this.holdDistance = THREE.MathUtils.clamp(hitDistance, 0.75, 1.85);
        this._activateTarget(hitItem, false);
      }
    }

    this._updateReticle(this._rayOrigin, this._rayDir, hitPoint, hitNormal, Boolean(hitItem), dwellProgress);
  }

  _isMeshEffectivelyVisible(obj) {
    let curr = obj;
    while (curr) {
      if (!curr.visible) return false;
      curr = curr.parent;
    }
    return true;
  }

  _setHoverTarget(nextTarget) {
    if (this.hovered === nextTarget) return;

    if (this.hovered) {
      this._applyHoverVisual(this.hovered, false);
    }

    this.hovered = nextTarget;
    this._dwellTimer = 0;
    this._dwellTriggered = false;

    if (this.hovered) {
      this._applyHoverVisual(this.hovered, true);
      this.audio.play('hover');
    }
  }

  _applyHoverVisual(item, isHovered) {
    if (typeof item.onHoverChange === 'function') {
      item.onHoverChange(isHovered);
      return;
    }
    if (item.highlightMaterial && typeof item.baseEmissiveIntensity === 'number') {
      item.highlightMaterial.emissiveIntensity = isHovered
        ? item.baseEmissiveIntensity + 0.95
        : item.baseEmissiveIntensity;
    }
  }

  _activateTarget(item, fromHand = false) {
    if (item.canGrab) {
      item.isGrabbed = true;
      item.velocity.set(0, 0, 0);
      item.angularVelocity.set(0, 0, 0);
      this.heldItem = item;
      this._heldByHand = Boolean(fromHand);
      this._handLostHoldGrace = 0;
      this._lastHoldPos.copy(item.mesh.position);
      this._smoothedVel.set(0, 0, 0);
      this.audio.play('grab');
    } else if (typeof item.onActivate === 'function') {
      item.onActivate();
    }
  }

  _buildReticle() {
    this._reticleMat = new THREE.ShaderMaterial({
      vertexShader: RETICLE_VERTEX_SHADER,
      fragmentShader: RETICLE_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uBaseColor: { value: new THREE.Vector4(0.92, 0.97, 1.0, 0.78) },
        uProgressColor: { value: new THREE.Vector4(0.18, 0.98, 0.65, 1.0) },
        uProgress: { value: 0.0 },
      },
    });

    this._reticleMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this._reticleMat);
    this._reticleMesh.renderOrder = 999;
    this.scene.add(this._reticleMesh);
  }

  _updateReticle(origin, dir, hitPoint, hitNormal, hovering, progress) {
    const distance = hitPoint ? THREE.MathUtils.clamp(origin.distanceTo(hitPoint) - 0.015, 0.35, 10) : 2.1;
    const pos = hitPoint
      ? hitPoint.clone().addScaledVector(hitNormal || dir.clone().negate(), 0.014)
      : origin.clone().addScaledVector(dir, distance);

    this._reticleMesh.position.copy(pos);
    this._reticleMesh.lookAt(origin);

    const scale = distance * 0.028 * (hovering ? 1.48 : 1.0);
    this._reticleMesh.scale.set(scale, scale, 1);

    if (hovering) {
      this._reticleMat.uniforms.uBaseColor.value.set(0.24, 0.90, 1.0, 0.98);
    } else {
      this._reticleMat.uniforms.uBaseColor.value.set(0.92, 0.96, 1.0, 0.70);
    }
    this._reticleMat.uniforms.uProgress.value = THREE.MathUtils.clamp(progress, 0, 1);
  }
}
