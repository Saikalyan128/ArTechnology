# WebAR Interaction Guide

How image-marker AR, gestures, pin, and multi-experience content work **as implemented now**.

Entry:

- `frontend/js/app.js` — boot / buttons -> `startWebAR(markerId)`
- `frontend/js/webar.js` — MindAR + Three.js + interactions

Related: [ASSETS.md](./ASSETS.md) · [THREEJS.md](./THREEJS.md) · [GALLERY_SLIDESHOW.md](./GALLERY_SLIDESHOW.md)

---

## Stack

| Layer | Library | Job |
|--------|---------|-----|
| Camera + marker | MindAR (MindARThree) | Camera, .mind match, anchor pose |
| 3D + input | Three.js | Content, raycast, drag/pinch, render |

---

## End-to-end flow

```
Boot (home button OR temporary auto boccia-logo)
  -> app.js imports webar.js -> startWebAR(markerId)
  -> camera permission + MindARThree({ imageTargetSrc, filters })
  -> build content by type (cube | gallery | model | video)
  -> scene.add(content)   // soft-follow, not hard-parented to anchor
  -> marker FOUND -> content.visible = true
  -> gestures while visible
```

---

## Marker tracking + soft-follow

MindAR updates `anchor.group` each frame. Content lives in `scene` and lerps toward that pose:

- MindAR filter: `filterMinCF: 0.0001`, `filterBeta: 0.001`
- Soft-follow: `alpha = 1 - exp(-POSE_SMOOTH_HZ * dt)`
  - models about 4 Hz; gallery/video about 6 Hz

Behavior:

- Unpinned + tracking -> content follows smoothed marker pose
- Pinned -> last pose frozen; object can stay visible if marker briefly lost
- Marker FOUND while pinned currently **clears pin** and resumes follow
- Unpin button / double-tap unpin releases pin

---

## Experiences and interaction setup

| type | Builder | Interaction |
|------|---------|-------------|
| cube | buildCubeContent | setupCubeInteraction (rotate, pinch/wheel zoom) |
| gallery | buildGalleryContent | setupGalleryInteraction (swipe/scroll slides) |
| model | buildModelContent | rotate/zoom + pin; Boccia uses scroll-anim scrub |
| video | buildVideoContent | setupVideoInteraction (vertical scrub) |

### Boccia scroll-anim (`setupModelScrollAnimInteraction`)

- Vertical drag / wheel -> scrub GLB animation
- Horizontal drag -> rotate pivot
- Pinch -> zoom
- Long-press about 600ms -> pin
- Double-tap while pinned -> unpin

### Cube / Seiko model (`setupCubeInteraction`)

- Drag -> rotate pivot
- Pinch / wheel -> zoom
- Models: long-press pin; double-tap unpin

---

## Shared building blocks

### Hit test

`hitTest(root, camera, hitRoot, x, y)`: NDC + Raycaster + recursive intersect.

Ignores:

- content not visible
- taps on `.ar-overlay`, Unpin, Website, Contact

### Pin (models)

- `content.userData.pinned = true` stops soft-follow
- Unpin FAB shown; double-tap or button unpins
- No world-walk lock in current code — pin freezes **screen/camera-space last pose** until unpinned

---

## AR UI (current temporary)

Top: Website (`https://google.com` placeholder) and Contact (`mailto:shwaasfx@gmail.com`).

Bottom: `#hint`. Floating Unpin FAB when pinned.

Home Experiences UI still in HTML but often skipped by auto-start.

---

## Lifecycle

| Step | Function |
|------|----------|
| Start | startWebAR(markerId) |
| Stop | stopWebAR() dispose listeners, stop loop, mindarThree.stop() |

---

## Requirements

- HTTPS or localhost
- Compiled .mind targets
- Import map: three, three/addons/, mindar-image-three
