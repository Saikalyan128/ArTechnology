/**
 * MediaPipe Hands → wrist pose for AR try-on.
 * Uses the same camera <video> as MindAR (environment / rear cam).
 * Point the camera at a wrist after pinning the watch.
 */
import * as THREE from 'three';

const HANDS_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240';
const log = window.AppLogger || console;

let handsScriptPromise = null;

function loadHandsScript() {
  if (window.Hands) return Promise.resolve();
  if (handsScriptPromise) return handsScriptPromise;
  handsScriptPromise = new Promise(function (resolve, reject) {
    const s = document.createElement('script');
    s.src = HANDS_CDN + '/hands.js';
    s.async = true;
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error('Failed to load MediaPipe Hands')); };
    document.head.appendChild(s);
  });
  return handsScriptPromise;
}

/**
 * @param {HTMLVideoElement} videoEl
 * @param {THREE.Camera} camera
 * @returns {{ start: Function, stop: Function, poll: Function, dispose: Function }}
 */
export async function createWristTracker(videoEl, camera) {
  await loadHandsScript();
  if (!window.Hands) throw new Error('MediaPipe Hands not available');

  const hands = new window.Hands({
    locateFile: function (file) {
      return HANDS_CDN + '/' + file;
    },
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.5,
  });

  let latest = null; // { position: Vector3, quaternion: Quaternion, score: number }
  let busy = false;
  let running = false;
  let raf = 0;
  let frameSkip = 0;
  // Run MediaPipe every N frames (keeps UI smooth on phones)
  const DETECT_EVERY = 2;

  const _camPos = new THREE.Vector3();
  const _ndc = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _x = new THREE.Vector3();
  const _y = new THREE.Vector3();
  const _z = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();

  hands.onResults(function (results) {
    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
      latest = null;
      return;
    }
    const lm = results.multiHandLandmarks[0];
    // 0 wrist, 5 index MCP, 9 middle MCP, 17 pinky MCP
    const wrist = lm[0];
    const indexMcp = lm[5];
    const middleMcp = lm[9];
    const pinkyMcp = lm[17];

    // Screen NDC of wrist (MediaPipe x right, y down → NDC y up)
    const ndcX = wrist.x * 2 - 1;
    const ndcY = -(wrist.y * 2 - 1);

    // 2D hand orientation in image (camera-facing)
    const fx = middleMcp.x - wrist.x;
    const fy = -(middleMcp.y - wrist.y);
    const ax = indexMcp.x - pinkyMcp.x;
    const ay = -(indexMcp.y - pinkyMcp.y);
    const span = Math.hypot(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y) || 0.1;

    // Camera-local basis: face the camera so model stays visible
    _z.set(fx, fy, 0);
    if (_z.lengthSq() < 1e-8) _z.set(0, 1, 0); else _z.normalize();
    _x.set(ax, ay, 0);
    if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0); else _x.normalize();
    _y.crossVectors(_z, _x);
    if (_y.lengthSq() < 1e-8) {
      _y.set(0, 0, 1);
    } else {
      _y.normalize();
      if (_y.z < 0) { _y.negate(); _x.negate(); }
    }
    _x.crossVectors(_y, _z).normalize();
    _m.makeBasis(_x, _y, _z);
    _q.setFromRotationMatrix(_m);

    // Caller places at pinned depth using ndc + camera (avoids wrong 3D jump)
    latest = {
      ndcX: ndcX,
      ndcY: ndcY,
      camQuat: _q.clone(),
      span: span,
      // Keep legacy fields null so webar knows to use NDC path
      position: null,
      quaternion: null,
    };
  });

  async function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (busy || !videoEl || videoEl.readyState < 2) return;
    frameSkip = (frameSkip + 1) % DETECT_EVERY;
    if (frameSkip !== 0) return;
    busy = true;
    try {
      await hands.send({ image: videoEl });
    } catch (e) {
      // ignore frame errors
    }
    busy = false;
  }

  return {
    start: function () {
      if (running) return;
      running = true;
      log.ok && log.ok('Wrist', 'Hand tracker started — show your wrist to the camera');
      tick();
    },
    stop: function () {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      latest = null;
      log.info && log.info('Wrist', 'Hand tracker stopped');
    },
    /** @returns {{position:THREE.Vector3, quaternion:THREE.Quaternion}|null} */
    getPose: function () {
      return latest;
    },
    dispose: function () {
      this.stop();
      try { hands.close && hands.close(); } catch (e) {}
    },
  };
}
