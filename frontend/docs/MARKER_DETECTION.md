# Marker Detection — How It Works

How a physical image (the SHWAA logo) is recognised by the camera and
turned into an AR anchor in this project.

Related: [ASSETS.md](./ASSETS.md) · [LOADING.md](./LOADING.md) · [INTERACTION.md](./INTERACTION.md)

---

## The two files behind every marker

| File | Purpose | Used at |
|------|---------|---------|
| `logo.png` | Original source image — what you print or show on screen | Compile time only |
| `logo.mind` | Pre-compiled binary — stores extracted feature points | Runtime (loaded by MindAR) |

The `.png` is **never** loaded by the tracking engine at runtime.
Only the `.mind` is fetched and used.

---

## What is a `.mind` file?

It is a binary file produced by the **MindAR Compiler** (a one-time offline step).

The compiler scans your image and extracts **feature points** — distinctive
corners, edges, and texture patches that the camera can reliably re-find even
when the image is viewed at an angle, under different lighting, or partially obscured.

Those feature descriptors are packed into the `.mind` format in a way that
MindAR's runtime can match against live camera frames very quickly.

```
logo.png
      │
      ▼  MindAR Compiler  (https://hiukim.github.io/mind-ar-js-doc/quick-start/compile)
logo.mind   ← compact feature-point data (not a photo)
```

All compiled markers in this project live in:

```
frontend/assets/targets/
  card.mind       card.png       ← demo cube
  gallery.mind    gallery.png    ← gallery + motion video
  watch.mind      watch.png      ← Seiko GLB
  logo.mind       logo.png       ← SHWAA logo → Boccia watch (active marker)
```

---

## Runtime detection — step by step

### 1. Load the `.mind` into MindAR

```js
const mindarThree = new MindARThree({
  container: root,
  imageTargetSrc: './assets/targets/logo.mind',  // HTTP GET on start
  filterMinCF:  0.0001,   // One-Euro filter — lower = less jitter, more lag
  filterBeta:   0.001,
  warmupTolerance: 8,     // frames needed before "found" fires
  missTolerance: 15,      // frames lost before "lost" fires
});
```

MindAR fetches the `.mind` file and keeps the feature data in memory.

### 2. Open the camera

```js
await mindarThree.start();
```

- Calls `getUserMedia` → asks camera permission
- Creates a live `<video>` stream
- Starts the CV loop running on every camera frame

### 3. CV loop (every frame, inside MindAR)

MindAR runs entirely in the browser (WebAssembly + JS — no server):

```
Camera frame pixels
      │
      ▼
Extract keypoints from current frame
      │
      ▼
Match against feature points stored in .mind
      │
      ▼
If enough matches → compute homography (position + rotation of marker)
      │
      ▼
Apply One-Euro filter (smooths pose jitter)
      │
      ▼
Write result into anchor.group.matrixWorld  ← Three.js Group
```

### 4. Found / Lost callbacks

```js
const anchor = mindarThree.addAnchor(0);
// 0 = first image inside this .mind file
// A single .mind can hold multiple images: addAnchor(0), addAnchor(1), …

anchor.onTargetFound = function () {
  tracking = true;
  content.visible = true;    // show the AR object
};

anchor.onTargetLost = function () {
  tracking = false;
  content.visible = false;   // hide (unless pinned)
};
```

`warmupTolerance: 8` — marker must be seen for 8 consecutive frames before
`onTargetFound` fires (avoids false positives).

`missTolerance: 15` — marker must be missing for 15 consecutive frames before
`onTargetLost` fires (avoids flicker when briefly obscured).

### 5. Use the pose every frame

Once found, `anchor.group` holds the marker's real-world position and rotation.
The render loop reads it and soft-follows with a damping lerp:

```js
anchor.group.matrixWorld.decompose(targetPos, targetQuat, targetScale);

// Frame-rate independent damping (4 Hz for models, 6 Hz for gallery/video)
const alpha = 1 - Math.exp(-POSE_SMOOTH_HZ * dt);
smoothPos.lerp(targetPos, alpha);
smoothQuat.slerp(targetQuat, alpha);

content.position.copy(smoothPos);
content.quaternion.copy(smoothQuat);
```

