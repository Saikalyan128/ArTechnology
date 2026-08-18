# How Three.js Is Used Here

This project uses **Three.js r160** for all 3D rendering and interaction.
**MindAR** only tracks the image marker and provides the camera / pose.
It does **not** replace Three.js.

Related: [INTERACTION.md](./INTERACTION.md)

---

## Why Three.js + MindAR together

| Concern | Who handles it |
|---------|----------------|
| Open device camera | MindAR |
| Detect image marker (`.mind`) | MindAR |
| Update marker pose every frame | MindAR (`anchor.group` matrix) |
| Scene graph, meshes, materials, lights | **Three.js** |
| WebGL renderer + canvas | **Three.js** (created by MindAR’s Three bridge) |
| Touch raycast + rotate object | **Three.js** |
| Draw final frame | **Three.js** `renderer.render(scene, camera)` |

`MindARThree` is a thin bridge: it constructs Three.js objects and keeps
`anchor.group` aligned with the physical card. Your 3D code is still pure Three.js.

---

## How Three.js is loaded

CDN + import map in `frontend/index.html`:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.1/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.1/examples/jsm/",
    "mindar-image-three": "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js"
  }
}
</script>
```

In `frontend/js/webar.js`:

```js
import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
```

- `three` → core library (Geometry, Material, Mesh, Raycaster, lights, …)
- `three/addons/` → required by MindAR internals (e.g. `CSS3DRenderer.js`)
- `es-module-shims` → helps older browsers honor import maps

Version note: MindAR 1.2.x works best with Three ~r150–r160. Don’t jump to
latest Three without testing.

---

## Who creates the core Three objects?

You do **not** manually create `Scene` / `WebGLRenderer` / main `Camera`.

```js
const mindarThree = new MindARThree({
  container: document.getElementById('ar-root'),
  imageTargetSrc: './assets/targets/card.mind',
});

const { renderer, scene, camera } = mindarThree;
```

| Object | Source | Notes |
|--------|--------|--------|
| `renderer` | MindAR → `THREE.WebGLRenderer` | Draws to canvas over the video |
| `scene` | MindAR → `THREE.Scene` | Root of the 3D graph |
| `camera` | MindAR → Three camera | Projection matched to the video |

We only tweak the renderer for a see-through AR view:

```js
renderer.setClearColor(0x000000, 0);           // transparent clear
renderer.domElement.style.background = 'transparent';
```

So the live `<video>` shows underneath the WebGL canvas.

---

## Building the 3D content (`buildContent`)

All demo meshes live in `buildContent()` in `webar.js`.

### Objects used

| Three.js API | Role in this app |
|--------------|------------------|
| `THREE.Group` | Content root + rotation pivot |
| `THREE.PlaneGeometry` + `MeshBasicMaterial` | Semi-transparent card-sized plane (easy to tap) |
| `THREE.BoxGeometry` + `MeshStandardMaterial` | Orange interactive cube |
| `THREE.DirectionalLight` | Key light (needed by Standard material) |
| `THREE.AmbientLight` | Fill light so faces aren’t pure black |
| `mesh.position` / `group.add` | Layout hierarchy |
| `group.userData` | Store refs to `cube` and `pivot` for interaction |

### Scene hierarchy

```
scene                          (from MindAR)
 └── … MindAR internals …
 └── anchor.group              (MindAR updates world matrix from marker)
       └── content (Group)     (our buildContent() root)
             ├── plane         (MeshBasicMaterial – no light required)
             ├── pivot (Group) (we rotate this on drag)
             │     └── cube    (MeshStandardMaterial – needs lights)
             ├── DirectionalLight
             └── AmbientLight
