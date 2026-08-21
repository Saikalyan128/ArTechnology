/**
 * MindAR + Three.js: demo (cube) | gallery (swipe images, 2nd marker)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MindARThree } from 'mindar-image-three';

const log = window.AppLogger;

const TARGETS = {
  demo: {
    mindUrl: './assets/targets/card.mind',
    type: 'cube',
    label: 'card (cube)',
  },
  gallery: {
    mindUrl: './assets/targets/gallery.mind',
    type: 'gallery',
    label: 'raccoon (gallery)',
    images: [
      './assets/gallery/01.jpg',
      './assets/gallery/02.jpg',
      './assets/gallery/03.jpg',
      './assets/gallery/04.jpg',
      './assets/gallery/05.jpg',
    ],
  },
  watch: {
    // mind + preview must be the SAME image (pictarize pair)
    mindUrl: './assets/targets/watch.mind',
    type: 'model',
    label: 'pictarize marker (Seiko GLB)',
    modelUrl: './assets/3D/seiko_watch.glb',
    // Marker-local units (~1 = full marker width)
    fitSize: 0.9,
  },
  // Boccia titanium watch — dedicated boccia.mind marker (print boccia.png)
  boccia: {
    mindUrl: './assets/targets/boccia.mind',
    type: 'model',
    label: 'boccia marker (titanium GLB)',
    modelUrl: './assets/3D_motion/boccia_titanium_wrist_watch__animatable.glb',
    fitSize: 1.05,
    // Scroll / drag scrubs GLB animation (same idea as motion video)
    scrollAnim: true,
  },
  // Same Boccia GLB, but SHWAA logo as the MindAR target
  'boccia-logo': {
    mindUrl: './assets/targets/shwaa-logo.mind',
    type: 'model',
    label: 'SHWAA logo (Boccia GLB)',
    modelUrl: './assets/3D_motion/boccia_titanium_wrist_watch__animatable.glb',
    fitSize: 1.05,
    scrollAnim: true,
  },
  // Scroll-scrub video with chroma-key transparency (reuses gallery marker for MVP)
  motion: {
    mindUrl: './assets/targets/gallery.mind',
    type: 'video',
    label: '3D Motion (scroll video)',
    videoUrl: './assets/3D_motion/VID-20260813-WA0015.mp4',
    // keyColor: RGB 0–1 for background to punch out (green screen default)
    keyColor: [0.0, 1.0, 0.0],
    // Also fade very dark pixels (helps black studio BG)
    keyDark: 0.12,
    similarity: 0.32,
    smoothness: 0.08,
    planeWidth: 1.3,
  },
};

function resolveTarget(markerId) {
  return TARGETS[markerId] || TARGETS.demo;
}

function setHint(text) {
  const el = document.getElementById('hint');
  if (el) el.textContent = text;
}

function setChip(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setUnpinButtonVisible(show) {
  const btn = document.getElementById('unpin-btn');
  if (!btn) return;
  if (show) btn.classList.remove('hidden');
  else btn.classList.add('hidden');
}

// Active-session unpin hook (called from button / app.js)
let activeUnpinFn = null;

/** Public: unpin current AR object if pinned. Used by overlay button. */
export function requestUnpin() {
  log.info('UI', 'requestUnpin()', { hasHook: typeof activeUnpinFn === 'function' });
  if (typeof activeUnpinFn === 'function') {
    activeUnpinFn('button');
    return true;
  }
  log.warn('UI', 'Unpin requested but no active pin session');
  setUnpinButtonVisible(false);
  return false;
}

function loadTexture(url) {
  return new Promise(function (resolve, reject) {
    new THREE.TextureLoader().load(url, function (tex) {
      tex.colorSpace = THREE.SRGBColorSpace;
      resolve(tex);
    }, undefined, reject);
  });
}

function paintLabel(ctx, canvas, text) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

function makeTextSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  paintLabel(ctx, canvas, text);
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.12),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  mesh.userData = { canvas: canvas, ctx: ctx, tex: tex };
  return mesh;
}

function updateTextSprite(mesh, text) {
  paintLabel(mesh.userData.ctx, mesh.userData.canvas, text);
  mesh.userData.tex.needsUpdate = true;
}

function buildCubeContent() {
  const group = new THREE.Group();
  group.userData.mode = 'cube';
  group.add(new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.55),
    new THREE.MeshBasicMaterial({
      color: 0x4fc3f7, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
    })
  ));
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xff9800, metalness: 0.2, roughness: 0.35 })
  );
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.2, 0.16);
  pivot.add(cube);
  group.add(pivot);
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(0, 1, 1);
  group.add(dir);
  group.add(new THREE.AmbientLight(0xffffff, 0.6));
  group.userData.cube = cube;
  group.userData.pivot = pivot;
  group.userData.hitRoot = group;
  return group;
}

/** Bounding box from mesh geometry only (ignores empty bones/helpers). */
function meshBounds(root) {
  const box = new THREE.Box3();
  let found = false;
  root.updateMatrixWorld(true);
  root.traverse(function (obj) {
    if (!obj.isMesh || !obj.geometry) return;
    const g = obj.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox) return;
    const b = g.boundingBox.clone();
    b.applyMatrix4(obj.matrixWorld);
    if (!found) {
      box.copy(b);
      found = true;
    } else {
      box.union(b);
    }
  });
  return found ? box : null;
}

/** Make GLB materials readable under AR lighting. */
function hardenModelMaterials(root) {
  let meshes = 0;
  root.traverse(function (obj) {
    // Drop cameras / extra lights shipped inside some product GLBs
    if (obj.isCamera || obj.isLight) {
      obj.visible = false;
      return;
    }
    if (!obj.isMesh) return;
    meshes += 1;
    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.frustumCulled = false;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(function (mat) {
      if (!mat) return;
      mat.side = THREE.DoubleSide;
      mat.transparent = !!mat.transparent;
      mat.depthWrite = mat.transparent ? mat.depthWrite : true;
      mat.depthTest = true;
      // Unlit maps still show; ensure color not blacked out
      if (mat.color && mat.color.r + mat.color.g + mat.color.b < 0.05 && !mat.map) {
        mat.color.set(0xb0b8c0); // titanium-ish fallback
      }
      if ('metalness' in mat) mat.metalness = Math.min(mat.metalness != null ? mat.metalness : 0.6, 0.85);
      if ('roughness' in mat) mat.roughness = Math.max(mat.roughness != null ? mat.roughness : 0.35, 0.2);
      if ('envMapIntensity' in mat && mat.envMapIntensity == null) mat.envMapIntensity = 1;
      mat.needsUpdate = true;
    });
  });
  return meshes;
}

/**
 * Load a .glb, center it, fit to marker size, enable drag-rotate via pivot.
 */
