# How Assets Are Consumed

How marker and 3D-related assets are chosen, loaded, and used in this MVP.

Related:

- [INTERACTION.md](./INTERACTION.md) — touch + marker found/lost  
- [THREEJS.md](./THREEJS.md) — Three.js scene and render  

---

## What “asset” means here

Today there are two layers:

| Kind | Current MVP | Role |
|------|-------------|------|
| **Image target** | `card.mind` (+ source `card.png`) | What the camera must recognize |
| **AR content** | Procedural Three.js cube/plane | What appears on the marker (not a file yet) |
| **Libraries** | Three.js / MindAR via CDN | Runtime engines (not scene assets) |

There is **no FastAPI / Firestore / GLB pipeline yet**. Content is built in code; only the **marker target file** is loaded from disk.

---

## On-disk layout

```
frontend/
├── assets/
│   └── targets/
│       ├── card.mind    ← compiled MindAR target (REQUIRED at runtime)
│       └── card.png     ← source/preview image (UI + compile input)
├── js/
│   ├── app.js           ← resolves markerId → starts WebAR
│   └── webar.js         ← loads .mind into MindARThree
└── index.html           ← shows card.png as demo preview
```

| File | Consumed by | How |
|------|-------------|-----|
| `card.mind` | MindAR (`imageTargetSrc`) | Fetched over HTTP when AR starts; feature points for tracking |
| `card.png` | Home UI only | `<img>` preview so you know what to point the camera at |
| (no `.glb`) | — | 3D is `BoxGeometry` / `PlaneGeometry` in `buildContent()` |

`card.png` is **not** used for tracking at runtime. Tracking uses **only** `.mind`.

---

## Selection path: markerId → asset URL

### 1. User / QR supplies an id

```
Start demo WebAR  →  markerId = "demo"
or QR / ?markerId=demo  →  same
or typed id in the input
```

`app.js`:

```js
await api.startWebAR(id);   // e.g. startWebAR('demo')
```

### 2. Map id → target config

In `webar.js`:

```js
const TARGETS = {
  demo: {
    mindUrl: './assets/targets/card.mind',
  },
};

function resolveTarget(markerId) {
  return TARGETS[markerId] || TARGETS.demo;  // unknown id → demo fallback
}
```

| Input `markerId` | Result |
|------------------|--------|
| `'demo'` | `TARGETS.demo` → `card.mind` |
| anything else | same fallback until you add more keys |

This map is the MVP stand-in for a future API like  
`GET /api/scenes/{markerId}` → `{ imageTargetUrl, models: [...] }`.

### 3. Pass URL into MindAR

```js
const target = resolveTarget(id);

mindarThree = new MindARThree({
  container: root,
  imageTargetSrc: target.mindUrl,  // './assets/targets/card.mind'
});
```

MindAR then:

1. **HTTP GETs** `card.mind` from the static server  
2. Parses feature-point data inside the binary/compiled file  
3. Runs CV on each camera frame against those features  
4. When matched → updates `anchor.group` pose  

```js
const anchor = mindarThree.addAnchor(0);
// 0 = first (and only) image inside this .mind file
```

---

## Asset consumption flowchart

```
┌─────────────┐     markerId      ┌──────────────┐
│ QR / demo / │ ───────────────► │ resolveTarget │
│ typed input │                   │  (TARGETS{})  │
└─────────────┘                   └──────┬───────┘
                                         │ mindUrl
                                         ▼
                              ┌─────────────────────┐
                              │ MindARThree({        │
                              │   imageTargetSrc })  │
                              └──────────┬──────────┘
                                         │ fetch .mind
                                         ▼
                              ┌─────────────────────┐
                              │ Static file server   │
                              │ assets/targets/      │
                              │ card.mind            │
                              └──────────┬──────────┘
                                         │ feature data
                                         ▼
                              ┌─────────────────────┐
                              │ CV tracker + camera  │
                              │ addAnchor(0) pose    │
                              └──────────┬──────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │ Three.js content     │
                              │ (cube built in code) │
                              │ parented to anchor   │
                              └─────────────────────┘
```

---

## Image target assets (deep dive)

