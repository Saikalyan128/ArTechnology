import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// Node: need FileLoader arraybuffer from fs
import { fileURLToPath as f } from 'url';

const url = process.argv[2] || 'assets/3D_motion/boccia_titanium_wrist_watch__animatable.glb';
const abs = path.resolve(url);
const buf = fs.readFileSync(abs);
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

// Patch loader for node
const loader = new GLTFLoader();
const gltf = await new Promise((resolve, reject) => {
  loader.parse(arrayBuffer, '', resolve, reject);
});

const scene = gltf.scene;
scene.updateMatrixWorld(true);

const boxAll = new THREE.Box3().setFromObject(scene);
const sizeAll = boxAll.getSize(new THREE.Vector3());
const centerAll = boxAll.getCenter(new THREE.Vector3());

const meshBox = new THREE.Box3();
let meshCount = 0;
let matNames = new Set();
scene.traverse((o) => {
  if (o.isMesh) {
    meshCount++;
    o.updateWorldMatrix(true, false);
    const b = new THREE.Box3().setFromObject(o);
    meshBox.union(b);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      matNames.add(m.type + ':' + (m.name || ''));
      if (m.map) matNames.add('map:' + (m.map.name || 'yes'));
    });
  }
});
const sizeMesh = meshBox.isEmpty() ? new THREE.Vector3() : meshBox.getSize(new THREE.Vector3());
const centerMesh = meshBox.isEmpty() ? new THREE.Vector3() : meshBox.getCenter(new THREE.Vector3());

console.log('file', abs);
console.log('anims', (gltf.animations || []).map((a) => a.name + ':' + a.duration.toFixed(2) + 's'));
console.log('meshCount', meshCount);
console.log('bbox_all', sizeAll.toArray().map((n) => +n.toFixed(4)));
console.log('center_all', centerAll.toArray().map((n) => +n.toFixed(4)));
console.log('bbox_mesh', sizeMesh.toArray().map((n) => +n.toFixed(4)));
console.log('center_mesh', centerMesh.toArray().map((n) => +n.toFixed(4)));
console.log('materials', [...matNames].slice(0, 20));
console.log('emptyMeshBox', meshBox.isEmpty());
