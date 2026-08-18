/**
 * Console-only logger (Chrome DevTools / remote inspect). No on-screen panel.
 */
(function (global) {
  const LEVELS = {
    info: { label: 'INFO', consoleFn: 'info' },
    ok: { label: 'OK  ', consoleFn: 'log' },
    warn: { label: 'WARN', consoleFn: 'warn' },
    error: { label: 'ERR ', consoleFn: 'error' },
  };

  function write(level, scope, message, data) {
    const meta = LEVELS[level] || LEVELS.info;
    const prefix = '[' + meta.label + '] [' + scope + ']';
    const fn = console[meta.consoleFn] || console.log;
    if (data !== undefined) fn(prefix, message, data);
    else fn(prefix, message);
  }

  global.AppLogger = {
    info: function (scope, msg, data) { write('info', scope, msg, data); },
    ok: function (scope, msg, data) { write('ok', scope, msg, data); },
    warn: function (scope, msg, data) { write('warn', scope, msg, data); },
    error: function (scope, msg, data) { write('error', scope, msg, data); },
    clear: function () {
      if (typeof console.clear === 'function') console.clear();
    },
  };
})(window);