This extra lerp on top of MindAR's internal filter is what keeps the watch
from shaking on rough surfaces or hand movement.

---

## How pointing works in practice

"Pointing" means physically holding your phone so the back camera can see the printed or on-screen SHWAA logo. Here is what happens at each stage:

### What you do
1. Open the AR link on your phone (HTTPS required — camera access needs a secure context).
2. The app loads `logo.mind` in the background and opens the rear camera.
3. Hold the phone so the **SHWAA logo fills roughly 20–60% of the camera view**.
4. Keep the phone **reasonably steady** for ~0.3 s (8 frames at 30 fps = `warmupTolerance`).
5. The 3D watch appears on top of the logo. You can then move the phone freely.

### What the camera angle and distance affect

| Situation | Effect |
|-----------|--------|
| Too far away | Logo too small → fewer keypoints match → detection fails |
| Too close | Logo fills too much of frame → edge features cut off → detection fails |
| Steep angle (>60°) | Perspective distortion too extreme → match confidence drops |
| Good angle | Straight-on ±45° works reliably |
| Poor lighting / glare | Keypoint quality drops → slower or no detection |
| Partially covered logo | MindAR still tracks if core feature area is visible |

### Sweet spot
- Distance: **20–50 cm** from the logo
- Angle: **within ~45° of straight-on**
- Lighting: bright, even, no direct glare on the logo surface

### What triggers the 3D object appearing

`warmupTolerance: 8` — MindAR must match the logo in **8 consecutive frames** before firing `onTargetFound`. This prevents a quick accidental glance from triggering the object.

```js
anchor.onTargetFound = function () {
  tracking = true;
  content.visible = true;   // 3D watch becomes visible
};
```

### What makes the object disappear

`missTolerance: 15` — the logo must be **missing for 15 consecutive frames** (~0.5 s) before `onTargetLost` fires and the object hides. A brief hand movement or blink does not hide it.

```js
anchor.onTargetLost = function () {
  tracking = false;
  content.visible = false;  // hidden (unless pinned)
};
```

### Pinning (keep object without pointing)

Long-press on the 3D object to **pin** it. Once pinned:
- The object stays frozen at its last pose in world space
- You can move the camera away from the logo entirely
- Point back at the logo to un-pin and resume tracking

---

## Full flow (one diagram)

```
logo.png
    │ compile once (MindAR Compiler tool)
    ▼
logo.mind  ──HTTP GET──▶  MindARThree({ imageTargetSrc })
                                   │
                              mindarThree.start()
                                   │
                              camera opens (getUserMedia)
                                   │
       You point phone at logo ──▶ CV loop (every frame)
                               ┌───────────────────────────┐
                               │  keypoint extraction       │
                               │  feature matching vs .mind │
                               │  homography → pose         │
                               │  One-Euro filter           │
                               └───────────────────────────┘
                                   │ 8 frames matched
                           anchor.onTargetFound
                                   │
                           anchor.group.matrixWorld = pose
                                   │
                           render loop → lerp → 3D watch appears on logo
```

---

## Quick reference

| Question | Answer |
|----------|--------|
| What detects the marker? | MindAR CV engine (runs in browser, no server) |
| What stores the marker data? | `logo.mind` binary (feature points, not a photo) |
| Is the `.png` used at runtime? | No — print/show it, but tracking ignores it |
| How far should I hold the phone? | 20–50 cm, within ~45° of straight-on |
| How long to hold still? | ~0.3 s (8 frames) before object appears |
| How long before object disappears? | ~0.5 s (15 frames) after logo leaves view |
| Can one `.mind` hold multiple images? | Yes — index with `addAnchor(0)`, `addAnchor(1)` |
| What smooths the jitter? | MindAR One-Euro filter + our render-loop lerp |
| Where to compile a new marker? | https://hiukim.github.io/mind-ar-js-doc/quick-start/compile |