async function buildModelContent(opts) {
  const modelUrl = opts.modelUrl;
  const fitSize = opts.fitSize != null ? opts.fitSize : 0.6;
  const scrollAnim = !!opts.scrollAnim;
  const group = new THREE.Group();
  group.userData.mode = 'model';
  group.userData.scrollAnim = scrollAnim;

  // Tiny faint ground disk under the model
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(0.06, 32),
    new THREE.MeshBasicMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.001;
  base.name = 'groundBase';
  group.add(base);
  group.userData.base = base;

  log.info('GLB', 'Loading model...', modelUrl);
  setHint('Loading 3D model...');
  const loader = new GLTFLoader();
  const gltf = await new Promise(function (resolve, reject) {
    loader.load(modelUrl, resolve, undefined, reject);
  });

  const model = gltf.scene;
  const meshCount = hardenModelMaterials(model);

  // Wrapper so we can scale + recenter without fighting nested GLB offsets
  const contentRoot = new THREE.Group();
  contentRoot.add(model);
  contentRoot.updateMatrixWorld(true);

  // Mesh-only bounds (rest pose) — empty bones/helpers inflate setFromObject
  let box = meshBounds(contentRoot);
  if (!box || box.isEmpty()) {
    box = new THREE.Box3().setFromObject(contentRoot);
  }
  const size0 = new THREE.Vector3();
  box.getSize(size0);

  let maxDim = Math.max(size0.x, size0.y, size0.z);
  if (!isFinite(maxDim) || maxDim < 1e-6) {
    log.warn('GLB', 'Degenerate bounds — using unit box');
    maxDim = 1;
    size0.set(1, 1, 1);
  }

  // 1) Scale first (about local origin of model nodes)
  const s = fitSize / maxDim;
  model.scale.setScalar(s);
  contentRoot.updateMatrixWorld(true);

  // 2) Recompute bounds AFTER scale, then place bottom-center on origin
  box = meshBounds(contentRoot);
  if (!box || box.isEmpty()) {
    box = new THREE.Box3().setFromObject(contentRoot);
  }
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // XZ: center; Y: bottom of mesh on y=0
  contentRoot.position.set(-center.x, -box.min.y, -center.z);
  contentRoot.updateMatrixWorld(true);

  // Pivot for drag-rotate — tiny lift to avoid z-fight with marker plane
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.02, 0);
  pivot.add(contentRoot);
  group.add(pivot);

  // Keep ground disk tiny under the model footprint
  const footprint = Math.max(size.x, size.z, 0.08) * 0.12;
  base.geometry.dispose();
  base.geometry = new THREE.CircleGeometry(Math.min(Math.max(footprint, 0.03), 0.07), 32);
  base.position.set(0, 0.001, 0);

  // Stronger AR lighting (watches are often dark metal)
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1.2, 2.4, 1.5);
  group.add(key);
  const fill = new THREE.DirectionalLight(0xb0c4de, 0.7);
  fill.position.set(-1.5, 1.0, -1.0);
  group.add(fill);
  group.add(new THREE.AmbientLight(0xffffff, 0.85));
  group.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.7));

  // Reuse cube interaction: treat pivot as rotate target; drag flag on model root
  const dragProxy = { userData: { dragging: false } };
  group.userData.cube = dragProxy;
  group.userData.pivot = pivot;
  group.userData.model = model;
  group.userData.hitRoot = group;
  group.userData.mixer = null;
  group.userData.animActions = null;
  group.userData.animDuration = 0;
  group.userData.animTime = 0;

  // Enlarge hit target for scroll-anim (watch can be thin / hard to drag)
  if (scrollAnim) {
    const hitPad = new THREE.Mesh(
      new THREE.BoxGeometry(
        Math.max(size.x, 0.35) * 1.4,
        Math.max(size.y, 0.25) * 1.5,
        Math.max(size.z, 0.25) * 1.4
      ),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.001,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      })
    );
    hitPad.position.set(0, Math.max(size.y, 0.25) * 0.55, 0);
    hitPad.name = 'scrollHitPad';
    pivot.add(hitPad);
    group.userData.hitRoot = hitPad;
  }

  if (gltf.animations && gltf.animations.length) {
    // Mixer on full scene graph so skinned bones (Armature) receive clips
    const mixer = new THREE.AnimationMixer(model);
    const actions = [];
    let maxDur = 0;
    gltf.animations.forEach(function (clip) {
      const action = mixer.clipAction(clip, model);
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(1);
      if (scrollAnim) {
        // Manual scrub: LoopOnce + paused; time driven by user
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.paused = true;
        action.play();
        action.time = 0;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.paused = false;
        action.play();
      }
      actions.push(action);
      if (clip.duration > maxDur) maxDur = clip.duration;
    });

    let scrubLogN = 0;
    function applyAnimTime(t) {
      const dur = maxDur || 1;
      if (t < 0) t = 0;
      if (t > dur) t = dur;
      group.userData.animTime = t;

      actions.forEach(function (a) {
        const clipDur = (a.getClip() && a.getClip().duration) || dur;
        const localT = Math.min(Math.max(t, 0), clipDur);
        a.enabled = true;
        a.setEffectiveWeight(1);
        a.setEffectiveTimeScale(0); // freeze auto advance
        a.paused = false; // must be "playing" for mixer to sample
        a.time = localT;
        a.play();
      });

      // Sample pose at action.time (timeScale 0 keeps it frozen)
      mixer.update(0.016);
      // Snap exact time after update (update advances by timeScale*dt = 0)
      actions.forEach(function (a) {
        const clipDur = (a.getClip() && a.getClip().duration) || dur;
        a.time = Math.min(Math.max(t, 0), clipDur);
        a.paused = true;
      });
      mixer.update(0);

      model.updateMatrixWorld(true);
      model.traverse(function (o) {
        if (o.isSkinnedMesh) {
          o.frustumCulled = false;
          if (o.skeleton) o.skeleton.update();
        }
      });
    }

    if (scrollAnim) applyAnimTime(0);

    group.userData.mixer = mixer;
    group.userData.animActions = actions;
    group.userData.animDuration = maxDur || 1;
    group.userData.animTime = 0;
    group.userData.applyAnimTime = applyAnimTime;

    // 1:1 scrub — animation moves only while user scrolls
    group.userData.scrubAnim = function (deltaNorm) {
      const dur = group.userData.animDuration || 1;
      // ~0.5× clip per full-screen drag; also min seconds so short drags work
      const step = deltaNorm * Math.max(dur * 0.55, 2.0);
      const next = (group.userData.animTime || 0) + step;
      applyAnimTime(next);
      scrubLogN += 1;
      if (scrubLogN === 1 || scrubLogN % 20 === 0) {
        log.info('GLB', 'Anim scrub', {
          t: +(group.userData.animTime || 0).toFixed(2),
          dur: +dur.toFixed(2),
          pct: Math.round(((group.userData.animTime || 0) / dur) * 100),
        });
      }
    };

    log.ok('GLB', scrollAnim ? 'Scroll-scrub animation ready' : 'Playing embedded animations', {
      count: gltf.animations.length,
      duration: +maxDur.toFixed(2),
      names: gltf.animations.map(function (a) { return a.name; }),
      scrollAnim: scrollAnim,
      skinned: true,
    });
  } else if (scrollAnim) {
    log.warn('GLB', 'scrollAnim requested but GLB has no animations');
  }

  log.ok('GLB', 'Model ready', {
    url: modelUrl,
    meshes: meshCount,
    size: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
    fitScale: +s.toFixed(4),
    scrollAnim: scrollAnim,
  });
  return group;
}

/**
 * Full interaction for scroll-anim models (e.g. Boccia):
 *  vertical drag / wheel → scrub animation 1:1
 *  horizontal drag → rotate
 *  pinch → zoom
 *  long-press → pin; double-tap (pinned) → unpin
 */
