import * as THREE from '../vendor/three/three.module.min.js';

const BARREL_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BARREL_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uLeftEye;
  uniform sampler2D uRightEye;
  uniform float uK1;
  uniform float uK2;
  uniform float uZoom;
  uniform float uChromaticAberration;
  uniform float uEyeAspect;
  uniform float uVignetteStrength;
  uniform float uVignetteRadius;

  varying vec2 vUv;

  vec2 distortEyeUv(vec2 centeredAspectPos, float invAspect, float channelScale) {
    float r2 = dot(centeredAspectPos, centeredAspectPos);
    float poly = 1.0 + uK1 * r2 + uK2 * r2 * r2;
    vec2 warped = centeredAspectPos * (poly * channelScale / max(uZoom, 0.1));
    warped.x *= invAspect;
    return warped * 0.5 + vec2(0.5);
  }

  vec3 sampleDistortedEye(sampler2D eyeTex, vec2 eyeUv) {
    float aspect = max(uEyeAspect, 0.25);
    float invAspect = 1.0 / aspect;

    vec2 p = (eyeUv - vec2(0.5)) * 2.0;
    p.x *= aspect;

    vec2 uvR = distortEyeUv(p, invAspect, 1.0 + uChromaticAberration);
    vec2 uvG = distortEyeUv(p, invAspect, 1.0);
    vec2 uvB = distortEyeUv(p, invAspect, 1.0 - uChromaticAberration);

    if (uvG.x < 0.0 || uvG.x > 1.0 || uvG.y < 0.0 || uvG.y > 1.0) {
      return vec3(0.0);
    }

    float r = (uvR.x >= 0.0 && uvR.x <= 1.0 && uvR.y >= 0.0 && uvR.y <= 1.0)
      ? texture2D(eyeTex, uvR).r : 0.0;
    float g = texture2D(eyeTex, uvG).g;
    float b = (uvB.x >= 0.0 && uvB.x <= 1.0 && uvB.y >= 0.0 && uvB.y <= 1.0)
      ? texture2D(eyeTex, uvB).b : 0.0;

    vec2 borderDist = min(uvG, 1.0 - uvG);
    float edgeMask = smoothstep(0.0, 0.035, min(borderDist.x, borderDist.y));
    float distCenter = length(p);
    float vignette = 1.0 - uVignetteStrength * smoothstep(uVignetteRadius * 0.65, uVignetteRadius, distCenter);

    return vec3(r, g, b) * edgeMask * clamp(vignette, 0.0, 1.0);
  }

  void main() {
    bool isRight = vUv.x >= 0.5;
    vec2 eyeUv = vec2(isRight ? (vUv.x - 0.5) * 2.0 : vUv.x * 2.0, vUv.y);
    vec3 color = isRight
      ? sampleDistortedEye(uRightEye, eyeUv)
      : sampleDistortedEye(uLeftEye, eyeUv);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const PASSTHROUGH_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const PASSTHROUGH_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uVideoTex;
  uniform float uVideoAspect;
  uniform float uViewAspect;
  uniform float uMirrorX;
  uniform float uBrightness;

  varying vec2 vUv;

  void main() {
    vec2 uv = vUv;
    if (uMirrorX > 0.5) {
      uv.x = 1.0 - uv.x;
    }

    // Object-fit: cover aspect ratio crop so real camera image never stretches
    float ratio = max(uVideoAspect, 0.1) / max(uViewAspect, 0.1);
    if (ratio > 1.0) {
      uv.x = (uv.x - 0.5) / ratio + 0.5;
    } else {
      uv.y = (uv.y - 0.5) * ratio + 0.5;
    }

    vec4 texCol = texture2D(uVideoTex, clamp(uv, 0.0, 1.0));
    gl_FragColor = vec4(texCol.rgb * uBrightness, 1.0);
  }
`;

/**
 * Dual-eye stereoscopic VR renderer for Android Chrome using Three.js.
 * Supports Mono view, direct split-screen Stereo, Brown-Conrady barrel-distorted VR lens output,
 * off-axis asymmetric projection matrices, real-time IPD adjustment, and live Camera Passthrough backdrop.
 */
export class StereoRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });

    // Cap DPR for crispness + locked 60 FPS on mobile Android GPUs
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(this.maxPixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // VR Camera Hierarchy: TrackingOrigin (floor + eye height) -> HeadPivot -> CenterEyeAnchor -> Left/Right Eye
    this.trackingOrigin = new THREE.Group();
    this.trackingOrigin.name = 'TrackingOrigin';
    this.eyeHeight = 1.62;
    this.trackingOrigin.position.set(0, this.eyeHeight, 0.25);

    this.headPivot = new THREE.Group();
    this.headPivot.name = 'HeadPivot';
    this.trackingOrigin.add(this.headPivot);

    this.centerEyeAnchor = new THREE.Group();
    this.centerEyeAnchor.name = 'CenterEyeAnchor';
    this.headPivot.add(this.centerEyeAnchor);

    this.near = 0.04;
    this.far = 140;
    this.verticalFov = 84;
    this.monoFov = 74;
    this.ipdMeters = 0.064;
    this.convergenceDistance = 0;

    this.stereoEnabled = false;
    this.barrelDistortionEnabled = true;

    this.monoCamera = new THREE.PerspectiveCamera(this.monoFov, 1, this.near, this.far);
    this.leftCamera = new THREE.PerspectiveCamera(this.verticalFov, 1, this.near, this.far);
    this.rightCamera = new THREE.PerspectiveCamera(this.verticalFov, 1, this.near, this.far);

    this.centerEyeAnchor.add(this.monoCamera);
    this.centerEyeAnchor.add(this.leftCamera);
    this.centerEyeAnchor.add(this.rightCamera);

    // Live camera passthrough backdrop state
    this.passthroughActive = false;
    this.passthroughTexture = null;
    this.passthroughVideoAspect = 4 / 3;
    this.passthroughMirrorX = false;

    // Offscreen eye render targets + barrel distortion + passthrough fullscreen quad
    this.leftTarget = null;
    this.rightTarget = null;
    this._initDistortionPass();
    this._initPassthroughPass();

    this.width = 1;
    this.height = 1;
    this.resize(window.innerWidth, window.innerHeight);
  }

  _initDistortionPass() {
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.distortionMaterial = new THREE.ShaderMaterial({
      vertexShader: BARREL_VERTEX_SHADER,
      fragmentShader: BARREL_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uLeftEye: { value: null },
        uRightEye: { value: null },
        uK1: { value: 0.22 },
        uK2: { value: 0.14 },
        uZoom: { value: 0.94 },
        uChromaticAberration: { value: 0.008 },
        uEyeAspect: { value: 1.0 },
        uVignetteStrength: { value: 0.42 },
        uVignetteRadius: { value: 0.90 },
      },
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.distortionMaterial);
    this.postScene.add(quad);
  }

  _initPassthroughPass() {
    this.passthroughScene = new THREE.Scene();
    this.passthroughCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.passthroughMaterial = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERTEX_SHADER,
      fragmentShader: PASSTHROUGH_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uVideoTex: { value: null },
        uVideoAspect: { value: 4 / 3 },
        uViewAspect: { value: 1.0 },
        uMirrorX: { value: 0.0 },
        uBrightness: { value: 0.96 },
      },
    });

    const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.passthroughMaterial);
    this.passthroughScene.add(bgQuad);
  }

  setPassthrough(active, videoTexture = null, videoAspect = 4 / 3, mirrorX = false) {
    this.passthroughActive = Boolean(active && videoTexture);
    this.passthroughTexture = videoTexture;
    this.passthroughVideoAspect = videoAspect || 4 / 3;
    this.passthroughMirrorX = Boolean(mirrorX);

    if (this.passthroughMaterial) {
      this.passthroughMaterial.uniforms.uVideoTex.value = this.passthroughTexture;
      this.passthroughMaterial.uniforms.uVideoAspect.value = this.passthroughVideoAspect;
      this.passthroughMaterial.uniforms.uMirrorX.value = this.passthroughMirrorX ? 1.0 : 0.0;
    }
  }

  _rebuildRenderTargets() {
    if (this.leftTarget) this.leftTarget.dispose();
    if (this.rightTarget) this.rightTarget.dispose();

    const dpr = this.renderer.getPixelRatio();
    const eyeW = Math.max(64, Math.floor(this.width * 0.5 * dpr));
    const eyeH = Math.max(64, Math.floor(this.height * dpr));

    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      colorSpace: THREE.SRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
    };

    this.leftTarget = new THREE.WebGLRenderTarget(eyeW, eyeH, opts);
    this.rightTarget = new THREE.WebGLRenderTarget(eyeW, eyeH, opts);
    this.distortionMaterial.uniforms.uLeftEye.value = this.leftTarget.texture;
    this.distortionMaterial.uniforms.uRightEye.value = this.rightTarget.texture;
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);

    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(this.maxPixelRatio);
    this.renderer.setSize(this.width, this.height, false);

    this._rebuildRenderTargets();
    this.updateEyeOptics();
  }

  setStereoEnabled(enabled) {
    this.stereoEnabled = Boolean(enabled);
    this.updateEyeOptics();
  }

  toggleStereo() {
    this.setStereoEnabled(!this.stereoEnabled);
    return this.stereoEnabled;
  }

  setBarrelDistortionEnabled(enabled) {
    this.barrelDistortionEnabled = Boolean(enabled);
  }

  toggleBarrelDistortion() {
    this.barrelDistortionEnabled = !this.barrelDistortionEnabled;
    return this.barrelDistortionEnabled;
  }

  setIpdMeters(ipdMeters) {
    this.ipdMeters = THREE.MathUtils.clamp(ipdMeters, 0.050, 0.080);
    this.updateEyeOptics();
  }

  adjustIpdMillimeters(deltaMm) {
    this.setIpdMeters(this.ipdMeters + deltaMm * 0.001);
    return this.ipdMeters;
  }

  getIpdMillimeters() {
    return this.ipdMeters * 1000;
  }

  getActiveRayCamera() {
    return this.monoCamera;
  }

  updateEyeOptics() {
    const fullAspect = this.width / Math.max(1, this.height);
    this.monoCamera.fov = this.monoFov;
    this.monoCamera.aspect = fullAspect;
    this.monoCamera.updateProjectionMatrix();

    const halfIpd = this.ipdMeters * 0.5;
    this.leftCamera.position.set(-halfIpd, 0, 0);
    this.rightCamera.position.set(halfIpd, 0, 0);

    const eyeAspect = (this.width * 0.5) / Math.max(1, this.height);
    this._applyOffAxisProjection(this.leftCamera, -1, eyeAspect);
    this._applyOffAxisProjection(this.rightCamera, 1, eyeAspect);

    this.distortionMaterial.uniforms.uEyeAspect.value = eyeAspect;
  }

  _applyOffAxisProjection(camera, eyeSign, eyeAspect) {
    const top = this.near * Math.tan(THREE.MathUtils.degToRad(this.verticalFov * 0.5));
    const bottom = -top;
    const halfWidth = top * Math.max(0.25, eyeAspect);

    let frustumShift = 0;
    if (this.convergenceDistance > this.near * 2) {
      frustumShift = -eyeSign * ((0.5 * this.ipdMeters * this.near) / this.convergenceDistance);
    }

    const left = -halfWidth + frustumShift;
    const right = halfWidth + frustumShift;
    camera.projectionMatrix.makePerspective(left, right, top, bottom, this.near, this.far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  _renderSingleView(scene, camera, viewAspect) {
    if (this.passthroughActive && this.passthroughTexture) {
      this.passthroughMaterial.uniforms.uViewAspect.value = Math.max(0.25, viewAspect);
      this.passthroughMaterial.uniforms.uVideoAspect.value = this.passthroughVideoAspect;
      this.passthroughMaterial.uniforms.uMirrorX.value = this.passthroughMirrorX ? 1.0 : 0.0;

      const prevAutoClear = this.renderer.autoClear;
      this.renderer.autoClear = false;
      this.renderer.clear();
      this.renderer.render(this.passthroughScene, this.passthroughCamera);
      this.renderer.clearDepth();
      this.renderer.render(scene, camera);
      this.renderer.autoClear = prevAutoClear;
    } else {
      this.renderer.autoClear = true;
      this.renderer.render(scene, camera);
    }
  }

  render(scene) {
    this.trackingOrigin.updateMatrixWorld(true);
    const fullAspect = this.width / Math.max(1, this.height);
    const eyeAspect = (this.width * 0.5) / Math.max(1, this.height);

    if (!this.stereoEnabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, this.width, this.height);
      this._renderSingleView(scene, this.monoCamera, fullAspect);
      return;
    }

    if (this.barrelDistortionEnabled && this.leftTarget && this.rightTarget) {
      // Pass 1: Render Left Eye (with live camera passthrough if enabled) to offscreen target
      this.renderer.setScissorTest(false);
      this.renderer.setRenderTarget(this.leftTarget);
      this._renderSingleView(scene, this.leftCamera, eyeAspect);

      // Pass 2: Render Right Eye to offscreen target
      this.renderer.setRenderTarget(this.rightTarget);
      this._renderSingleView(scene, this.rightCamera, eyeAspect);

      // Pass 3: Composite side-by-side with Brown-Conrady barrel lens distortion
      this.renderer.setRenderTarget(null);
      this.renderer.autoClear = true;
      this.renderer.setViewport(0, 0, this.width, this.height);
      this.renderer.render(this.postScene, this.postCamera);
    } else {
      // Direct split-screen without barrel distortion
      const halfW = Math.floor(this.width * 0.5);
      const rightW = this.width - halfW;

      this.renderer.setRenderTarget(null);
      this.renderer.setScissorTest(true);

      this.renderer.setViewport(0, 0, halfW, this.height);
      this.renderer.setScissor(0, 0, halfW, this.height);
      this._renderSingleView(scene, this.leftCamera, eyeAspect);

      this.renderer.setViewport(halfW, 0, rightW, this.height);
      this.renderer.setScissor(halfW, 0, rightW, this.height);
      this._renderSingleView(scene, this.rightCamera, eyeAspect);

      this.renderer.setScissorTest(false);
    }
  }

  dispose() {
    if (this.leftTarget) this.leftTarget.dispose();
    if (this.rightTarget) this.rightTarget.dispose();
    this.distortionMaterial.dispose();
    this.passthroughMaterial.dispose();
    this.renderer.dispose();
  }
}
