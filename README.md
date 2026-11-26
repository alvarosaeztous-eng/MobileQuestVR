# MobileQuestVR

Proyecto base funcional de **Realidad Virtual móvil para Android** desarrollado desde cero con **Unity 6 (6000.0 LTS)** y **C#**.

## Arquitectura implementada (v0.1)

1. **Estructura completa de proyecto Unity 6**:
   - `Packages/manifest.json` (Unity 6 Input System `1.11.2`, uGUI `2.0.0`, Test Framework, Android JNI y módulos nativos).
   - `ProjectSettings/` preconfigurado para Android VR (`LandscapeLeft`, `IL2CPP`, `ARM64`, `Min SDK API 26`, espacio de color Linear, capas VR dedicadas y shaders siempre incluidos en build).
   - Ensamblados modulares (`.asmdef`): `MobileQuestVR`, `MobileQuestVR.Editor` y `MobileQuestVR.Tests.EditMode`.
   - `Assets/Plugins/Android/AndroidManifest.xml` con permisos de cámara (`CAMERA`), vibración (`VIBRATE`) y declaración de sensores (`gyroscope`, `accelerometer`, `camera`, `OpenGL ES 3.0`).

2. **Habitación virtual 3D (`Assets/MobileQuestVR/Scripts/Environment/`)**:
   - Escena principal `Assets/MobileQuestVR/Scenes/VirtualRoom.unity` con habitación arquitectónica 6 m × 3.2 m × 6 m, suelo con cuadrícula métrica procedural (`RoomSurfaceLit.shader`) para referencia de profundidad estereoscópica, iluminación dinámica en 3 ambientes (*Studio Day*, *Warm Lounge*, *Cyber Neon*), mesa de trabajo VR, estantería periférica y ventana panorámica.
   - Objetos interactivos físicos y animados sobre la mesa: cubo holográfico agarrable, esfera energética con rebote físico, monolito esmeralda, lámpara selectora de iluminación, pedestal holográfico orbital y pad musical espacial con síntesis de audio PCM procedural (`ProceduralAudioLibrary.cs`).

3. **Sistema de renderizado VR estereoscópico (`Assets/MobileQuestVR/Scripts/Rendering/`)**:
   - `VRStereoRig`: doble cámara dividida lado a lado (`LeftEyeCamera` `[0..0.5]` / `RightEyeCamera` `[0.5..1.0]`) + cámara de fondo negro OLED (`StereoBackdropClearCamera`).
   - `StereoEyeFrustum`: cálculo de matriz de proyección **off-axis asimétrica** sin distorsión vertical keystone, con ajuste dinámico de **IPD** (50–80 mm) y **FOV** vertical.
   - `StereoDistortionEffect` + `StereoBarrelDistortion.shader`: distorsión óptica **Brown-Conrady** ($k_1, k_2$), corrección de aberración cromática lateral (R/G/B) y viñeteado suave por ojo, activable/desactivable en tiempo real junto con el cambio Stereo/Mono.

4. **Seguimiento de cabeza por giroscopio (`Assets/MobileQuestVR/Scripts/Tracking/`)**:
   - `GyroCoordinateConverter`: conversión matemática validada del marco derecho Android ENU (`TYPE_ROTATION_VECTOR`) al espacio izquierdo Y-up de Unity para `LandscapeLeft`, `LandscapeRight` y `Portrait`, más recentrado de guiñada (`RecenterYaw`) preservando el horizonte.
   - `AndroidGyroTrackingSource`: detección automática en 3 niveles:
     1. Unity 6 Input System `AttitudeSensor` + `Gyroscope`.
     2. Fallback `UnityEngine.Input.gyro`.
     3. Fusión de giroscopio crudo + gravedad/acelerómetro mediante `ComplementaryOrientationFilter`.
   - `VRHeadTracker`: suavizado SLERP adaptativo según velocidad angular y modelo biomecánico de pivote cervical (cuello), con control de prueba por ratón/teclado en el Editor (`EditorMouseHeadSource`).

5. **Arquitectura lista para MediaPipe Hand Tracking (`Assets/MobileQuestVR/Scripts/HandTracking/` y `NativePlugins/Android/`)**:
   - Modelo canónico de 21 landmarks (`HandLandmarkId.cs`, `HandSkeletonTopology`, `HandTrackingData.cs`).
   - Interfaz desacoplada `IHandTrackingProvider` y gestor `VRHandTrackingManager`.
   - Puente JNI Android real (`AndroidMediaPipeHandProvider.cs`) + implementación Java nativa lista con **MediaPipe Tasks Vision (`HandLandmarker` en `LIVE_STREAM` con GPU Delegate) + CameraX** en `NativePlugins/Android/MediaPipeHandBridge.java` y `HandLandmarkCallback.java`.
   - Proyección pinhole 2D+world a 3D VR (`HandSpatialMapper.cs`) con **filtro One-Euro** por articulación (`OneEuroFilter.cs`).
   - Reconocimiento geométrico de gestos (`HandGestureRecognizer.cs`): *Pinch* (con histéresis), *Point*, *FistGrab*, *OpenPalm* (palma hacia la cabeza invoca el menú) y *ThumbsUp*.
   - Visualizador 3D articulado de ambas manos (`VRHandVisualizer.cs`) y herramienta de prueba de 21 landmarks en Editor (`EditorHandInputProvider.cs`, tecla `H`).

