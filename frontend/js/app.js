/**
 * Classic boot script. Buttons bind immediately.
 * MindAR/Three load only on click via dynamic import('./webar.js').
 */
(function () {
  var log = window.AppLogger || {
    info: function () { console.log.apply(console, arguments); },
    ok: function () { console.log.apply(console, arguments); },
    warn: function () { console.warn.apply(console, arguments); },
    error: function () { console.error.apply(console, arguments); },
    clear: function () {},
  };

  var viewScan = document.getElementById('view-scan');
  var viewAr = document.getElementById('view-ar');
  var statusEl = document.getElementById('scan-status');
  var badge = document.getElementById('secure-badge');
  var openBtn = document.getElementById('open-btn');
  var demoBtn = document.getElementById('demo-btn');
  var galleryBtn = document.getElementById('gallery-btn');
  var watchBtn = document.getElementById('watch-btn');
  var bocciaBtn = document.getElementById('boccia-btn');
  var bocciaLogoBtn = document.getElementById('boccia-logo-btn');
  var motionBtn = document.getElementById('motion-btn');
  var backBtn = document.getElementById('back-btn');
  var unpinBtn = document.getElementById('unpin-btn');
  var markerInput = document.getElementById('marker-input');
  var bootError = document.getElementById('boot-error');

  var scanner = null;
  var scanning = false;
  var starting = false;
  var webarApi = null;

  function showBootError(msg) {
    if (!bootError) return;
    bootError.style.display = 'block';
    bootError.textContent = msg;
  }

  function setStatus(html) {
    if (statusEl) statusEl.innerHTML = html;
  }

  function setBusy(busy) {
    starting = busy;
    if (openBtn) openBtn.disabled = busy;
    if (demoBtn) demoBtn.disabled = busy;
    if (galleryBtn) galleryBtn.disabled = busy;
    if (watchBtn) watchBtn.disabled = busy;
    if (bocciaBtn) bocciaBtn.disabled = busy;
    if (bocciaLogoBtn) bocciaLogoBtn.disabled = busy;
    if (motionBtn) motionBtn.disabled = busy;
  }

  function showArView() {
    if (viewScan) viewScan.classList.add('hidden');
    if (viewAr) viewAr.classList.remove('hidden');
    document.body.classList.add('ar-mode');
  }

  function showScanView() {
    if (viewAr) viewAr.classList.add('hidden');
    if (viewScan) viewScan.classList.remove('hidden');
    document.body.classList.remove('ar-mode');
  }

  function parseScanResult(raw) {
    try {
      var text = String(raw);
      if (text.indexOf('markerId=') !== -1 || /^https?:/i.test(text)) {
        var url = new URL(text, window.location.href);
        var id = url.searchParams.get('markerId');
        if (id) return id.trim();
      }
    } catch (e) {
      log.warn('QR', 'URL parse failed', String(e));
    }
    return String(raw).trim();
  }

  async function stopScanner() {
    if (!scanner || !scanning) return;
    try {
      await scanner.stop();
    } catch (e) {
      log.warn('QR', 'Scanner stop error', String(e));
    }
    scanning = false;
  }

  async function loadWebAR() {
    if (webarApi) return webarApi;
    log.info('App', 'Loading webar.js...');
    setStatus('Loading WebAR libraries...');
    webarApi = await import('./webar.js');
    log.ok('App', 'webar.js loaded');
    return webarApi;
  }

  async function enterWebAR(markerId) {
    if (starting) return;
    var id = String(markerId || '').trim();
    if (!id) {
      setStatus('Enter a marker ID or use demo.');
      return;
    }

    setBusy(true);
    log.ok('App', 'enterWebAR', id);
    setStatus('Starting WebAR for <strong>' + id + '</strong>...');

    try {
      await stopScanner();
      showArView();
      var api = await loadWebAR();
      await api.startWebAR(id);
      setStatus('WebAR running.');
      log.ok('App', 'WebAR running');
    } catch (err) {
      console.error(err);
      log.error('App', 'WebAR failed', String(err));
      var msg = err && err.message ? err.message : String(err);
      setStatus('WebAR failed: ' + msg);
      showBootError('WebAR failed: ' + msg);
      showScanView();
      startScanner();
    } finally {
      setBusy(false);
    }
  }

  window.enterWebAR = enterWebAR;

  async function backToScan() {
    try {
      if (webarApi) await webarApi.stopWebAR();
    } catch (e) {
      log.warn('App', 'stopWebAR error', String(e));
    }
    showScanView();
    setStatus('Scanner restarting...');
    startScanner();
  }

  function checkSecureContext() {
    var secure = window.isSecureContext;
    if (badge) {
      badge.textContent = secure ? 'HTTPS / localhost' : 'NOT secure';
      badge.classList.add(secure ? 'ok' : 'fail');
    }
    log.info('Env', 'secure=' + secure + ' href=' + location.href);
  }

  async function startScanner() {
    if (typeof Html5Qrcode === 'undefined') {
      setStatus('QR lib missing. Use demo button.');
      return;
    }
    if (!scanner) scanner = new Html5Qrcode('qr-reader');
    if (scanning) return;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        function (decoded) {
          if (!scanning) return;
          scanning = false;
          scanner.stop().catch(function () {}).finally(function () {
            enterWebAR(parseScanResult(decoded));
          });
        },
        function () {}
      );
      scanning = true;
      setStatus('Scanner running.');
    } catch (err) {
      setStatus('Camera unavailable. Use demo button.');
      log.warn('QR', 'scanner failed', String(err));
    }
  }

  function bind(el, fn) {
    if (!el) return;
    el.onclick = fn;
  }

  bind(openBtn, function () {
    log.info('UI', 'open clicked');
    enterWebAR(markerInput && markerInput.value ? markerInput.value : 'demo');
  });
  bind(demoBtn, function () {
    log.info('UI', 'demo clicked');
    enterWebAR('demo');
  });
  bind(galleryBtn, function () {
    log.info('UI', 'gallery clicked');
    enterWebAR('gallery');
  });
  bind(watchBtn, function () {
    log.info('UI', 'watch clicked');
    enterWebAR('watch');
  });
  bind(bocciaBtn, function () {
    log.info('UI', 'boccia clicked');
    enterWebAR('boccia');
  });
  bind(bocciaLogoBtn, function () {
    log.info('UI', 'boccia-logo clicked');
    enterWebAR('boccia-logo');
  });
  bind(motionBtn, function () {
    log.info('UI', 'motion clicked');
    enterWebAR('motion');
  });
  bind(backBtn, function () {
    backToScan();
  });

  // Unpin FAB — fire immediately on pointerdown (most reliable on mobile AR)
  var lastUnpinAt = 0;
  async function doUnpin() {
    var now = Date.now();
    if (now - lastUnpinAt < 400) return;
    lastUnpinAt = now;
    try {
      var api = webarApi || (await loadWebAR());
      if (api && typeof api.requestUnpin === 'function') {
        log.info('UI', 'doUnpin → requestUnpin');
        api.requestUnpin();
      } else {
        log.warn('UI', 'requestUnpin missing on webar api');
      }
    } catch (err) {
      log.error('UI', 'unpin failed', String(err));
    }
  }

  if (unpinBtn) {
    function onUnpinEvt(e) {
      if (e) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }
      log.info('UI', 'unpin ' + (e && e.type ? e.type : 'evt'));
      doUnpin();
    }
    unpinBtn.addEventListener('pointerdown', onUnpinEvt, true);
    unpinBtn.addEventListener('click', onUnpinEvt, true);
  }

  if (markerInput) {
    markerInput.onkeydown = function (e) {
      if (e.key === 'Enter') enterWebAR(e.target.value);
    };
  }

  log.ok('UI', 'Buttons ready (cube + gallery + seiko + boccia + logo + motion + unpin)');
  setStatus('Ready. Boccia = boccia.png · Boccia logo = shwaa-logo.png · Seiko = watch marker.');

  checkSecureContext();
  var bootId = new URLSearchParams(location.search).get('markerId');
  if (bootId) enterWebAR(bootId);
  else startScanner();
})();