function setupModelScrollAnimInteraction(root, camera, content, opts) {
  opts = opts || {};
  const onPinChange = typeof opts.onPinChange === 'function' ? opts.onPinChange : null;
  const enablePin = opts.enablePin !== false;
  const pivot = content.userData.pivot;
  const cube = content.userData.cube;
  const scrubAnim = content.userData.scrubAnim;
  const ROT_SPEED = 0.012;
  const AXIS_LOCK = 10;
  const SCRUB_PX = 220;
  const LONG_MS = 600;
  const MOVE_CANCEL = 14;
  const TAP_MOVE_MAX = 48; // mobile finger wiggle
  const DBL_TAP_MS = 700; // generous for phone double-tap
  const ZOOM_MIN = 0.35;
  const ZOOM_MAX = 3.5;

  let active = false;
  let mode = null; // 'anim' | 'rot'
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;
  let holdTimer = null;
  let pinTriggered = false;
  let lastTapTs = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let tapCandidate = false;
  let ignoreGesturesUntil = 0; // block leftover motion after unpin
  let userScale = 1;
  const pointers = new Map();
  let pinching = false;
  let pinchStartDist = 0;
  let pinchStartScale = 1;

  if (pivot) pivot.scale.setScalar(1);
  content.userData.userScale = 1;

  function clearHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function isPinned() {
    return !!content.userData.pinned;
  }

  function setPinned(next) {
    content.userData.pinned = !!next;
    if (onPinChange) onPinChange(content.userData.pinned);
  }

  function tryDoubleTapUnpin(x, y) {
    if (!enablePin || !isPinned()) return false;
    const now = Date.now();
    const near =
      !lastTapTs ||
      (Math.abs(x - lastTapX) < 120 && Math.abs(y - lastTapY) < 120);
    if (lastTapTs && near && now - lastTapTs < DBL_TAP_MS) {
      lastTapTs = 0;
      ignoreGesturesUntil = now + 350;
      if (typeof activeUnpinFn === 'function') activeUnpinFn('double-tap');
      else setPinned(false);
      return true;
    }
    lastTapTs = now;
    lastTapX = x;
    lastTapY = y;
    log.info('UI', 'Tap 1/2 — tap again quickly to unpin');
    setHint('Tap again quickly to unpin (or use Unpin button).');
    return false;
  }

  function applyZoom(scale) {
    userScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
    content.userData.userScale = userScale;
    if (pivot) pivot.scale.setScalar(userScale);
  }

  function pointerDist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getPinchPoints() {
    if (pointers.size < 2) return null;
    const arr = Array.from(pointers.values());
    return { a: arr[0], b: arr[1] };
  }

  function onDown(e) {
    if (!content.visible) return;
    if (Date.now() < ignoreGesturesUntil) return;
    // Don't steal taps on overlay UI (Website / Contact / Unpin)
    if (e.target && e.target.closest && e.target.closest('.ar-overlay, #unpin-btn, #website-btn, #contact-btn')) return;

    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size >= 2) {
      clearHold();
      active = false;
      tapCandidate = false;
      pinTriggered = false;
      lastTapTs = 0;
      if (cube) cube.userData.dragging = false;
      const pts = getPinchPoints();
      if (pts) {
        pinching = true;
        pinchStartDist = pointerDist(pts.a, pts.b) || 1;
        pinchStartScale = userScale;
      }
      if (e.cancelable) e.preventDefault();
      return;
    }

    // While pinned: whole AR view accepts taps (no need to hit the mesh)
    const hit = hitTest(root, camera, content.userData.hitRoot, e.clientX, e.clientY);
    const pinned = enablePin && isPinned();
    if (!hit && !pinned) return;

    // Double-tap unpin — detect on 2nd DOWN (most reliable on mobile).
    // Still start drag so scroll-scrub / rotate work after pin.
    if (pinned) {
      if (tryDoubleTapUnpin(e.clientX, e.clientY)) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      tapCandidate = true;
      pinTriggered = false;
      active = true;
      mode = null;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      if (cube) cube.userData.dragging = true;
      if (e.cancelable) e.preventDefault();
      return;
    }

    tapCandidate = true;
    pinTriggered = false;
    active = !!hit;
    mode = null;
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
    if (cube && hit) cube.userData.dragging = true;

    if (enablePin && !isPinned() && hit) {
      clearHold();
      holdTimer = setTimeout(function () {
        holdTimer = null;
        if (!active || pinTriggered || pinching) return;
        pinTriggered = true;
        tapCandidate = false;
        lastTapTs = 0;
        setPinned(true);
        setHint('Pinned. Scroll = anim · side-drag = rotate · Unpin / double-tap to release.');
      }, LONG_MS);
    }

    if (e.cancelable) e.preventDefault();
  }

  function onMove(e) {
    if (!content.visible) return;
    if (Date.now() < ignoreGesturesUntil) return;
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinching && pointers.size >= 2) {
      tapCandidate = false;
      lastTapTs = 0;
      const pts = getPinchPoints();
      if (pts && pinchStartDist > 0) {
        applyZoom(pinchStartScale * (pointerDist(pts.a, pts.b) / pinchStartDist));
      }
      if (e.cancelable) e.preventDefault();
      return;
    }

    // Pinned first-tap of double-tap: ignore drag (keep tap window alive)
    if (enablePin && isPinned() && !active) {
      const mx = e.clientX - downX;
      const my = e.clientY - downY;
      if (Math.abs(mx) > TAP_MOVE_MAX || Math.abs(my) > TAP_MOVE_MAX) {
        tapCandidate = false;
        lastTapTs = 0;
      }
      return;
    }

    if (!active) return;

    const mx = e.clientX - downX;
    const my = e.clientY - downY;
    if (Math.abs(mx) > MOVE_CANCEL || Math.abs(my) > MOVE_CANCEL) clearHold();
    if (Math.abs(mx) > TAP_MOVE_MAX || Math.abs(my) > TAP_MOVE_MAX) {
      tapCandidate = false;
      lastTapTs = 0;
    }

    if (pinTriggered) {
      if (e.cancelable) e.preventDefault();
      return;
    }

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    if (!mode) {
      if (Math.abs(e.clientX - downX) < AXIS_LOCK && Math.abs(e.clientY - downY) < AXIS_LOCK) return;
      mode = Math.abs(e.clientY - downY) >= Math.abs(e.clientX - downX) ? 'anim' : 'rot';
    }

    if (mode === 'anim' && scrubAnim) {
      scrubAnim((-dy) / SCRUB_PX);
    } else if (mode === 'rot' && pivot) {
      pivot.rotation.y += dx * ROT_SPEED;
      pivot.rotation.x += dy * ROT_SPEED;
      pivot.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pivot.rotation.x));
    }

    lastX = e.clientX;
    lastY = e.clientY;
    if (e.cancelable) e.preventDefault();
  }

  function onUp(e) {
    if (e && e.pointerId != null) pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinching = false;
      pinchStartDist = 0;
    }
    if (pointers.size !== 0) return;

    clearHold();
    // If first tap of unpin drifted too far, clear pending double-tap
    if (enablePin && isPinned() && !tapCandidate) {
      // keep lastTapTs only if this was a clean first tap recorded on down
    }

    active = false;
    mode = null;
    pinTriggered = false;
    tapCandidate = false;
    if (cube) cube.userData.dragging = false;
  }

  function onWheel(e) {
    if (!content.visible) return;
    if (!hitTest(root, camera, content.userData.hitRoot, e.clientX, e.clientY)) return;
    e.preventDefault();
    if (!scrubAnim) return;
    scrubAnim((-e.deltaY) / 700);
  }

  // capture:true so double-tap works even if MindAR wrappers sit over the root
  const optsEv = { passive: false };
  const optsCap = { passive: false, capture: true };
  root.addEventListener('pointerdown', onDown, optsCap);
  window.addEventListener('pointermove', onMove, optsEv);
  window.addEventListener('pointerup', onUp, optsCap);
  window.addEventListener('pointercancel', onUp, optsCap);
  root.addEventListener('wheel', onWheel, optsEv);
  root.style.touchAction = 'none';
  log.info('UI', 'Scroll-anim + rotate + zoom + pin ready');
  return function () {
    clearHold();
    pointers.clear();
    root.removeEventListener('pointerdown', onDown, optsCap);
    window.removeEventListener('pointermove', onMove, optsEv);
    window.removeEventListener('pointerup', onUp, optsCap);
    window.removeEventListener('pointercancel', onUp, optsCap);
    root.removeEventListener('wheel', onWheel, optsEv);
    root.style.touchAction = '';
  };
}