6. **Objetos interactivos y menús flotantes (`Assets/MobileQuestVR/Scripts/Interaction/` y `Assets/MobileQuestVR/Scripts/UI/`)**:
   - Contrato `IVRInteractable`, `VRInteractableBase`, `VRGrabbableObject` (física de agarre y lanzamiento con `Rigidbody.linearVelocity`), `VRToggleInteractable` y `VRButtonInteractable`.
   - Controlador multimodal `VRInteractionController`: prioriza manos (pinch directo cercano o rayo láser) y cae automáticamente a mirada + retícula estereoscópica (`VRGazeReticle` con shader SDF `GazeReticle.shader`, dwell de 1.15 s o toque en pantalla).
   - Menú flotante holográfico en espacio mundo (`VRFloatingMenu` + `FloatingMenuAnchor` con modo anclado o seguimiento suave) y panel mural de telemetría en tiempo real (`VRTelemetryBoard`).

---

## Cómo abrir y ejecutar el proyecto

### 1. En el Editor de Unity 6 (Windows / macOS / Linux)

1. Instala **Unity 6 (6000.0 LTS)** desde Unity Hub con el módulo **Android Build Support** (incluyendo OpenJDK, Android SDK y NDK).
2. Abre la carpeta raíz de este repositorio en Unity Hub.
3. Abre la escena **`Assets/MobileQuestVR/Scenes/VirtualRoom.unity`**.
4. *(Opcional)* Si deseas visualizar y editar todos los objetos de la habitación directamente en la vista *Scene* antes de ejecutar, pulsa en el menú superior:
   `MobileQuestVR -> Build Virtual Room in Current Scene` y guarda la escena.
5. Pulsa **Play**:
   - **Click derecho + arrastrar**: mirar alrededor (simulación de giroscopio en PC).
   - **W / A / S / D**: desplazarse dentro de la habitación (solo en Editor).
   - **Q / E**: inclinar cabeza (roll).
   - **Click izquierdo / Espacio** o mantener la retícula 1.15 s: interactuar / agarrar / pulsar botones del menú flotante.
   - **R**: recentrar la vista.
   - **M**: mostrar u ocultar el menú flotante VR.
   - **H**: activar/desactivar el probador de mano de 21 landmarks en Editor (ratón mueve la mano, click izquierdo = *Pinch*, `G` = puño, rueda = profundidad).

### 2. Compilar y ejecutar en un móvil Android (v0.1)

1. En Unity 6 ve a `File -> Build Profiles` (o `Build Settings`), selecciona **Android** y pulsa **Switch Platform**.
2. Confirma que `Assets/MobileQuestVR/Scenes/VirtualRoom.unity` esté marcada en la lista de escenas.
3. Ejecuta `MobileQuestVR -> Verify Android VR Project Settings` para comprobar que `IL2CPP`, `ARM64`, `Min SDK 26+`, `LandscapeLeft` y los shaders VR estén listos.
4. Conecta tu teléfono Android con **Depuración USB** activada y pulsa **Build And Run**.
5. Coloca el teléfono en horizontal (`LandscapeLeft`) en un visor móvil (tipo Cardboard/visor VR):
   - Mira a cualquier objeto o botón del menú flotante (1.15 s dwell o toca la pantalla para activar).
   - Toca con **3 dedos** simultáneamente la pantalla para recentrar el giroscopio.

### 3. Activar MediaPipe Hand Tracking nativo en Android

El proyecto compila en Android desde el primer día sin dependencias externas bloqueantes. Cuando quieras activar la inferencia real de **MediaPipe Hand Landmarker** con la cámara trasera en Android:

1. En Unity abre `MobileQuestVR -> MediaPipe Hand Tracking Setup` y pulsa **Install Native Java Bridge** (copia `MediaPipeHandBridge.java` y `HandLandmarkCallback.java` a `Assets/Plugins/Android/com/mobilequestvr/handtracking/`).
2. Descarga `hand_landmarker.task` (float16 oficial de Google MediaPipe) y guárdalo en `Assets/StreamingAssets/hand_landmarker.task`.
3. En `Project Settings -> Player -> Android -> Publishing Settings`, activa **Custom Main Gradle Template** y añade las dependencias listadas en `NativePlugins/Android/mediapipe-dependencies.gradle` (y verifica que **Application Entry Point** use `GameActivity` para `LifecycleOwner` de CameraX).
4. Recompila el APK en Android: `AndroidMediaPipeHandProvider` detectará la clase JNI automáticamente y comenzará a transmitir las 21 articulaciones en tiempo real al visor VR.

### 4. Ejecutar pruebas unitarias (EditMode Tests)

En Unity 6 abre `Window -> General -> Test Runner`, pestaña **EditMode**, y ejecuta **Run All** para validar:
- `GyroCoordinateConverterTests` (conversión Android ENU → Unity y recentrado)
- `StereoEyeFrustumTests` (offsets IPD y proyección off-axis asimétrica)
- `HandGestureRecognizerTests` (gestos y decodificador de buffer binario MediaPipe)
- `OneEuroFilterTests` (supresión de jitter y seguimiento rápido)
