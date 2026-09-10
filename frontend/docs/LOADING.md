# How Assets Are Loaded Into AR Space

Step-by-step trace of what happens in `webar.js` when a GLB model or
gallery image is requested, from the TARGETS config through to the AR render.

Related: [ASSETS.md](./ASSETS.md) · [THREEJS.md](./THREEJS.md) · [INTERACTION.md](./INTERACTION.md)

---

## Overview: one pipeline, four content types

```
markerId (e.g. "boccia-logo")
        │
        ▼
resolveTarget(markerId)          → TARGETS entry (mindUrl, type, modelUrl / images / videoUrl)
        │
        ▼
new MindARThree({ imageTargetSrc: target.mindUrl, ... })   ← starts camera + CV
        │
        ▼
branch on target.type:
  "model"   → buildModelContent(opts)     ← GLTFLoader
  "gallery" → buildGalleryContent(urls)   ← TextureLoader per image
  "video"   → buildVideoContent(opts)     ← <video> + VideoTexture
  else      → buildCubeContent()          ← procedural Three.js geometry
        │
        ▼
scene.add(content)               ← NOT anchor.group; soft-follow in render loop
        │
        ▼
anchor.onTargetFound → content.visible = true
render loop → smooth pose lerp  → content tracks marker
```

---

## 1. GLB model (`type: "model"`)

### TARGETS config

```js
'boccia-logo': {
  mindUrl:  './assets/targets/shwaa-logo.mind',
  type:     'model',
  modelUrl: './assets/3D_motion/boccia_titanium_wrist_watch__animatable.glb',
  fitSize:  1.05,          // desired longest dimension in marker units
  scrollAnim: true,        // vertical drag scrubs GLB animation instead of auto-play
}
```

### `buildModelContent(opts)` — step by step

```
1. new THREE.Group()           ← content root (userData.mode = 'model')
2. add tiny ground disk        ← CircleGeometry r=0.06, opacity=0.06 (visual reference)
3. new GLTFLoader()
4. loader.load(modelUrl)       ← HTTP GET .glb; resolves with { scene, animations, ... }
5. hardenModelMaterials(model) ← depthTest=true, transparent=false on all meshes
6. meshBounds(contentRoot)     ← Box3 from Mesh only (skip bones/helpers that inflate bounds)
7. scale = fitSize / maxDim    ← uniform scale so longest axis == fitSize
8. model.scale.setScalar(s)
9. recompute bounds after scale
10. contentRoot.position = (-center.x, -box.min.y, -center.z)
    ← XZ centered; bottom of mesh sits at y=0
11. new THREE.Group() pivot; pivot.position.y = 0.02 (tiny lift)
12. pivot.add(contentRoot); group.add(pivot)
    ← pivot is what drag-rotate spins
13. resize ground disk to model footprint (clamped 0.03–0.07 radius)
14. add lights: key DirectionalLight, fill DirectionalLight, AmbientLight, HemisphereLight
15. if scrollAnim: add invisible BoxGeometry hitPad (larger than watch; easier to tap)
16. if gltf.animations:
    - new THREE.AnimationMixer(model)
    - scrollAnim=true  → LoopOnce, paused, time=0 (user scrubs manually)
    - scrollAnim=false → LoopRepeat, play() auto
17. return group
```

### What lands in the scene

```
scene
 └── content (Group)                 ← soft-followed each frame
       ├── groundBase (CircleMesh)   ← faint shadow disk
       ├── pivot (Group)             ← rotated by drag gestures
       │     ├── contentRoot (Group) ← position offset for centering
       │     │     └── gltf.scene   ← all GLB meshes, bones, rigs
       │     └── scrollHitPad       ← invisible tap target (scroll-anim only)
       ├── key light
       ├── fill light
       ├── AmbientLight
       └── HemisphereLight
```

---

## 2. Gallery images (`type: "gallery"`)

### TARGETS config

```js
gallery: {
  mindUrl: './assets/targets/gallery.mind',
  type:    'gallery',
  images:  ['./assets/gallery/01.jpg', ... '05.jpg'],
}
```