### Source image (`card.png`)

- Natural photo/graphic with **enough corners/detail** to track.  
- Used to **compile** the `.mind` file offline.  
- Shown on the landing page as a preview.  
- **Not** loaded by MindAR at runtime.

### Compiled target (`card.mind`)

- Output of the [MindAR image compiler](https://hiukim.github.io/mind-ar-js-doc/tools/compile).  
- Contains extracted feature points (compact, preprocessed).  
- Loaded once at `MindARThree` start via `imageTargetSrc`.  
- One `.mind` can store **multiple** images → anchors `0`, `1`, `2`, …

### Compile workflow (when you change the marker)

1. Choose a high-contrast, detailed PNG.  
2. Drop into MindAR compiler → download `targets.mind`.  
3. Replace `frontend/assets/targets/card.mind` (and update `card.png` preview).  
4. No code change if `TARGETS.demo.mindUrl` path stays the same.

---

## 3D “assets” today (in-code, not files)

`buildContent()` does **not** load a model file. It constructs:

| Object | Three.js construction | Asset file? |
|--------|----------------------|-------------|
| Card plane | `PlaneGeometry` + `MeshBasicMaterial` | No |
| Cube | `BoxGeometry` + `MeshStandardMaterial` | No |
| Lights | `DirectionalLight`, `AmbientLight` | No |

They are parented to MindAR’s anchor after the `.mind` is active:

```js
const content = buildContent();
anchor.group.add(content);
```

So:

- **Consumed from network:** `.mind` only  
- **Consumed from GPU/code:** cube geometry/materials every session  

### Future file-based 3D (not implemented)

When you add GLBs (e.g. from Firebase Storage / API):

```js
// sketch only
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const gltf = await new GLTFLoader().loadAsync(modelUrlFromApi);
anchor.group.add(gltf.scene);
```

Then `markerId` would resolve to something like:

```json
{
  "mindUrl": "https://.../card.mind",
  "models": [{ "url": "https://.../car.glb", "scale": 1, "position": [0,0,0] }]
}
```

That matches the Readme vision; the **consumption pattern stays the same**: resolve id → URLs → load → attach to anchor.

---

## CDN / runtime libraries (not scene assets)

Loaded by the page, not by `TARGETS`:

| URL / package | Consumed when | Purpose |
|---------------|---------------|---------|
| `three@0.160.1` | First `import` of `webar.js` | 3D engine |
| `three/addons/` | MindAR internal imports | e.g. CSS3D helper |
| `mind-ar@1.2.5` | Same | Image tracking + Three bridge |
| `html5-qrcode` | Page load | QR scanner on home screen |

Lazy path: `app.js` only `import('./webar.js')` after the user taps Start, so Three/MindAR download starts on demand.

---

## Serving assets

Dev: static server (`npx serve` on `frontend/`).

- Browser requests: `GET /assets/targets/card.mind`  
- Must be **same origin** or CORS-enabled if moved to another host (Firebase Storage, CDN).  
- Phone testing needs **HTTPS** (camera); tunnel still serves these static files as-is.

---

## Adding a second marker/scene (checklist)

1. Compile new image → e.g. `poster.mind` (+ `poster.png`).  
2. Put files under `assets/targets/`.  
3. Register in `TARGETS`:

```js
const TARGETS = {
  demo: { mindUrl: './assets/targets/card.mind' },
  poster: { mindUrl: './assets/targets/poster.mind' },
};
```

4. Open with `markerId=poster` (QR or query or typed id).  
5. Optional: branch `buildContent(markerId)` or load different GLB per id.

---

## Summary

| Question | Answer in this MVP |
|----------|-------------------|
| What file is required for tracking? | `*.mind` via `imageTargetSrc` |
| Who picks the file? | `markerId` → `TARGETS` → `mindUrl` |
| Who loads it? | MindAR (`MindARThree`) over HTTP |
| What appears on the marker? | Three.js objects built in code, parented to `addAnchor(0)` |
| Where do GLB/API assets fit later? | Same `markerId` resolution; extra URLs loaded with `GLTFLoader` onto the same anchor |
