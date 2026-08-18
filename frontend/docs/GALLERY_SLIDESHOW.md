# Image Slideshow (Gallery) Logic

How the **gallery** experience works: second marker → photo plane on marker →
swipe/scroll changes images.

Code: `frontend/js/webar.js`  
Related: [ASSETS.md](./ASSETS.md), [THREEJS.md](./THREEJS.md), [INTERACTION.md](./INTERACTION.md)

---

## Goal

When the user opens **Gallery** and points the camera at the **gallery marker**
(raccoon card), a framed photo appears on the marker. Swiping or scrolling on
that photo cycles through a list of images (slideshow).

This is **not** a 2D HTML carousel. It is a **Three.js textured plane** glued
to a MindAR image anchor, with pointer/wheel input swapping the texture.

---

## High-level flow

```
UI: enterWebAR('gallery')
        │
        ▼
resolveTarget('gallery')
  → mindUrl: gallery.mind
  → type: 'gallery'
  → images: [01.jpg … 05.jpg]
        │
        ▼
MindARThree({ imageTargetSrc: gallery.mind })
        │
        ▼
buildGalleryContent(images)
  → load each URL as THREE.Texture
  → photo plane uses textures[0]
  → expose gallery.next() / gallery.prev()
        │
        ▼
anchor.group.add(content)   // sticks to marker
setupGalleryInteraction(...)
        │
        ▼
Marker FOUND → content.visible = true
User swipe/scroll on photo → next/prev texture
```

---

## 1. Experience config (`TARGETS.gallery`)

```js
gallery: {
  mindUrl: './assets/targets/gallery.mind',  // different marker than cube demo
  type: 'gallery',                           // selects content + interaction
  label: 'raccoon (gallery)',
  images: [
    './assets/gallery/01.jpg',
    // ... 05.jpg
  ],
},
```

| Field | Role |
|--------|------|
| `mindUrl` | Compiled marker for tracking (separate from `card.mind`) |
| `type` | Branch in `startWebAR`: build gallery vs cube |
| `images` | Ordered slideshow URLs (static files today) |

Entry points:

- Button → `enterWebAR('gallery')`
- Deep link → `?markerId=gallery`
- Typed id → `gallery`

---

## 2. Building the slideshow object (`buildGalleryContent`)

Creates a small Three.js hierarchy parented later to `anchor.group`.

### Meshes

| Mesh | Purpose |
|------|---------|
| **frame** | Dark plane behind the photo (border look) |
| **photoA / photoB** | Dual photo planes for crossfade transitions |
| **hit** | Invisible larger plane for easier raycast / swipe target |
| **label** | Canvas texture sprite showing `1 / 5`, `2 / 5`, … |

Rough stack (local Z toward camera):

```
frame   (z = -0.01)
photoA  (z =  0.02)  ← crossfade pair
photoB  (z =  0.025)
hit     (z =  0.04)  ← invisible, catches pointers
label   (below photo)
```

### Loading images → textures

```js
const textures = [];
for each url in imageUrls:
  textures.push(await loadTexture(url));  // THREE.TextureLoader

matA.map = textures[0];
matB.map = textures[0];
```

- Each file becomes a `THREE.Texture` (SRGB color space).
- Two planes crossfade on swipe (no hard cut).
- Failed loads are skipped; if none load → throw error.

### Current slide index + smooth crossfade (`show(i)`)

Two stacked photo planes (`photoA` / `photoB`) crossfade instead of a hard texture swap:

```js
// front plane: current image (opacity 1 → 0)
// back plane:  next image    (opacity 0 → 1)
// + slight horizontal drift (SLIDE_X) during ~0.42s easeInOutCubic
gallery.update(dt)  // called each frame from the AR render loop
```

Public API on the content group:

```js
group.userData.gallery = {
  next: () => show(index + 1, +1),
  prev: () => show(index - 1, -1),
  update: (dt) => { /* advance fade */ },
};
group.userData.hitRoot = hit;  // raycast target for gestures
group.userData.mode = 'gallery';
```