async function buildGalleryContent(imageUrls) {
  const group = new THREE.Group();
  group.userData.mode = 'gallery';

  // Smooth crossfade: back plane (outgoing) + front plane (incoming)
  const FADE_SEC = 0.42;
  const SLIDE_X = 0.08; // subtle horizontal drift during fade

  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.8),
    new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide })
  );
  frame.position.z = -0.01;
  group.add(frame);

  const matA = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const matB = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const photoA = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.7), matA);
  const photoB = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.7), matB);
  photoA.position.z = 0.02;
  photoB.position.z = 0.025;
  group.add(photoA);
  group.add(photoB);

  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.85),
    new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    })
  );
  hit.position.z = 0.04;
  group.add(hit);

  const textures = [];
  for (let i = 0; i < imageUrls.length; i++) {
    try { textures.push(await loadTexture(imageUrls[i])); }
    catch (e) { log.warn('Gallery', 'Failed', imageUrls[i]); }
  }
  if (!textures.length) throw new Error('No gallery images loaded');

  let index = 0;
  // Which mesh is "current" (fully visible when idle)
  let frontIsA = true;
  let anim = null; // { t, from, to, dir, duration }

  matA.map = textures[0];
  matA.needsUpdate = true;
  matB.map = textures[0];
  matB.needsUpdate = true;

  const label = makeTextSprite('1 / ' + textures.length);
  label.position.set(0, -0.48, 0.05);
  group.add(label);

  function easeInOutCubic(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  function frontBack() {
    return frontIsA
      ? { front: photoA, fMat: matA, back: photoB, bMat: matB }
      : { front: photoB, fMat: matB, back: photoA, bMat: matA };
  }

  function finishAnim() {
    if (!anim) return;
    const fb = frontBack();
    // After fade, back becomes the new front
    fb.front.material.opacity = 0;
    fb.front.position.x = 0;
    fb.back.material.opacity = 1;
    fb.back.position.x = 0;
    frontIsA = !frontIsA;
    index = anim.to;
    updateTextSprite(label, (index + 1) + ' / ' + textures.length);
    anim = null;
  }

  function show(i, dir) {
    const next = ((i % textures.length) + textures.length) % textures.length;
    if (next === index && !anim) return;
    // If mid-transition, snap to target then start new fade
    if (anim) finishAnim();

    const fb = frontBack();
    // Incoming texture on back plane (starts transparent)
    fb.bMat.map = textures[next];
    fb.bMat.needsUpdate = true;
    fb.bMat.opacity = 0;
    fb.back.position.x = (dir >= 0 ? 1 : -1) * SLIDE_X;
    fb.fMat.opacity = 1;
    fb.front.position.x = 0;

    anim = {
      t: 0,
      from: index,
      to: next,
      dir: dir >= 0 ? 1 : -1,
      duration: FADE_SEC,
    };
    log.ok('Gallery', 'Crossfade', { n: next + 1, total: textures.length });
  }

  group.userData.gallery = {
    next: function () { show(index + 1, 1); },
    prev: function () { show(index - 1, -1); },
    /** Call each frame while gallery is visible */
    update: function (dt) {
      if (!anim) return;
      anim.t += dt;
      const u = Math.min(1, anim.t / anim.duration);
      const e = easeInOutCubic(u);
      const fb = frontBack();
      // Front fades out + drifts out; back fades in + drifts to center
      fb.fMat.opacity = 1 - e;
      fb.bMat.opacity = e;
      fb.front.position.x = -anim.dir * SLIDE_X * e;
      fb.back.position.x = anim.dir * SLIDE_X * (1 - e);
      if (u >= 1) finishAnim();
    },
    isAnimating: function () { return !!anim; },
  };
  group.userData.hitRoot = hit;
  return group;
}

/**
 * Chroma-key video plane. Scroll/drag vertical scrubbing drives currentTime.
 * Transparent BG via green-screen + dark-pixel key in a custom shader.
 */
