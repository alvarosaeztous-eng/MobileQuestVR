# MobileQuestVR Web

Versión web 3D de **MobileQuestVR** optimizada para **Google Chrome en Android**, ejecutable directamente desde un enlace **HTTPS** sin instalar Unity ni usar un ordenador.

> Esta carpeta (`web-demo/`) es totalmente independiente y **no modifica** el proyecto original de Unity 6 ubicado en la raíz del repositorio.

---

## Funcionalidades implementadas (Fase 1)

1. **Habitación virtual 3D futurista** (`js/room.js`):
   - Entorno arquitectónico 3D de `6.4 m × 3.4 m × 6.4 m` con suelo de cuadrícula métrica y paneles procedurales, ventanal panorámico con campo estelar 3D, mesa de trabajo central, columnas con iluminación LED y 3 ambientes de luz (*Studio Cyber*, *Warm Lounge*, *Deep Neon*).
2. **Renderizado estereoscópico VR real** (`js/stereoRenderer.js`):
   - Doble cámara izquierda/derecha con proyección **off-axis asimétrica**, ajuste de **IPD** en tiempo real (`50–80 mm`), vista dividida lado a lado y shader WebGL de **distorsión barrel Brown-Conrady + aberración cromática + viñeteado** activable/desactivable al instante.
3. **Seguimiento de cabeza con DeviceOrientation API** (`js/headTracker.js`):
   - Conversión matemática exacta de orientación `(alpha, beta, gamma)` + compensación automática de `screen.orientation.angle` (vertical y horizontal), suavizado SLERP adaptativo, modelo biomecánico de cuello y recentrado preservando el horizonte.
   - Control táctil de respaldo (arrastrar con un dedo para mirar alrededor) cuando el giroscopio no esté activo.
4. **Menú flotante 3D y panel de telemetría** (`js/floatingMenu.js`):
   - Panel holográfico en espacio mundo 3D con botones interactivos (Recentrar, Modo Stereo/Mono, Lente Barrel ON/OFF, IPD −/+ 1 mm, Luz Ambiental, Reiniciar Objetos y Anclar/Seguir Menú) más pantalla mural con FPS, óptica y ángulos del giroscopio en vivo.
5. **Objetos 3D interactivos y física** (`js/interaction.js`, `js/room.js`):
   - Selecciona, agarra, acerca/aleja y lanza objetos con gravedad y rebote físico (Cubo Holográfico, Esfera de Plasma, Cristal Esmeralda), además de interruptor de iluminación ambiental, holograma orbital con modo turbo y pad acústico con síntesis Web Audio API (`js/audio.js`).
6. **Controles optimizados para Android** (`index.html`, `css/styles.css`, `js/main.js`):
   - Botón **Modo VR** (pantalla completa + bloqueo horizontal + Wake Lock + giroscopio + vista estereoscópica), botón **Recentrar**, retícula estereoscópica con activación por mirada (`1.1 s`) o toque en pantalla, y controles táctiles para agarrar/acercar/alejar/soltar objetos.
7. **Preparado para Fase 2 (MediaPipe Tasks Vision)**:
   - `js/handTrackingHook.js` y `VRInteractionController.setExternalPointer()` dejan listo el punto de integración para conectar seguimiento real de manos con la cámara en la siguiente fase.

---

## Cómo publicarlo en GitHub Pages (HTTPS) desde tu Android

1. Fusiona o sube estos cambios a la rama principal (`main`) de tu repositorio **`alvarosaeztous-eng/MobileQuestVR`** en GitHub (puedes hacerlo directamente desde la app o navegador web de GitHub en tu móvil).
2. En tu repositorio de GitHub, abre **Settings** → **Pages**.
3. En **Build and deployment**:
   - **Source**: selecciona `Deploy from a branch`.
   - **Branch**: selecciona `main` y carpeta `/ (root)`.
   - Pulsa **Save**.
4. Espera entre 1 y 2 minutos hasta que GitHub Pages muestre el enlace HTTPS publicado.
5. Abre en **Google Chrome Android**:
   ```text
   https://alvarosaeztous-eng.github.io/MobileQuestVR/web-demo/
   ```
6. Toca **Modo VR**, gira el móvil en horizontal y colócalo en tu visor VR (o explora primero en modo Mono arrastrando con el dedo).

---

## Dependencias incluidas

- **Three.js r170** incluido localmente en `vendor/three/three.module.min.js` (MIT) para cargar rápido y sin depender de CDNs externos.
- **Sin compiladores ni paso de build**: HTML5, CSS3 y módulos ES nativos listos para servir directamente desde GitHub Pages.