**Core slideshow idea:** keep an integer `index`; on next/prev start a dual-plane
opacity/position tween, then commit `index` when the fade finishes.

---

## 3. Wiring to the marker (`startWebAR`)

```js
if (target.type === 'gallery') {
  content = await buildGalleryContent(target.images || []);
} else {
  content = buildCubeContent();
}
content.visible = false;

const anchor = mindarThree.addAnchor(0);
anchor.group.add(content);

if (content.userData.mode === 'gallery') {
  disposeInteraction = setupGalleryInteraction(root, camera, content);
}
```

- Content is **hidden** until MindAR finds the marker.
- `onTargetFound` → `content.visible = true` + hint to swipe.
- `onTargetLost` → hide again (gestures ignore when not visible).

So the slideshow **only exists in AR space while the gallery marker is tracked**.

---

## 4. Gesture logic (`setupGalleryInteraction`)

### Step A — only when photo is on screen

```js
if (!content.visible) return;
if (!hitTest(root, camera, content.userData.hitRoot, x, y)) return;
```

`hitTest` uses `THREE.Raycaster` from the finger through the camera into the
invisible **hit** plane. Swipes on empty background do nothing.

### Step B — pointer swipe (mobile + mouse drag)

| Event | Action |
|--------|--------|
| `pointerdown` on hit | Remember start `(sx, sy)` |
| `pointermove` | Track last `(lx, ly)` |
| `pointerup` | Compute `dx`, `dy`; if large enough → next/prev |

Threshold: `SWIPE = 40` pixels.

```text
|dx| >= |dy| and |dx| >= 40  → horizontal swipe
  dx < 0  → next   (finger moved left)
  dx > 0  → prev

else |dy| >= 40               → vertical "scroll" swipe
  dy < 0  → next   (finger moved up)
  dy > 0  → prev
```

So both **horizontal carousel** and **vertical scroll-like** gestures change slides.

### Step C — wheel / trackpad (desktop)

```js
root.addEventListener('wheel', onWheel);
// deltaY/deltaX > 8  → next
// deltaY/deltaX < -8 → prev
```

Same hit-test: cursor must be over the photo plane.

### Cleanup

`setupGalleryInteraction` returns a disposer that removes all listeners when
AR stops (avoids leaks / double-binding).

---

## 5. Why this design

| Choice | Reason |
|--------|--------|
| One plane + swap texture | Cheap, simple, good on mobile |
| Preload all textures | Fast slide change (no wait per swipe) |
| Separate hit mesh | Bigger touch target than visible photo |
| Wrap index | Infinite loop slideshow |
| Second `.mind` marker | Cube and gallery don’t share the same printed image |
| Raycast before swipe | Don’t steal gestures from UI (back button, etc.) |

---

## 6. Assets involved

```
assets/targets/gallery.mind   ← track this printed image
assets/targets/gallery.png    ← preview / printout for users
assets/gallery/01.jpg … 05.jpg ← slideshow frames
```

To add more slides: put files under `assets/gallery/` and append paths to
`TARGETS.gallery.images`.

To use your own marker: compile a new image → replace `gallery.mind` (+ preview PNG).

---

## 7. Extending later

| Feature | Approach |
|---------|----------|
| Smooth slide animation | Two planes; lerp positions, then swap |
| Auto-play | `setInterval` → `gallery.next()` while found |
| Images from API | Fill `images: []` from `GET /api/scenes/gallery` |
| Ken Burns / fade | Tween material opacity or UV offset |
| Tap dots | Raycast UI meshes for jump-to-index |

---

## One-sentence summary

**Gallery mode loads a list of textures, sticks a photo plane on a dedicated MindAR marker, and on swipe/scroll over that plane advances `index` and assigns `material.map = textures[index]`.**