async function buildVideoContent(opts) {
  const videoUrl = opts.videoUrl;
  const keyColor = opts.keyColor || [0, 1, 0];
  const keyDark = opts.keyDark != null ? opts.keyDark : 0.12;
  const similarity = opts.similarity != null ? opts.similarity : 0.32;
  const smoothness = opts.smoothness != null ? opts.smoothness : 0.08;
  const planeWidth = opts.planeWidth != null ? opts.planeWidth : 1.0;

  const group = new THREE.Group();
  group.userData.mode = 'video';

  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  // Keep paused; scrubbing sets currentTime. play() once to decode on iOS.
  video.pause();

  await new Promise(function (resolve, reject) {
    let done = false;
    function ok() {
      if (done) return;
      done = true;
      resolve();
    }
    function fail(e) {
      if (done) return;
      done = true;
      reject(e || new Error('Video load failed'));
    }
    video.addEventListener('loadeddata', ok);
    video.addEventListener('error', fail);
    video.load();
    // Safety timeout — still proceed so marker tracking works
    setTimeout(ok, 8000);
  });

  // iOS often needs a muted play/pause kick to unlock seeking
  try {
    await video.play();
    video.pause();
    video.currentTime = 0;
  } catch (e) {
    log.warn('Video', 'play unlock failed (ok on some desktop)', String(e));
  }

  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const aspect = vw / Math.max(vh, 1);
  const planeH = planeWidth / aspect;

  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  // Shader: punch out green (or keyColor) + very dark pixels → alpha 0
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      keyColor: { value: new THREE.Color(keyColor[0], keyColor[1], keyColor[2]) },
      similarity: { value: similarity },
      smoothness: { value: smoothness },
      keyDark: { value: keyDark },
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D map;',
      'uniform vec3 keyColor;',
      'uniform float similarity;',
      'uniform float smoothness;',
      'uniform float keyDark;',
      'varying vec2 vUv;',
      'void main() {',
      '  vec4 texColor = texture2D(map, vUv);',
      '  float chromaDist = distance(texColor.rgb, keyColor);',
      '  float chromaAlpha = smoothstep(similarity, similarity + smoothness, chromaDist);',
      '  float lum = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));',
      '  float darkAlpha = smoothstep(0.0, keyDark, lum);',
      '  float alpha = texColor.a * chromaAlpha * darkAlpha;',
      '  if (alpha < 0.04) discard;',
      '  gl_FragColor = vec4(texColor.rgb, alpha);',
      '}',
    ].join('\n'),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeH), mat);
  plane.position.set(0, planeH * 0.5 + 0.02, 0.02);
  group.add(plane);

  // Large invisible hit plane (easy to grab even if chroma punches visual holes)
  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(planeWidth * 1.35, planeH * 1.4),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.001,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    })
  );
  hit.position.copy(plane.position);
  hit.position.z += 0.02;
  hit.renderOrder = 10;
  group.add(hit);

  const label = makeTextSprite('Scroll to play');
  label.position.set(0, -0.08, 0.05);
  group.add(label);

  // 1:1 scrub — seek on gesture; texture refresh on 'seeked'
  let playhead = 0;
  let seekPending = false;
  let labelDirty = true;
  let lastSeekWall = 0;
  let unlocked = false;
  let scrubCount = 0;

  function wrapTime(t, dur) {
    return ((t % dur) + dur) % dur;
  }

  function getDuration() {
    const d = video.duration;
    return d && isFinite(d) && d > 0 ? d : 0;
  }

  function applySeekNow() {
    seekPending = false;
    const dur = getDuration();
    if (!dur) {
      seekPending = true;
      return;
    }
    playhead = wrapTime(playhead, dur);
    const now = performance.now();
    if (now - lastSeekWall < 16) {
      seekPending = true;
      return;
    }
    lastSeekWall = now;
    try {
      if (Math.abs((video.currentTime || 0) - playhead) > 0.01) {
        video.currentTime = playhead;
      }
    } catch (e) {
      seekPending = true;
    }
    tex.needsUpdate = true;
    if (labelDirty) {
      labelDirty = false;
      group.userData.setProgressLabel();
    }
  }

  video.addEventListener('seeked', function () {
    tex.needsUpdate = true;
  });
  video.addEventListener('loadedmetadata', function () {
    playhead = video.currentTime || 0;
    group.userData.setProgressLabel();
    log.ok('Video', 'Metadata ready', { duration: video.duration });
  });

  group.userData.video = video;
  group.userData.videoTex = tex;
  group.userData.videoMat = mat;
  group.userData.videoPlane = plane;
  group.userData.hitRoot = hit;
  group.userData.label = label;
  group.userData.unlockVideo = async function () {
    if (unlocked) return true;
    try {
      video.muted = true;
      await video.play();
      video.pause();
      unlocked = true;
      log.ok('Video', 'Unlocked for scrubbing');
      return true;
    } catch (e) {
      log.warn('Video', 'Unlock failed', String(e));
      return false;
    }
  };
  group.userData.scrub = function (deltaNorm) {
    const dur = getDuration();
    if (!dur) {
      log.warn('Video', 'Scrub ignored — duration not ready');
      return;
    }
    playhead = wrapTime(playhead + deltaNorm * Math.max(dur * 0.35, 0.8), dur);
    labelDirty = true;
    seekPending = true;
    scrubCount += 1;
    if (scrubCount === 1 || scrubCount % 30 === 0) {
      log.info('Video', 'Scrub', { t: +playhead.toFixed(2), dur: +dur.toFixed(2) });
    }
    applySeekNow();
  };
  group.userData.setProgressLabel = function () {
    const dur = getDuration();
    if (!dur) {
      updateTextSprite(label, 'Loading…');
      return;
    }
    const pct = Math.round((playhead / dur) * 100);
    updateTextSprite(label, pct + '% · scroll');
  };
  group.userData.update = function () {
    if (seekPending) applySeekNow();
    // Keep frame showing even if paused
    if (video.readyState >= 2) tex.needsUpdate = true;
  };

  log.ok('Video', 'Motion plane ready', {
    url: videoUrl,
    size: vw + 'x' + vh,
    duration: getDuration() || 0,
  });
  return group;
}

function setupVideoInteraction(root, camera, content) {
  const scrub = content.userData.scrub;
  const video = content.userData.video;
  const unlock = content.userData.unlockVideo;
  let active = false;
  let lastY = 0;
  let lastX = 0;
  // Smaller = more sensitive scrub
  const SCRUB_PX = 160;

  function onDown(e) {
    if (!content.visible) return;
    // Hit plane OR main content (group)
    const hitOk =
      hitTest(root, camera, content.userData.hitRoot, e.clientX, e.clientY) ||
      hitTest(root, camera, content, e.clientX, e.clientY);
    if (!hitOk) return;
    active = true;
    lastY = e.clientY;
    lastX = e.clientX;
    if (unlock) unlock();
    else if (video && video.paused) {
      video.play().then(function () { video.pause(); }).catch(function () {});
    }
    if (e.cancelable) e.preventDefault();
  }

  function onMove(e) {
    if (!active || !content.visible) return;
    const dy = lastY - e.clientY; // drag up = forward
    const dx = e.clientX - lastX;
    const primary = Math.abs(dy) >= Math.abs(dx) * 0.6 ? dy : dx;
    if (Math.abs(primary) > 0.5 && scrub) {
      scrub(primary / SCRUB_PX);
      lastY = e.clientY;
      lastX = e.clientX;
    }
    if (e.cancelable) e.preventDefault();
  }

  function onUp() {
    active = false;
  }

  function onWheel(e) {
    if (!content.visible) return;
    const hitOk =
      hitTest(root, camera, content.userData.hitRoot, e.clientX, e.clientY) ||
      hitTest(root, camera, content, e.clientX, e.clientY);
    if (!hitOk) return;
    e.preventDefault();
    if (unlock) unlock();
    if (scrub) scrub((-e.deltaY) / 700);
  }

  const opts = { passive: false };
  root.addEventListener('pointerdown', onDown, opts);
  window.addEventListener('pointermove', onMove, opts);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  root.addEventListener('wheel', onWheel, opts);
  root.style.touchAction = 'none';
  log.info('UI', 'Video scroll-scrub ready');
  return function () {
    root.removeEventListener('pointerdown', onDown, opts);
    window.removeEventListener('pointermove', onMove, opts);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    root.removeEventListener('wheel', onWheel, opts);
    root.style.touchAction = '';
    try {
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    } catch (e) {}
  };
}

