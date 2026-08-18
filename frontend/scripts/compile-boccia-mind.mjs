/**
 * Compile assets/targets/boccia.png → boccia.mind without native canvas.
 * Uses MindAR OfflineCompiler CPU path + pngjs mock canvas.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import { CompilerBase } from '../node_modules/mind-ar/src/image-target/compiler-base.js';
import { buildTrackingImageList } from '../node_modules/mind-ar/src/image-target/image-list.js';
import { extractTrackingFeatures } from '../node_modules/mind-ar/src/image-target/tracker/extract-utils.js';
import '../node_modules/mind-ar/src/image-target/detector/kernels/cpu/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pngPath = path.join(root, 'assets/targets/boccia.png');
const outPath = path.join(root, 'assets/targets/boccia.mind');

function loadPngImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const png = PNG.sync.read(buf);
  // Fake HTMLImageElement-like object for CompilerBase
  return {
    width: png.width,
    height: png.height,
    _rgba: png.data, // Buffer RGBA
  };
}

class NodeCompiler extends CompilerBase {
  createProcessCanvas(img) {
    const w = img.width;
    const h = img.height;
    let pixels = img._rgba;
    return {
      width: w,
      height: h,
      getContext() {
        return {
          drawImage(source) {
            if (source && source._rgba) pixels = source._rgba;
          },
          getImageData() {
            // ImageData-like { data: Uint8ClampedArray|Buffer }
            return { data: pixels, width: w, height: h };
          },
        };
      },
    };
  }

  compileTrack({ progressCallback, targetImages, basePercent }) {
    const percentPerImage = (100 - basePercent) / targetImages.length;
    let percent = 0;
    const list = [];
    for (let i = 0; i < targetImages.length; i++) {
      const imageList = buildTrackingImageList(targetImages[i]);
      const percentPerAction = percentPerImage / imageList.length;
      const trackingData = extractTrackingFeatures(imageList, () => {
        percent += percentPerAction;
        progressCallback(basePercent + percent);
      });
      list.push(trackingData);
    }
    return Promise.resolve(list);
  }
}

const img = loadPngImage(pngPath);
console.log('compile', pngPath, img.width + 'x' + img.height);
const compiler = new NodeCompiler();
await compiler.compileImageTargets([img], (p) => {
  if (Math.round(p) % 10 === 0) console.log('progress', Math.round(p) + '%');
});
const buffer = compiler.exportData();
fs.writeFileSync(outPath, Buffer.from(buffer));
console.log('wrote', outPath, fs.statSync(outPath).size, 'bytes');