### `buildGalleryContent(imageUrls)` — step by step

```
1. new THREE.Group()              ← content root (userData.mode = 'gallery')
2. add black frame PlaneGeometry  ← 1.05 × 0.8, z=-0.01 (border)
3. create matA, matB (MeshBasicMaterial, transparent)
   photoA (matA, opacity 1) and photoB (matB, opacity 0) at z=0.02/0.025
   ← two planes for crossfade: front fades out, back fades in
4. add invisible hit PlaneGeometry ← 1.05 × 0.85, z=0.04 (tap target)
5. for each imageUrl:
     new THREE.TextureLoader().load(url)
     tex.colorSpace = SRGBColorSpace
     push to textures[]
6. matA.map = textures[0]; matA.needsUpdate = true
7. add text sprite "1 / N"
8. expose gallery.next() / gallery.prev() / gallery.update(dt)
   ← update(dt) drives crossfade lerp each frame
9. return group
```

### Crossfade on next/prev

- `show(index, dir)` puts next texture on the back plane, triggers `anim`
- render-loop calls `gallery.update(dt)` → easeInOutCubic → swap opacity + x drift
- After 0.42 s: back becomes front, index committed

---

## 3. Video / chroma-key (`type: "video"`)

### `buildVideoContent(opts)` — step by step

```
1. document.createElement('video'); video.src = videoUrl; muted; playsInline
2. video.load() → await 'loadeddata' (8s safety timeout)
3. play() + pause() immediately  ← iOS needs a muted-play unlock to allow seeking
4. measure videoWidth/videoHeight → aspect ratio for plane size
5. new THREE.VideoTexture(video) ← updates GPU texture each frame from <video> pixels
   tex.colorSpace = SRGBColorSpace; minFilter/magFilter = LinearFilter
6. new THREE.ShaderMaterial({ uniforms: { map, keyColor, similarity, smoothness, keyDark } })
   fragmentShader:
     chromaDist = distance(texColor.rgb, keyColor)   ← how far from green
     chromaAlpha = smoothstep(...)                    ← fade out green pixels
     darkAlpha = smoothstep(0, keyDark, luminance)    ← also fade very dark pixels
     if alpha < 0.04: discard                         ← punch transparent BG
7. new PlaneGeometry(planeWidth, planeH) with ShaderMaterial
8. invisible hit pad overlaid
9. return group
```

---

## 4. Placing content in AR space (soft-follow)

After any builder returns:

```js
scene.add(content);              // lives in scene root, NOT anchor.group
const anchor = mindarThree.addAnchor(0);

// render loop — runs every frame:
anchor.group.matrixWorld.decompose(targetPos, targetQuat, targetScale);

if (!poseSnapped) {
  smoothPos/Quat/Scale = targetPos/Quat/Scale;  // instant snap on first frame
  poseSnapped = true;
} else {
  const alpha = 1 - Math.exp(-POSE_SMOOTH_HZ * dt);   // 4 Hz models, 6 Hz others
  smoothPos.lerp(targetPos, alpha);
  smoothQuat.slerp(targetQuat, alpha);
}
content.position.copy(smoothPos);
content.quaternion.copy(smoothQuat);
content.scale.copy(smoothScale);
```

**Why not `anchor.group.add(content)`?**  
Hard-parenting gives raw jittery pose. The lerp adds a custom low-pass filter on
top of MindAR's internal OneEuroFilter, making the model appear stable.

When **pinned**, the loop skips the lerp entirely — last smoothed pose stays frozen.

---

## Quick reference

| Asset type | Loader | Key step |
|------------|--------|----------|
| `.glb` | `GLTFLoader` | `loader.load(url)` → Promise |
| Gallery `.jpg` | `THREE.TextureLoader` | `loadTexture(url)` → Promise per image |
| `.mp4` | native `<video>` element | `video.load()` + `VideoTexture` |
| `.mind` | MindAR internal | `imageTargetSrc` in `MindARThree` constructor |
