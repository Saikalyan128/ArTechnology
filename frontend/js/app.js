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
  var badge = document.getElementById('secure-badge');
  var demoBtn = document.getElementById('demo-btn');
  var galleryBtn = document.getElementById('gallery-btn');
  var watchBtn = document.getElementById('watch-btn');
  var bocciaBtn = document.getElementById('boccia-btn');
  var bocciaLogoBtn = document.getElementById('boccia-logo-btn');
  var motionBtn = document.getElementById('motion-btn');
  var backBtn = document.getElementById('back-btn');
  var unpinBtn = document.getElementById('unpin-btn');
  var bootError = document.getElementById('boot-error');

  var starting = false;
  var webarApi = null;

  // Loading overlay
  var arLoading = document.getElementById('ar-loading');

  function showArLoading() {
    if (!arLoading) return;
    arLoading.classList.remove('hidden');
  }

  function hideArLoading() {
    if (!arLoading) return;
    // Fade out then fully hide so it doesn't block taps
    arLoading.classList.add('hidden');
    setTimeout(function () { arLoading.style.display = 'none'; }, 450);
  }

  // Watch picker elements
  var watchPicker = document.getElementById('watch-picker');
  var watchCards = watchPicker ? watchPicker.querySelectorAll('.watch-card') : [];

  /** Show the watch picker and wire tap-to-swap for boccia-style experiences */
  function showWatchPicker() {
    if (!watchPicker) return;
    // Reset to default (Boccia) selection
    watchCards.forEach(function (card) { card.classList.remove('active'); });
    if (watchCards.length > 0) watchCards[0].classList.add('active');
    watchPicker.classList.remove('hidden');
    if (viewAr) viewAr.classList.add('has-picker');
  }

  function hideWatchPicker() {
    if (!watchPicker) return;
    watchPicker.classList.add('hidden');
    if (viewAr) viewAr.classList.remove('has-picker');
  }

  // Bind watch card taps
  watchCards.forEach(function (card) {
    card.addEventListener('pointerdown', function (e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }, true);
    card.addEventListener('click', function (e) {
      e.stopPropagation();
      var modelUrl = card.getAttribute('data-model');
      if (!modelUrl) return;
      // Update active highlight immediately for responsiveness
      watchCards.forEach(function (c) { c.classList.remove('active'); });
      card.classList.add('active');
      // Swap the model in the running AR session
      if (webarApi && typeof webarApi.swapModel === 'function') {
        log.info('UI', 'swapModel', modelUrl);
        webarApi.swapModel(modelUrl).catch(function (err) {
          log.error('UI', 'swapModel failed', String(err));
        });
      }
    });
  });

  function showBootError(msg) {
    if (!bootError) return;
    bootError.style.display = 'block';
    bootError.textContent = msg;
  }

  function setBusy(busy) {
    starting = busy;
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

  async function loadWebAR() {
    if (webarApi) return webarApi;
    log.info('App', 'Loading webar.js...');
    // Cache-bust the dynamic import so phones always fetch the latest module
    // instead of a stale cached copy (dynamic import() URLs aren't covered
    // by the static <script v=...> cache-busting on this page).
    webarApi = await import('./webar.js?v=' + Date.now());
    log.ok('App', 'webar.js loaded');
    return webarApi;
  }

  async function enterWebAR(markerId) {
    if (starting) return;
    var id = String(markerId || '').trim();
    if (!id) return;

    setBusy(true);
    log.ok('App', 'enterWebAR', id);

    try {
      showArView();
      hideWatchPicker();
      showArLoading();
      var api = await loadWebAR();
      await api.startWebAR(id);
      hideArLoading();
      log.ok('App', 'WebAR running');
      // Show watch selector only for boccia-type experiences
      if (id === 'boccia' || id === 'boccia-logo') {
        showWatchPicker();
      }
    } catch (err) {
      console.error(err);
      log.error('App', 'WebAR failed', String(err));
      var msg = err && err.message ? err.message : String(err);
      showBootError('WebAR failed: ' + msg);
      showScanView();
    } finally {
      setBusy(false);
    }
  }

  window.enterWebAR = enterWebAR;

  async function backToScan() {
    hideWatchPicker();
    hideArLoading();
    // Reset loading overlay display so it shows again next time
    if (arLoading) arLoading.style.display = '';
    try {
      if (webarApi) await webarApi.stopWebAR();
    } catch (e) {
      log.warn('App', 'stopWebAR error', String(e));
    }
    showScanView();
  }

  function checkSecureContext() {
    var secure = window.isSecureContext;
    if (badge) {
      badge.textContent = secure ? 'HTTPS / localhost' : 'NOT secure';
      badge.classList.add(secure ? 'ok' : 'fail');
    }
    log.info('Env', 'secure=' + secure + ' href=' + location.href);
  }

  function bind(el, fn) {
    if (!el) return;
    el.onclick = fn;
  }

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

  log.ok('UI', 'Buttons ready (cube + gallery + seiko + boccia + logo + motion + unpin)');

  checkSecureContext();
  // Temporary: skip home UI — open AR immediately for SHWAA logo → Boccia watch
  var bootId = new URLSearchParams(location.search).get('markerId') || 'boccia-logo';
  enterWebAR(bootId);
})();
