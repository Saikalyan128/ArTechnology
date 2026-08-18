# WebAR Interaction Guide

How image-marker AR and cube interaction work in this project.

## Stack

| Layer | Library | Job |
|--------|---------|-----|
| Camera + marker tracking | **MindAR** (`MindARThree`) | Opens camera, finds `.mind` target, updates pose |
| 3D scene + interaction | **Three.js** | Cube, lights, raycasting, drag-rotate, render loop |

Entry files:

- `frontend/js/app.js` — UI, QR/demo button → calls `startWebAR()`
- `frontend/js/webar.js` — MindAR + Three.js scene and interaction

---

## End-to-end flow

```
User taps "Start demo WebAR"
        │
        ▼
app.js → import('./webar.js') → startWebAR('demo')
        │
        ▼
Camera permission (getUserMedia preflight)
        │
        ▼
new MindARThree({ container, imageTargetSrc: card.mind })
        │
        ▼
mindarThree.start()  → live <video> + WebGL canvas
        │
        ▼
User points camera at printed / on-screen card image
        │
        ▼
anchor.onTargetFound → content.visible = true
        │
        ▼
User touches cube → drag → pivot rotates
```

---

## 1. Marker tracking (MindAR)

```js
mindarThree = new MindARThree({
  container: root,                    // #ar-root
  imageTargetSrc: './assets/targets/card.mind',
  uiLoading: 'no',
  uiScanning: 'no',
  uiError: 'no',
});

const { renderer, scene, camera } = mindarThree;
const anchor = mindarThree.addAnchor(0);  // target index 0
```

- `card.mind` is a **compiled** target (from MindAR compiler + `card.png`).
- `addAnchor(0)` creates a Three.js group whose world matrix follows the marker.
- When the marker is seen: `anchor.onTargetFound`
- When lost: `anchor.onTargetLost`

Content is parented to the anchor:

```js
const content = buildContent();
content.visible = false;
anchor.group.add(content);
```

So when the card moves in the real world, the 3D content stays stuck on it.

---

## 2. 3D content (Three.js)

`buildContent()` creates:

1. **Semi-transparent plane** — same aspect as the card; easier to tap  
2. **Orange cube** — main interactive object  
3. **Pivot group** — rotation parent so the cube spins around its center  
4. **Lights** — directional + ambient  

Hierarchy:

```
anchor.group          ← MindAR moves this with the marker
  └── content (Group)
        ├── plane
        ├── pivot (Group)     ← we rotate THIS on drag
        │     └── cube
        └── lights
```

Why a pivot?

- Cube is offset above the card.
- If we rotate the cube alone, it orbits oddly.
- Pivot sits at the cube center; cube is at local `(0,0,0)` under the pivot → clean spin.

---

## 3. Touch / drag interaction

Implemented in `setupCubeInteraction()` in `webar.js`.

### When it works

Only while the marker is found (`content.visible === true`).  
If the marker is lost, pointer-down is ignored and drag ends.

### Pointer events

| Event | Target | Action |
|--------|--------|--------|
| `pointerdown` | `#ar-root` | Raycast hit? start drag |
| `pointermove` | `window` | Apply rotation from delta |
| `pointerup` / `pointercancel` | `window` | End drag |

`touch-action: none` on `#ar-root` prevents the browser from scrolling while dragging.

Video/canvas use `pointer-events: none` in CSS so touches hit `#ar-root` (our handler), not the media elements.

### Hit testing (raycast)

```js
// Screen pixel → normalized device coords (-1 … +1)
pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

raycaster.setFromCamera(pointerNdc, camera);
const hits = raycaster.intersectObject(content, true);
```

- Casts a ray from the Three.js camera through the finger position.
- Hits cube **or** base plane (`true` = recursive).
- No hit → drag does not start (tap empty camera = ignore).

### Rotation mapping

```js
pivot.rotation.y += dx * ROTATE_SPEED;  // horizontal drag → yaw
pivot.rotation.x += dy * ROTATE_SPEED;  // vertical drag → pitch
pivot.rotation.x = clamp(pivot.rotation.x, -PI/2, +PI/2);
```

| User gesture | Effect |
|--------------|--------|
| Drag right / left | Cube yaws |
| Drag up / down | Cube tips (clamped so it doesn’t flip) |
| Release | Idle spin resumes |

`ROTATE_SPEED = 0.012` (radians per pixel). Raise for faster rotation.

### Idle spin vs drag

Render loop:

```js
if (content.visible && !cube.userData.dragging) {
  pivot.rotation.y += 0.01;  // slow auto-spin
}
renderer.render(scene, camera);
```

- While dragging: `cube.userData.dragging = true` → idle spin paused.  
- On release: flag cleared → idle spin continues from the new orientation.

---

## 4. Camera + canvas layers

MindAR injects into `#ar-root`:

1. `<video>` — live camera (underneath)  
2. `<canvas>` — Three.js WebGL (on top, transparent)

```js
renderer.setClearColor(0x000000, 0);  // transparent GL clear
```

CSS: video `z-index: 0`, canvas `z-index: 1`, both full-screen.  
You see the real world through the transparent canvas, with the cube drawn on the marker.

---

## 5. Lifecycle

| Step | Function |
|------|----------|
| Start | `startWebAR(markerId)` |
| Stop / back | `stopWebAR()` → `disposeInteraction()`, stop render loop, `mindarThree.stop()` |

Always remove listeners on stop to avoid leaks if the user restarts AR.

---

## 6. Extending interaction later

| Idea | Where to change |
|------|------------------|
| Tap to play animation | In `onPointerDown` after hit, without requiring drag |
| Scale with pinch | Extra touch handlers + `pivot.scale` |
| Load GLB instead of cube | Replace mesh in `buildContent()`; keep pivot + raycast on model root |
| Multiple markers | `addAnchor(1)`, more entries in `TARGETS` + multi-target `.mind` |
| Info panel on tap | Raycast hit → show HTML overlay |

---

## Requirements

- **HTTPS** or `localhost` (camera API)
- Image target: compile PNG → `.mind` via [MindAR compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile)
- Three.js import map must include `three` **and** `three/addons/` (MindAR internal deps)