function hitTest(root, camera, obj, x, y) {
  const rect = root.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const ndc = new THREE.Vector2(
    ((x - rect.left) / rect.width) * 2 - 1,
    -((y - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(obj, true).length > 0;
}

/**
 * Drag-rotate + pinch/wheel zoom + optional long-press pin (3D models).
 *
 * Zoom: two-finger pinch or mouse wheel over the object (scales pivot).
 * Pin: long-hold ~600ms → stays when marker lost; double-tap → unpin.
 *
 * opts.onPinChange(pinned: boolean)
 */
function setupCubeInteraction(root, camera, content, opts) {
  opts = opts || {};
  const enablePin = !!opts.enablePin;
  const enableZoom = opts.enableZoom !== false;
  const onPinChange = typeof opts.onPinChange === 'function' ? opts.onPinChange : null;
  const LONG_MS = 600;
  const MOVE_CANCEL = 14;
  const ZOOM_MIN = 0.35;
  const ZOOM_MAX = 3.5;

  const cube = content.userData.cube;
  const pivot = content.userData.pivot;
  const SPEED = 0.012;
  const TAP_MOVE_MAX = 48; // mobile finger wiggle
  const DBL_TAP_MS = 700; // generous for phone double-tap
  let dragging = false;
  let prevX = 0;
  let prevY = 0;
  let holdTimer = null;
  let downX = 0;
  let downY = 0;
  let pinTriggered = false;
  let lastTapTs = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let tapCandidate = false;
  let hitOnDown = false;
  let ignoreGesturesUntil = 0;

  // Pinch state (two pointers)
  const pointers = new Map();
  let pinching = false;
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let userScale = 1;

  if (pivot) pivot.scale.setScalar(1);
  content.userData.userScale = 1;

  function clearHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function isPinned() {
    return !!content.userData.pinned;
  }

  function setPinned(next) {
    content.userData.pinned = !!next;
    if (onPinChange) onPinChange(content.userData.pinned);
  }

  function tryDoubleTapUnpin(x, y) {
    if (!enablePin || !isPinned()) return false;
    const now = Date.now();
    const near =
      !lastTapTs ||
      (Math.abs(x - lastTapX) < 120 && Math.abs(y - lastTapY) < 120);
    if (lastTapTs && near && now - lastTapTs < DBL_TAP_MS) {
      lastTapTs = 0;
      ignoreGesturesUntil = now + 350;
      if (typeof activeUnpinFn === 'function') activeUnpinFn('double-tap');
      else setPinned(false);
      return true;
    }
    lastTapTs = now;
    lastTapX = x;
    lastTapY = y;
    log.info('UI', 'Tap 1/2 — tap again quickly to unpin');
    setHint('Tap again quickly to unpin (or use Unpin button).');
    return false;
  }

  function applyZoom(scale) {
    userScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
    content.userData.userScale = userScale;
    if (pivot) pivot.scale.setScalar(userScale);
  }

  function pointerDist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getPinchPoints() {
    if (pointers.size < 2) return null;
    const arr = Array.from(pointers.values());
    return { a: arr[0], b: arr[1] };
  }

  function onDown(e) {
    if (!content.visible) return;
    if (Date.now() < ignoreGesturesUntil) return;
    if (e.target && e.target.closest && e.target.closest('.ar-overlay, #unpin-btn, #website-btn, #contact-btn')) return;

    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Second finger → pinch zoom (cancel drag / long-press / tap)
    if (enableZoom && pointers.size >= 2) {
      clearHold();
      dragging = false;
      tapCandidate = false;
      lastTapTs = 0;
      if (cube) cube.userData.dragging = false;
      pinTriggered = false;
      const pts = getPinchPoints();
      if (pts) {
        pinching = true;
        pinchStartDist = pointerDist(pts.a, pts.b) || 1;
        pinchStartScale = userScale;
      }
      if (e.cancelable) e.preventDefault();
      return;
    }

    // While pinned: accept taps on whole AR view
    hitOnDown = hitTest(root, camera, content.userData.hitRoot, e.clientX, e.clientY);
    const pinned = enablePin && isPinned();
    if (!hitOnDown && !pinned) return;

    // Double-tap unpin on 2nd pointerdown (most reliable on mobile)
    if (pinned) {
      if (tryDoubleTapUnpin(e.clientX, e.clientY)) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      // First tap of double-tap: don't start drag (would spoil double-tap)
      tapCandidate = true;
      pinTriggered = false;
      dragging = false;
      downX = prevX = e.clientX;
      downY = prevY = e.clientY;
      if (e.cancelable) e.preventDefault();
      return;
    }

    tapCandidate = true;
    pinTriggered = false;
    downX = prevX = e.clientX;
    downY = prevY = e.clientY;

    if (hitOnDown) {
      dragging = true;
      if (cube) cube.userData.dragging = true;
    } else {
      dragging = false;
    }

    // Long-press pin (unpinned only, and must start on model)
    if (enablePin && !isPinned() && hitOnDown) {
      clearHold();
      holdTimer = setTimeout(function () {
        holdTimer = null;
        if (!dragging || pinTriggered || pinching) return;
        pinTriggered = true;
        tapCandidate = false;
        lastTapTs = 0;
        setPinned(true);
        setHint('Pinned. Double-tap screen twice, or tap Unpin.');
      }, LONG_MS);
    }

    if (e.cancelable) e.preventDefault();
  }

  function onMove(e) {
    if (!content.visible) return;
    if (Date.now() < ignoreGesturesUntil) return;

    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch zoom
    if (enableZoom && pinching && pointers.size >= 2) {
      tapCandidate = false;
      lastTapTs = 0;
      const pts = getPinchPoints();
      if (pts && pinchStartDist > 0) {
        const d = pointerDist(pts.a, pts.b);
        applyZoom(pinchStartScale * (d / pinchStartDist));
      }
      if (e.cancelable) e.preventDefault();
      return;
    }

    // Pinned first-tap: ignore drag so double-tap window stays valid
    if (enablePin && isPinned() && !dragging) {
      const mx = e.clientX - downX;
      const my = e.clientY - downY;
      if (Math.abs(mx) > TAP_MOVE_MAX || Math.abs(my) > TAP_MOVE_MAX) {
        tapCandidate = false;
        lastTapTs = 0;
      }
      return;
    }

    const mx = e.clientX - downX;
    const my = e.clientY - downY;
    const moved = Math.abs(mx) > MOVE_CANCEL || Math.abs(my) > MOVE_CANCEL;
    if (moved) {
      if (holdTimer) clearHold();
      if (Math.abs(mx) > TAP_MOVE_MAX || Math.abs(my) > TAP_MOVE_MAX) {
        tapCandidate = false;
        lastTapTs = 0;
      }
    }

    if (!dragging) return;

    if (pinTriggered) {
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (!pivot) return;
    pivot.rotation.y += (e.clientX - prevX) * SPEED;
    pivot.rotation.x += (e.clientY - prevY) * SPEED;
    pivot.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pivot.rotation.x));
    prevX = e.clientX;
    prevY = e.clientY;
    if (e.cancelable) e.preventDefault();
  }

  function onUp(e) {
    if (e && e.pointerId != null) pointers.delete(e.pointerId);

    if (pointers.size < 2) {
      pinching = false;
      pinchStartDist = 0;
    }

    if (pointers.size === 0) {
      clearHold();
      // Double-tap is handled on pointerdown when pinned
      if (dragging) {
        dragging = false;
        if (cube) cube.userData.dragging = false;
      }
      pinTriggered = false;
      tapCandidate = false;
      hitOnDown = false;
    }
  }

  function onWheel(e) {
    if (!enableZoom || !content.visible) return;
    if (!hitTest(root, camera, content.userData.hitRoot, e.clientX, e.clientY)) return;
    e.preventDefault();
    // scroll up = zoom in
    const factor = Math.exp(-e.deltaY * 0.0015);
    applyZoom(userScale * factor);
  }

  const optsEv = { passive: false };
  const optsCap = { passive: false, capture: true };
  root.addEventListener('pointerdown', onDown, optsCap);
  window.addEventListener('pointermove', onMove, optsEv);
  window.addEventListener('pointerup', onUp, optsCap);
  window.addEventListener('pointercancel', onUp, optsCap);
  root.addEventListener('wheel', onWheel, optsEv);
  root.style.touchAction = 'none';
  log.info('UI', 'Drag/zoom' + (enablePin ? '+pin' : '') + ' ready');
  return function () {
    clearHold();
    pointers.clear();
    root.removeEventListener('pointerdown', onDown, optsCap);
    window.removeEventListener('pointermove', onMove, optsEv);
    window.removeEventListener('pointerup', onUp, optsCap);
    window.removeEventListener('pointercancel', onUp, optsCap);
    root.removeEventListener('wheel', onWheel, optsEv);
    root.style.touchAction = '';
  };
}

function setupGalleryInteraction(root, camera, content) {
  const gallery = content.userData.gallery;
  const SWIPE = 40;
  let active = false;
  let sx = 0;
  let sy = 0;
  let lx = 0;
  let ly = 0;

  function onDown(e) {
    if (!content.visible) return;
    if (!hitTest(root, camera, content.userData.hitRoot, e.clientX, e.clientY)) return;
    active = true;
    sx = lx = e.clientX;
    sy = ly = e.clientY;
    if (e.cancelable) e.preventDefault();
  }
  function onMove(e) {
    if (!active) return;
    lx = e.clientX;
    ly = e.clientY;
    if (e.cancelable) e.preventDefault();
  }
  function onUp() {
    if (!active) return;
    active = false;
    // Let current crossfade finish — avoids choppy stacked transitions
    if (gallery.isAnimating && gallery.isAnimating()) return;
    const dx = lx - sx;
    const dy = ly - sy;
    if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= SWIPE) {
      if (dx < 0) gallery.next();
      else gallery.prev();
    } else if (Math.abs(dy) >= SWIPE) {
      if (dy < 0) gallery.next();
      else gallery.prev();
    }
  }
  function onWheel(e) {
    if (!content.visible) return;
    if (!hitTest(root, camera, content.userData.hitRoot, e.clientX, e.clientY)) return;
    e.preventDefault();
    if (gallery.isAnimating && gallery.isAnimating()) return;
    if (e.deltaY > 8 || e.deltaX > 8) gallery.next();
    else if (e.deltaY < -8 || e.deltaX < -8) gallery.prev();
  }

  const opts = { passive: false };
  root.addEventListener('pointerdown', onDown, opts);
  window.addEventListener('pointermove', onMove, opts);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  root.addEventListener('wheel', onWheel, opts);
  root.style.touchAction = 'none';
  log.info('UI', 'Gallery swipe/scroll ready');
  return function () {
    root.removeEventListener('pointerdown', onDown, opts);
    window.removeEventListener('pointermove', onMove, opts);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    root.removeEventListener('wheel', onWheel, opts);
    root.style.touchAction = '';
  };
}

let active = null;

export async function startWebAR(markerId) {
  if (active) {
    log.warn('MindAR', 'Restarting');
    await stopWebAR();
  }
  if (log.clear) log.clear();

  const id = markerId || 'demo';
  const target = resolveTarget(id);
  log.info('App', 'Start', { markerId: id, type: target.type });
  setChip('marker-chip', 'marker: ' + id);
  setChip('xr-chip', 'type: ' + target.type);

  if (!window.isSecureContext) {
    const msg = 'Need HTTPS or localhost for camera';
    setHint(msg);
    throw new Error(msg);
  }

  const root = document.getElementById('ar-root');
  root.innerHTML = '';

  setHint('Requesting camera...');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment' },
    });
    stream.getTracks().forEach(function (t) { t.stop(); });
    log.ok('Camera', 'Permission OK');
  } catch (e) {
    setHint('Camera permission failed');
    throw e;
  }

  // Stabilization: lower filterMinCF / filterBeta = less jitter (slightly more lag)
  const mindarThree = new MindARThree({
    container: root,
    imageTargetSrc: target.mindUrl,
    uiLoading: 'no',
    uiScanning: 'no',
    uiError: 'no',
    // Stronger one-euro style filtering → calmer pose while marker is tracked
    filterMinCF: 0.0001,
    filterBeta: 0.001,
    warmupTolerance: 8,
    missTolerance: 15,
  });
  log.ok('MindAR', 'Created (smoothed tracking)', {
    mind: target.mindUrl,
    filterMinCF: 0.0001,
    filterBeta: 0.001,
  });

  const renderer = mindarThree.renderer;
  const scene = mindarThree.scene;
  const camera = mindarThree.camera;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.background = 'transparent';
  // Better GLB color / metal response (Three r152+)
  if ('outputColorSpace' in renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else if ('outputEncoding' in renderer) {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  if ('toneMapping' in renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
  }

  let content;
  if (target.type === 'gallery') {
    content = await buildGalleryContent(target.images || []);
  } else if (target.type === 'model') {
    content = await buildModelContent({
      modelUrl: target.modelUrl,
      fitSize: target.fitSize,
      scrollAnim: !!target.scrollAnim,
    });
  } else if (target.type === 'video') {
    content = await buildVideoContent({
      videoUrl: target.videoUrl,
      keyColor: target.keyColor,
      keyDark: target.keyDark,
      similarity: target.similarity,
      smoothness: target.smoothness,
      planeWidth: target.planeWidth,
    });
  } else {
    content = buildCubeContent();
  }
  content.visible = false;
  content.userData.pinned = false;
  // Soft-follow in scene (not hard-parented to anchor) for extra stability
  scene.add(content);

  const anchor = mindarThree.addAnchor(0);
  let tracking = false;
  let poseSnapped = false;
  const smoothPos = new THREE.Vector3();
  const smoothQuat = new THREE.Quaternion();
  const smoothScale = new THREE.Vector3(1, 1, 1);
  const targetPos = new THREE.Vector3();
  const targetQuat = new THREE.Quaternion();
  const targetScale = new THREE.Vector3();
  // Extra soft-follow on top of MindAR filter (lower = calmer, more lag).
  // Models get heavier damping — marker tracking noise shows more on 3D.
  const POSE_SMOOTH_HZ = (target.type === 'gallery' || target.type === 'video') ? 6 : 4;

  function isPinned() {
    return !!content.userData.pinned;
  }

  // ---- Simple pin: keep last pose when marker lost. No wrist / MediaPipe. ----
  function applyPinUi(pinned, source) {
    setUnpinButtonVisible(pinned);
    if (pinned) {
      setChip('xr-chip', 'pinned');
      setHint('Pinned. Scroll = anim · side-drag = rotate · Unpin / double-tap to release.');
      log.ok('UI', 'Object PINNED' + (source ? ' via ' + source : ''));
    } else if (tracking) {
      content.visible = true;
      poseSnapped = false; // re-snap to marker next frame
      setChip('xr-chip', 'tracker: FOUND');
      if (content.userData.scrollAnim) {
        setHint('Unpinned. Scroll = anim · side-drag = rotate · Long-press = pin');
      } else if (content.userData.mode === 'model') {
        setHint('Unpinned. Following marker again. Long-press to pin.');
      } else {
        setHint('Unpinned. Long-press to pin.');
      }
      log.ok('UI', 'Object UNPINNED' + (source ? ' via ' + source : ''));
    } else {
      content.visible = false;
      setChip('xr-chip', 'tracker: searching...');
      setHint('Unpinned. Point camera at the marker to place again.');
      log.ok('UI', 'Object UNPINNED' + (source ? ' via ' + source : ''));
    }
  }

  let lastForceUnpinAt = 0;
  function forceUnpin(source) {
    const now = Date.now();
    if (now - lastForceUnpinAt < 250) return;
    lastForceUnpinAt = now;

    const src = source || 'button';
    log.info('UI', 'forceUnpin', { src: src, wasPinned: !!content.userData.pinned });
    if (!content.userData.pinned) {
      setUnpinButtonVisible(false);
      return;
    }
    content.userData.pinned = false;
    applyPinUi(false, src);
  }

  // Single hook used by overlay button + double-tap
  activeUnpinFn = forceUnpin;
  setUnpinButtonVisible(false);

  // Direct DOM wire — pointerdown is the most reliable on iOS Safari AR
  const unpinBtnEl = document.getElementById('unpin-btn');
  function onUnpinDom(e) {
    if (e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
    forceUnpin('button');
  }
  if (unpinBtnEl) {
    unpinBtnEl.addEventListener('pointerdown', onUnpinDom, true);
    unpinBtnEl.addEventListener('click', onUnpinDom, true);
  }

  function onPinChange(pinned) {
    // Gesture path already set content.userData.pinned via setPinned()
    applyPinUi(pinned, pinned ? 'long-press' : 'gesture');
  }

  let disposeInteraction = function () {};
  if (content.userData.mode === 'gallery') {
    disposeInteraction = setupGalleryInteraction(root, camera, content);
  } else if (content.userData.mode === 'video') {
    disposeInteraction = setupVideoInteraction(root, camera, content);
  } else if (content.userData.mode === 'model' && content.userData.scrollAnim) {
    disposeInteraction = setupModelScrollAnimInteraction(root, camera, content, {
      enablePin: true,
      onPinChange: onPinChange,
    });
  } else {
    disposeInteraction = setupCubeInteraction(root, camera, content, {
      enablePin: content.userData.mode === 'model',
      onPinChange: onPinChange,
    });
  }

  anchor.onTargetFound = function () {
    tracking = true;
    poseSnapped = false;
    content.visible = true;
    if (isPinned()) {
      content.userData.pinned = false;
      setUnpinButtonVisible(false);
      log.info('UI', 'Marker found — pin cleared, following again');
    }
    log.ok('MindAR', 'FOUND', { id: id, type: target.type });
    if (target.type === 'gallery') {
      setHint('Swipe or scroll on the photo to change images.');
    } else if (target.type === 'model' && target.scrollAnim) {
      setHint('Scroll/drag up-down = play anim · side-drag = rotate · Long-press = pin');
    } else if (target.type === 'model') {
      setHint('Drag = rotate · Pinch = zoom · Long-press = pin');
    } else if (target.type === 'video') {
      setHint('Scroll / drag on the video to scrub playback. BG is keyed out.');
      if (content.userData.unlockVideo) {
        content.userData.unlockVideo().catch(function () {});
      }
    } else {
      setHint('Drag = rotate · Pinch/wheel = zoom');
    }
    setChip('xr-chip', 'tracker: FOUND');
  };
  anchor.onTargetLost = function () {
    tracking = false;
    poseSnapped = false;
    if (content.userData.cube) content.userData.cube.userData.dragging = false;

    if (isPinned()) {
      content.visible = true;
      log.ok('MindAR', 'LOST but PINNED — object retained');
      setHint('Pinned (no marker). Tap Unpin or double-tap to release.');
      setChip('xr-chip', 'pinned (no marker)');
      return;
    }

    content.visible = false;
    log.warn('MindAR', 'LOST');
    setHint('Marker lost. Point camera at the target image.');
    setChip('xr-chip', 'tracker: searching...');
  };

  setHint('Starting tracker...');
  try {
    await mindarThree.start();
    const videoEl = root.querySelector('video');
    log.ok('MindAR', 'Camera started', { hasVideo: !!videoEl });
    if (videoEl) {
      videoEl.style.zIndex = '0';
      videoEl.playsInline = true;
      videoEl.muted = true;
      videoEl.play().catch(function () {});
    }
    setHint('Point camera at the ' + (target.label || id) + ' marker.');
    setChip('xr-chip', 'tracker: searching...');
  } catch (e) {
    disposeInteraction();
    setHint('MindAR start failed');
    throw e;
  }

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(function () {
    const dt = clock.getDelta();

    // Marker follow only when NOT pinned (pin freezes last pose → rock-solid)
    if (tracking && content.visible && !isPinned()) {
      anchor.group.updateWorldMatrix(true, false);
      anchor.group.matrixWorld.decompose(targetPos, targetQuat, targetScale);
      if (!poseSnapped) {
        smoothPos.copy(targetPos);
        smoothQuat.copy(targetQuat);
        smoothScale.copy(targetScale);
        poseSnapped = true;
      } else {
        // Frame-rate independent damping: alpha = 1 - exp(-hz * dt)
        const alpha = 1 - Math.exp(-POSE_SMOOTH_HZ * Math.min(Math.max(dt, 0), 0.05));
        smoothPos.lerp(targetPos, alpha);
        smoothQuat.slerp(targetQuat, alpha);
        smoothScale.lerp(targetScale, alpha);
      }
      content.position.copy(smoothPos);
      content.quaternion.copy(smoothQuat);
      content.scale.copy(smoothScale);
    }

    // Auto-play mixers only (scroll-anim models are driven manually via scrub)
    if (content.visible && content.userData.mixer && !content.userData.scrollAnim) {
      content.userData.mixer.update(dt);
    }

    if (content.visible && content.userData.gallery && content.userData.gallery.update) {
      content.userData.gallery.update(dt);
    }
    if (content.visible && content.userData.update) {
      content.userData.update(dt);
    }

    if (content.visible && content.userData.videoTex) {
      content.userData.videoTex.needsUpdate = true;
    }

    renderer.render(scene, camera);
  });

  active = {
    dispose: async function () {
      try {
        disposeInteraction();
        activeUnpinFn = null;
        if (unpinBtnEl) {
          unpinBtnEl.removeEventListener('pointerdown', onUnpinDom, true);
          unpinBtnEl.removeEventListener('click', onUnpinDom, true);
        }
        setUnpinButtonVisible(false);
        if (content && content.userData && content.userData.video) {
          try {
            content.userData.video.pause();
            content.userData.video.removeAttribute('src');
            content.userData.video.load();
          } catch (e) {}
        }
        renderer.setAnimationLoop(null);
        mindarThree.stop();
      } catch (e) {}
      root.innerHTML = '';
    },
  };
  return true;
}

export async function stopWebAR() {
  if (!active) return;
  const dispose = active.dispose;
  active = null;
  await dispose();
  log.ok('App', 'WebAR stopped');
}

