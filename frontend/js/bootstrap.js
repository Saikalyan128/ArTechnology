/**
 * ESM entry — loaded as <script type="module"> so import maps apply reliably
 * on Android Chrome (dynamic import() from classic scripts is flaky there).
 */
const log = window.AppLogger;

function showBootFail(err) {
  var msg = err && err.message ? err.message : String(err);
  console.error('[WebAR bootstrap]', err);
  if (log && log.error) log.error('App', 'ESM bootstrap failed', msg);
  var el = document.getElementById('boot-error');
  if (el) {
    el.style.display = 'block';
    el.textContent = 'Library load failed: ' + msg;
  }
  if (typeof window.__rejectWebAR === 'function') {
    try { window.__rejectWebAR(err); } catch (e) {}
  }
}

try {
  const webar = await import('./webar.js');
  window.WebAR = {
    startWebAR: webar.startWebAR,
    stopWebAR: webar.stopWebAR,
    requestUnpin: webar.requestUnpin,
  };
  window.WebARReady = true;
  if (typeof window.__resolveWebAR === 'function') {
    try { window.__resolveWebAR(window.WebAR); } catch (e) {}
  }
  if (log && log.ok) log.ok('App', 'WebAR ESM bootstrap ready');
} catch (err) {
  showBootFail(err);
}
