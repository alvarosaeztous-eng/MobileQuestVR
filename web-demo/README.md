# MobileQuestVR Web (Fase 2)

Versión web 3D de **MobileQuestVR** optimizada para **Google Chrome en Android**, ejecutable directamente desde un enlace **HTTPS** (como GitHub Pages) sin instalar Unity ni usar un ordenador.

> Esta carpeta (`web-demo/`) es totalmente independiente y **no modifica ni elimina** el proyecto original de Unity 6 ubicado en la raíz del repositorio.

---

## Funcionalidades implementadas (Fase 1 + Fase 2)

### 1. Seguimiento real de manos con MediaPipe Tasks Vision (`js/handTracking.js`, `js/cameraManager.js`)
- Integra **`@mediapipe/tasks-vision@1.2.3`** (`HandLandmarker`) usando la **cámara real del móvil** mediante `navigator.mediaDevices.getUserMedia`.
- **Nunca simula detección de manos**: si no hay permiso de cámara, no se abre bajo HTTPS o falla la descarga del runtime/modelo de MediaPipe, muestra el motivo real al usuario y mantiene el modo desactivado.
- Dibuja los **21 puntos clave (landmarks) y conexiones óseas** de hasta 2 manos:
  - Como **esqueleto 3D interactivo + rayo láser** frente al usuario en Modo Normal y Modo VR Estereoscópico (con suavizado filtro One-Euro).
  - En una **vista previa 2D en vivo** en Modo Normal para verificar fácilmente el encuadre de la mano.
- **Gestos básicos reales** (`classifyHandGesture`, invariantes a la escala de la mano):
  - **Pinza (`pinch`)** (pulgar + índice): selecciona botones 3D, iconos del menú de apps o agarra/suelta objetos 3D.
  - **Puño cerrado (`fist`)**: agarra el objeto 3D apuntado con el rayo de la mano y lo suelta al abrirla.
  - **Mano abierta (`open_palm`, ~1 segundo)**: invoca el menú flotante 3D de Inicio / Aplicaciones frente a ti.
- Descarga el runtime WASM v1.2.3 (`jsdelivr` con respaldo `unpkg`) y el modelo oficial `hand_landmarker.task`, intentando primero aceleración **GPU** y cambiando automáticamente a **CPU** si la GPU móvil no soporta el delegado WebGL2.

### 2. Modo cámara real / Passthrough (`js/cameraManager.js`, `js/stereoRenderer.js`, `js/room.js`)
- Muestra la **imagen real de la cámara del móvil** como fondo en directo con recorte proporcional (`object-fit: cover` sin deformación).
- Superpone los **elementos 3D, mesa holográfica translúcida, manos 3D, menú de apps y panel de ajustes** sobre el vídeo real tanto en **Modo Normal** como en **Modo VR Estereoscópico** (con y sin distorsión barrel).
- Comparte un único flujo de cámara (`CameraManager` con conteo de referencias) para que **Passthrough** y **Seguimiento de manos** puedan funcionar **simultáneamente** en Android Chrome sin conflictos de cámara.
- Permite alternar entre **cámara trasera y frontal** (`Trasera / Frontal`) y entre **Passthrough** y **Sala Virtual 3D** en cualquier momento.
- **Comprobación de lente tapada**: analiza la luminancia del vídeo en vivo y avisa si las gafas VR están cubriendo físicamente la lente trasera del teléfono. Nunca afirma que Passthrough funciona si la cámara no está activa.

### 3. Menú flotante 3D de aplicaciones (`js/appsMenu.js`)
- Dock flotante 3D al estilo Meta Quest invocable desde el botón **Inicio** o manteniendo la **mano abierta (~1 s)**, con 5 iconos interactivos 3D:
  - **Chrome** → abre enlace externo real (`https://www.google.com/chrome/`).
  - **YouTube** → abre enlace externo real (`https://m.youtube.com/`, que Android puede abrir en la app de YouTube o en el navegador).
  - **Google** → abre enlace externo real (`https://www.google.com/`).
  - **Ajustes** → abre el panel flotante 3D de configuración VR frente a ti.
  - **Volver a MobileQuestVR** → cierra el lanzador y vuelve el enfoque a tu entorno VR/Passthrough.
- **Comportamiento honesto**: las aplicaciones externas se abren únicamente como enlaces externos en una nueva pestaña / app compatible de Android. Si Chrome bloquea la apertura automática (habitual cuando se activa mediante mirada o gesto de mano en lugar de toque directo), aparece una barra con un botón de 1 toque (`Abrir ↗`) para abrir el enlace sin errores. Nunca incrusta apps privadas en `iframe` ni finge ejecutarlas dentro del visor.

