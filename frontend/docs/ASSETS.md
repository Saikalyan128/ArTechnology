# How Assets Are Consumed

How marker and content assets are chosen, loaded, and used in the current frontend.

Related: [INTERACTION.md](./INTERACTION.md) · [THREEJS.md](./THREEJS.md) · [GALLERY_SLIDESHOW.md](./GALLERY_SLIDESHOW.md)

---

## Asset kinds (current)

| Kind | Examples | Role |
|------|----------|------|
| Image targets | targets/*.mind + *.png | Camera tracking |
| 3D models | 3D/*.glb, 3D_motion/*.glb | Watches on marker |
| Gallery images | gallery/01.jpg … 05.jpg | Slideshow textures |
| Video | 3D_motion/*.mp4 | Scroll-scrub chroma plane |
| QR helper | qr/webar-tunnel.* | Phone tunnel link |
| Libraries | three / mind-ar CDN | Runtime |

Only `.mind` is used for tracking. PNGs are previews and compiler inputs.

---

## Layout

```
frontend/assets/
  targets/   card, gallery, watch, boccia, shwaa-logo (.mind + .png)
  gallery/   01.jpg … 05.jpg
  3D/        seiko_watch.glb
  3D_motion/ boccia GLB + motion mp4
  qr/        webar-tunnel.png / .txt
frontend/js/app.js      boot UI -> startWebAR(markerId)
frontend/js/webar.js    TARGETS, loaders, AR loop
```

---

## markerId -> TARGETS (webar.js)

| markerId | type | mind | content |
|----------|------|------|---------|
| demo | cube | card.mind | procedural cube |
| gallery | gallery | gallery.mind | photo slideshow |
| watch | model | watch.mind | seiko_watch.glb |
| boccia | model | boccia.mind | Boccia GLB, scrollAnim |
| boccia-logo | model | shwaa-logo.mind | same Boccia GLB |
| motion | video | gallery.mind | chroma-key mp4 |

`resolveTarget(id)` falls back to `demo`.

---

## Boot path

1. Home button, `?markerId=`, or temporary default supplies id.
2. `app.js` dynamic-imports `webar.js` and calls `startWebAR(id)`.
3. `resolveTarget` returns mindUrl + type fields.
4. `MindARThree({ imageTargetSrc, filterMinCF, filterBeta, ... })`.
5. Content by type:

| type | builder |
|------|---------|
| gallery | buildGalleryContent(images) |
| model | buildModelContent + GLTFLoader |
| video | buildVideoContent |
| else | buildCubeContent |

6. `scene.add(content)` and soft-follow smoothed `anchor.group` pose (not hard-parented).
7. Found => visible; lost => hide unless pinned.

### Temporary auto-start

`app.js` uses `markerId` query or defaults to `boccia-logo` (skips home). Remove the default to restore experiences-first boot.

### AR overlay (temporary)

Website + Contact us links (not Back/marker chips). Unpin FAB still exists for pinned models.

---

## Loaders

| asset | how |
|-------|-----|
| .mind | MindAR imageTargetSrc fetch |
| .glb | THREE.GLTFLoader |
| gallery jpg | THREE.TextureLoader |
| video | video element + VideoTexture + chroma shader |

Models: fitSize scale, XZ center, bottom near y=0, small ground disk under pivot.

---

## Serving

- Dev: static server on `frontend/` (e.g. port 3000).
- Phone: HTTPS tunnel; optional `scripts/make-tunnel-qr.py`.

---

## Add an experience

1. Compile marker PNG -> .mind; add preview PNG.
2. Add GLB / images / video under assets/.
3. Register in TARGETS.
4. Optional home button `enterWebAR('id')`.
5. Open with button or `?markerId=id`.
