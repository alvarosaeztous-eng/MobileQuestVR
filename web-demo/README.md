# MobileQuestVR Web (Fase 2 + Cine YouTube 3D en VR)

Versión web 3D de **MobileQuestVR** optimizada para **Google Chrome en Android**, ejecutable directamente desde un enlace **HTTPS** (como GitHub Pages) sin instalar Unity ni usar un ordenador.

> Esta carpeta (`web-demo/`) es totalmente independiente y **no modifica ni elimina** el proyecto original de Unity 6 ubicado en la raíz del repositorio.

---

## Funcionalidades implementadas

### 1. Pantalla flotante 3D de YouTube dentro del entorno VR (`js/youtubeScreen.js`)
- **Reproductor oficial real de YouTube**: utiliza la **YouTube IFrame Player API** (`https://www.youtube.com/iframe_api`) configurada con el dominio oficial de privacidad **`https://www.youtube-nocookie.com`** (`autoplay: 0`, `playsinline: 1`, `enablejsapi: 1`). Nunca simula ni finge reproducción.
- **Superficie 3D real visible en ambos ojos en Modo Estereoscópico**:
  - Proyección **CSS3D matemática exacta** (`WORLD_TO_CSS = 500`, sincronizada al subpíxel con las matrices de `PerspectiveCamera` de Three.js) acoplada a un **marco de cine 3D WebGL** con respaldo opaco, cabecera holográfica de estado y barra inferior de botones 3D interactivos.
  - En **Modo Normal (Mono)**: usa una sola vista CSS3D ligada a `monoCamera`.
  - En **Modo VR Estereoscópico**: activa dos vistas CSS3D recortadas izquierda/derecha (`leftCamera` y `rightCamera` con offset IPD real) con dos instancias sincronizadas del reproductor oficial (ojo izquierdo con audio y ojo derecho silenciado `mute: 1` con sincronización automática de tiempo/pausa para evitar eco).
  - Al abrir YouTube 3D en Modo VR, cambia automáticamente a **Stereo Directo** (proyección plana) para que el marco WebGL y el iframe CSS3D coincidan píxel a píxel en ambos ojos, y restaura automáticamente la distorsión barrel al cerrar YouTube.
- **Selector de URL y vídeos de prueba**:
  - Permite pegar cualquier enlace de YouTube (`youtube.com/watch?v=...`, `m.youtube.com/watch?v=...`, `youtu.be/...`, `shorts/...`, `live/...`, `embed/...`, `youtube-nocookie.com/embed/...`) o un ID de 11 caracteres, además de elegir vídeos de prueba con incrustación habilitada.
- **Controles completos (en 3D dentro de VR y en HUD móvil)**:
  - **Reproducir** (siempre manual — nunca depende de autoplay), **Pausar**, **Cambiar tamaño (`S` `1.36×0.765 m`, `M` `1.92×1.08 m`, `L` `2.56×1.44 m`)**, **Cambiar URL / Vídeo**, **Traer aquí** y **Cerrar**.
- **Detección honesta de vídeos con incrustación bloqueada**:
  - Detecta los errores reales de la API de YouTube (como códigos **`101` / `150`** cuando el propietario desactiva la reproducción incrustada, o `100` / `2` / `5`), muestra un aviso claro dentro de la experiencia y ofrece un botón de 1 toque para **abrir el vídeo en YouTube externo**.

### 2. Seguimiento real de manos con MediaPipe Tasks Vision (`js/handTracking.js`, `js/cameraManager.js`)
- Integra **`@mediapipe/tasks-vision@1.2.3`** (`HandLandmarker`) usando la **cámara real del móvil** (`navigator.mediaDevices.getUserMedia`), sin simulaciones.
- Dibuja los **21 puntos clave (landmarks) y conexiones óseas** de hasta 2 manos como esqueleto 3D interactivo + rayo láser (con filtro One-Euro) y vista previa 2D en Modo Normal.
- **Gestos reales**: **Pinza (`pinch`)** para seleccionar botones/apps/controles 3D de YouTube o agarrar objetos, **Puño (`fist`)** para agarrar objetos 3D, y **Mano abierta (`open_palm`, ~1 s)** para abrir el Menú de Inicio.
- Descarga runtime WASM v1.2.3 (`jsdelivr` / respaldo `unpkg`) y modelo oficial `hand_landmarker.task` con respaldo automático `GPU` → `CPU`.

### 3. Modo cámara real / Passthrough (`js/cameraManager.js`, `js/stereoRenderer.js`, `js/room.js`)
- Muestra la cámara real del móvil como fondo proporcional (`object-fit: cover`) con objetos 3D, pantalla YouTube 3D, menús y manos superpuestos en Modo Normal y Modo VR.
- Comparte una sola cámara entre **Passthrough** y **Manos MediaPipe** sin conflictos, permite alternar **Trasera / Frontal** y detecta si las gafas VR están tapando físicamente la lente trasera.

