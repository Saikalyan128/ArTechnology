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

## Building 3D content (by experience type)

`startWebAR` branches on `target.type`:

| type | Builder | Main Three.js pieces |
|------|---------|----------------------|
| cube | `buildCubeContent()` | Plane + box + pivot + lights |
| gallery | `buildGalleryContent(images)` | Dual photo planes, frame, hit pad, textures |
| model | `buildModelContent(...)` | `GLTFLoader` scene, pivot, lights, ground disk, optional AnimationMixer |
| video | `buildVideoContent(...)` | VideoTexture plane + chroma shader + hit pad |

### Typical model hierarchy

```
scene                          (from MindAR)
 ├── anchor.group              (MindAR marker pose)
 └── content (Group)           (soft-followed in scene — NOT hard child of anchor)
       ├── groundBase (small disk)
       ├── pivot
       │     └── contentRoot → gltf.scene
       └── lights
```

Cube/gallery/video use the same soft-follow idea.

### Pivot pattern

Rotation/zoom targets `content.userData.pivot`. Drag flag lives on `content.userData.cube` (real mesh for cube; proxy for models).

### Materials / loaders

- Cube: Basic plane + Standard box
- Models: GLB via `GLTFLoader`; materials hardened for AR
- Gallery: Basic materials + `TextureLoader`
- Video: chroma ShaderMaterial on `VideoTexture`

---

## Soft-follow anchoring (current)

```js
const anchor = mindarThree.addAnchor(0);
scene.add(content);           // not anchor.group.add(content)
content.visible = false;

// each frame while tracking && !pinned:
anchor.group.matrixWorld.decompose(targetPos, targetQuat, targetScale);
// frame-rate independent lerp/slerp with POSE_SMOOTH_HZ
content.position/quaternion/scale = smoothed values
```

MindAR owns marker pose. Three.js owns displayed pose with extra damping. Pin freezes the last pose.

Found/lost toggle visibility (pinned content can stay visible on lost).

---

## Render loop

```js
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  // soft-follow when tracking and not pinned
  // mixer.update(dt) for auto-play models
  // gallery.update(dt) for crossfade
  // videoTex.needsUpdate when needed
  renderer.render(scene, camera);
});
```

No global idle spin. Motion comes from gestures, GLB anim/scrub, or gallery fades.

On stop: `setAnimationLoop(null)`, dispose interaction, `mindarThree.stop()`.

---

## Interaction APIs (Three.js)

| API | Use |
|-----|-----|
| `Raycaster` / `Vector2` | Hit test (`hitTest` helper) |
| `pivot.rotation` / `pivot.scale` | Drag rotate + pinch zoom |
| `AnimationMixer` | Model clips (auto-play or scrub) |
| `VideoTexture` | Motion experience |

Details: [INTERACTION.md](./INTERACTION.md).

---

## Coordinate system

- Three.js: **Y-up**, right-handed.
- Marker face ≈ anchor local XY; models sit bottom-centered slightly above y=0.
- Marker-local units: target width roughly size `1`; `fitSize` scales GLBs relative to that.

---

## What Three.js is *not* doing here

| Not used | Why |
|----------|-----|
| WebXR / ARButton | Image markers via MindAR CV |
| OrbitControls | Camera owned by MindAR |
| Manual main PerspectiveCamera setup | Provided by MindARThree |

`GLTFLoader` **is** used for watch / Boccia.

---

## File map

| File | Three.js role |
|------|----------------|
| `frontend/index.html` | Import map for three + three/addons/ |
| `frontend/js/webar.js` | Content, loaders, raycast, soft-follow, render loop |
| `frontend/js/app.js` | No Three; lazy-loads webar.js |
| `frontend/css/style.css` | Video under transparent canvas |

---

## Mental model

**MindAR finds the marker and updates an anchor matrix; Three.js soft-follows that pose and owns everything you see and touch in 3D.**