### 4. Interfaz cómoda estilo Meta Quest + Funcionalidades conservadas de Fase 1
- **HUD rápido en Modo Normal y barra compacta en Modo VR**:
  - **Inicio** (menú flotante 3D de aplicaciones).
  - **Modo VR / Modo Normal** (pantalla completa, bloqueo horizontal, Wake Lock y vista estereoscópica).
  - **Passthrough / Sala 3D** (cámara real vs habitación virtual).
  - **Manos: ON / OFF** (MediaPipe real).
  - **Cabeza: ON / OFF** (activa o pausa el seguimiento 3DoF por giroscopio conservando el ángulo actual).
  - **Recentrar** (reorienta el horizonte).
  - **Ajustes 3D** (panel holográfico con IPD `50–80 mm`, Lente Barrel ON/OFF, 3 ambientes de luz, Reiniciar objetos, Cámara Trasera/Frontal y Anclar/Seguir).
  - **Interactuar** + controles **Acercar / Soltar / Alejar** para objetos 3D físicos.
- Se conservan íntegros la habitación virtual 3D futurista, la física de agarre y lanzamiento, el holograma interactivo, el pad de audio Web Audio API, la telemetría mural 3D en vivo y la distorsión óptica Brown-Conrady.

---

## Cómo abrirlo y publicarlo en GitHub Pages (HTTPS)

1. Fusiona los cambios en la rama `main` de **`alvarosaeztous-eng/MobileQuestVR`**.
2. En GitHub, ve a **Settings** → **Pages**, selecciona `Deploy from a branch`, rama `main` y carpeta `/ (root)`, y pulsa **Save**.
3. Abre en **Google Chrome Android**:
   ```text
   https://alvarosaeztous-eng.github.io/MobileQuestVR/web-demo/
   ```
4. Concede los permisos cuando Chrome los solicite:
   - **Sensores de movimiento / giroscopio**: al pulsar **Modo VR** o activar **Cabeza: ON**.
   - **Cámara**: al pulsar **Passthrough** o **Manos: ON**.

---

## Limitaciones reales actuales (hardware y navegador)

- **HTTPS obligatorio**: Chrome Android bloquea `getUserMedia` (cámara) y los sensores `DeviceOrientation` si la página se abre en `http://` (salvo `localhost`).
- **Gafas VR con tapa cerrada**: muchos visores VR económicos de plástico o cartón cubren la cámara trasera del móvil. Si la lente está tapada, ni Passthrough ni el seguimiento de manos con cámara trasera podrán ver el entorno (el visor avisará automáticamente). Necesitarás una tapa frontal abierta/recortada o probar primero fuera del visor / con cámara frontal.
- **Descarga inicial de MediaPipe**: el módulo JS `@mediapipe/tasks-vision@1.2.3` está incluido localmente en `vendor/mediapipe/`, pero el runtime WebAssembly (~10 MB) y el modelo neuronal `hand_landmarker.task` (~7.5 MB) se descargan de los servidores oficiales de MediaPipe/CDN la primera vez que activas **Manos: ON** (requiere conexión a Internet en esa primera carga).
- **Profundidad monocular en manos**: al usar una sola cámara del teléfono (sin sensores de profundidad LiDAR/estéreo dedicados), la distancia Z de la mano se estima a partir del tamaño aparente de la palma, por lo que la precisión en profundidad es menor que en un visor Meta Quest nativo.
- **Seguimiento de cabeza 3DoF**: en navegador móvil se dispone de rotación 3DoF (giroscopio/orientación), no de traslación posicional 6DoF en la habitación.
- **Aplicaciones externas**: por seguridad del navegador y de Android, una web no puede ejecutar apps nativas ni mostrar servicios como YouTube/Google dentro de ventanas internas privadas; los iconos abren enlaces reales externos.

---

## Dependencias incluidas

- **Three.js r170** incluido localmente en `vendor/three/three.module.min.js` (licencia MIT).
- **`@mediapipe/tasks-vision@1.2.3`** incluido localmente en `vendor/mediapipe/vision_bundle.mjs` (licencia Apache-2.0), con carga en tiempo de ejecución del runtime WASM v1.2.3 y modelo oficial `hand_landmarker.task`.
- **Sin paso de compilación**: HTML5, CSS3 y módulos ES nativos listos para GitHub Pages.