```

Important pattern — **pivot at cube center**:

```js
pivot.position.copy(cube.position);  // pivot at cube world offset
cube.position.set(0, 0, 0);          // cube local origin = pivot center
pivot.add(cube);
```

Rotating `pivot` spins the cube around itself, not around the card corner.

### Materials

- **Basic** (plane): flat color, ignores lights; good for a simple hit target.
- **Standard** (cube): PBR-ish; reacts to lights (`metalness`, `roughness`).

Without lights, a Standard cube looks black. That’s why lights are children of
`content` (they move with the marker).

---

## Anchoring content to the marker

```js
const anchor = mindarThree.addAnchor(0);  // index 0 = first image in .mind
const content = buildContent();
content.visible = false;
anchor.group.add(content);

anchor.onTargetFound = () => { content.visible = true; };
anchor.onTargetLost  = () => { content.visible = false; };
```

Three.js does **not** track the image. MindAR writes the marker pose into
`anchor.group`. Because `content` is a child, every Three object under it
automatically sticks to the card.

---

## Render loop

```js
renderer.setAnimationLoop(() => {
  if (content.visible && !cube.userData.dragging) {
    pivot.rotation.y += 0.01;   // idle spin (Three.js transform)
  }
  renderer.render(scene, camera);
});
```

- Prefer `renderer.setAnimationLoop` (Three.js helper) over raw `requestAnimationFrame`.
- Each frame: optional animation → `render(scene, camera)`.
- Idle spin pauses while the user drags (`cube.userData.dragging`).

On stop:

```js
renderer.setAnimationLoop(null);
mindarThree.stop();
```

---

## Interaction APIs (Three.js)

| API | Use |
|-----|-----|
| `THREE.Raycaster` | Finger → 3D object hit test |
| `THREE.Vector2` | Normalized device coordinates for the ray |
| `raycaster.setFromCamera(ndc, camera)` | Build ray from screen point |
| `raycaster.intersectObject(content, true)` | Hit cube or plane (recursive) |
| `pivot.rotation.x / .y` | Apply drag deltas |

Screen pixel → NDC:

```js
ndc.x = ((clientX - left) / width) * 2 - 1;
ndc.y = -((clientY - top) / height) * 2 + 1;
```

Details: [INTERACTION.md](./INTERACTION.md).

---

## Coordinate system (what you need day to day)

- Three.js: **Y-up**, right-handed.
- Marker plane lies roughly in the anchor’s local XY (card face).
- Positive local Z lifts content off the card toward the camera (cube sits slightly “above” the card).
- Units are arbitrary; MindAR scales the anchor so the target width maps to roughly size `1` in local X (our plane is `1 × 0.55` to match the sample card aspect).

---

## What Three.js is *not* doing here

| Not used | Why |
|----------|-----|
| WebXR (`renderer.xr`, `ARButton`) | Image markers → MindAR CV instead |
| `GLTFLoader` | Demo uses a procedural cube (easy to add later) |
| `OrbitControls` | Camera is owned by MindAR / AR view |
| Manual `PerspectiveCamera` setup | Provided by `MindARThree` |

---

## Extending with more Three.js

| Goal | Approach |
|------|----------|
| Replace cube with a model | `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`, add `gltf.scene` under `pivot` |
| Animations | `THREE.AnimationMixer` + update mixer in the animation loop |
| Better lighting | `HemisphereLight`, env map, or light baked into GLB |
| Shadows | `renderer.shadowMap.enabled = true` + light/mesh cast/receive flags |
| Multiple objects | More children under `content`; raycast still uses `intersectObject(content, true)` |

Keep parenting everything under `anchor.group` (or `content`) so marker tracking continues to drive pose.

---

## File map

| File | Three.js role |
|------|----------------|
| `frontend/index.html` | Import map for `three` + `three/addons/` |
| `frontend/js/webar.js` | All Three scene, materials, raycast, render loop |
| `frontend/js/app.js` | No Three imports; lazy-loads `webar.js` |
| `frontend/css/style.css` | Layers `<video>` under transparent `<canvas>` |

---

## Mental model (one sentence)

**MindAR finds the card and moves a Three.js group; Three.js owns everything you see and touch in 3D.**