### 4. Menú flotante 3D de aplicaciones e interfaz estilo Meta Quest (`js/appsMenu.js`, `js/floatingMenu.js`, `js/main.js`)
- Menú 3D **Inicio** con 5 iconos: **YouTube** (abre la pantalla flotante 3D de Cine VR dentro del entorno), **Chrome** (enlace externo), **Google** (enlace externo), **Ajustes** (panel 3D de configuración VR) y **Volver a MobileQuestVR**.
- HUD rápido con **Inicio**, **YouTube 3D**, **Modo VR / Normal**, **Passthrough / Sala 3D**, **Manos ON/OFF**, **Cabeza ON/OFF**, **Recentrar**, **Ajustes 3D** e **Interactuar**, conservando íntegras la habitación 3D futurista, física de agarre/lanzamiento, ajuste de IPD `50–80 mm`, lente barrel, 3 ambientes de luz, audio Web Audio API y telemetría mural 3D.

---

## Cómo abrirlo y publicarlo en GitHub Pages (HTTPS)

1. Fusiona los cambios en la rama `main` de **`alvarosaeztous-eng/MobileQuestVR`**.
2. En GitHub, ve a **Settings** → **Pages**, selecciona `Deploy from a branch`, rama `main` y carpeta `/ (root)`, y pulsa **Save**.
3. Abre en **Google Chrome Android**:
   ```text
   https://alvarosaeztous-eng.github.io/MobileQuestVR/web-demo/
   ```
4. Para usar **YouTube 3D**:
   - Pulsa **YouTube 3D** en la barra inferior o abre **Inicio** → icono **YouTube**.
   - Pulsa **▶ Reproducir** manualmente (en los controles 3D bajo la pantalla, en la barra del HUD o directamente sobre el botón rojo del reproductor YouTube).
   - Pulsa **🔗 Cambiar URL** para pegar cualquier enlace de YouTube o elegir un vídeo de prueba.

---

## Compatibilidad con Android Chrome y limitaciones reales

### Limitaciones de YouTube y del navegador (Cine 3D VR)
- **Seguridad cross-origin (`CORS`)**: los navegadores prohíben leer píxeles de un `<iframe>` oficial de YouTube para convertirlos en textura WebGL (`VideoTexture`). Por eso se usa una capa **CSS3D sincronizada** sobre el marco WebGL 3D.
- **Sin distorsión barrel sobre el iframe**: los shaders WebGL de distorsión barrel Brown-Conrady no pueden deformar elementos DOM `<iframe>`. Para mantener la alineación exacta entre el marco 3D y el vídeo en ambos ojos, el Modo VR usa automáticamente **Stereo Directo** mientras la pantalla de YouTube 3D está abierta y restaura la lente barrel al cerrarla.
- **Doble flujo en Modo Estereoscópico**: mostrar el reproductor oficial de YouTube en ambos ojos requiere dos instancias sincronizadas de `youtube-nocookie.com` (ojo izquierdo con audio, ojo derecho silenciado). Esto consume mayor ancho de banda/CPU en móviles y puede producir breves desfases (~0,2–0,4 s) al cambiar de minuto o durante buffering (el sistema resincroniza automáticamente cada ~1,2 s).
- **Vídeos con incrustación bloqueada (`101` / `150`)**: muchos vídeos musicales, transmisiones o canales desactivan la reproducción incrustada o aplican restricciones de edad/DRM. Ninguna web puede saltarse esa política de YouTube; la app detecta el error real y ofrece un botón directo para abrir el vídeo en YouTube externo.
- **Política de reproducción manual en Android Chrome**: Chrome bloquea la reproducción automática con sonido sin interacción directa del usuario; por ello la reproducción siempre es manual (`autoplay: 0`).
- **Interacción táctil sobre el iframe**: los toques dentro del rectángulo del vídeo van al reproductor oficial de YouTube (permitiendo pulsar ▶, pausar o ajustar calidad), mientras que arrastrar fuera del vídeo mueve la cámara y mirar/hacer pinza sobre la barra 3D inferior activa los controles VR (`Reproducir`, `Pausar`, `Tamaño`, `URL`, `Traer`, `Cerrar`).

### Limitaciones generales de hardware móvil y navegador
- **HTTPS obligatorio**: Chrome Android requiere HTTPS para cámara (`getUserMedia`) y giroscopio (`DeviceOrientation`).
- **Gafas VR cerradas**: si la tapa frontal cubre la cámara trasera, Passthrough y Manos con cámara trasera no podrán ver el entorno (la app avisa automáticamente).
- **Primera carga con Internet**: el módulo JS `@mediapipe/tasks-vision@1.2.3` está incluido localmente, pero el runtime WASM (~10 MB), `hand_landmarker.task` (~7,5 MB) y `youtube.com/iframe_api` se descargan desde sus servidores oficiales al activarse.
- **Seguimiento 3DoF y profundidad monocular**: el navegador móvil ofrece rotación 3DoF (sin traslación 6DoF) y estimación monocular de profundidad para las manos.

---

## Dependencias incluidas

- **Three.js r170** incluido localmente en `vendor/three/three.module.min.js` (MIT).
- **`@mediapipe/tasks-vision@1.2.3`** incluido localmente en `vendor/mediapipe/vision_bundle.mjs` (Apache-2.0).
- **YouTube IFrame Player API** (`https://www.youtube.com/iframe_api` + `https://www.youtube-nocookie.com`) cargada bajo demanda únicamente al abrir la pantalla 3D de YouTube.
- **Sin paso de compilación**: HTML5, CSS3 y módulos ES nativos listos para GitHub Pages.
