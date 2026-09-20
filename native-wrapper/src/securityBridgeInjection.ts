/** Injected gnhMobile security API fragment (biometric, securePrefs, lifecycle). */
export function securityBridgeInjectionJs(): string {
  return `
  var securityHandlers = {};
  var lifecycleHandlers = [];
  var lockGeneration = 0;
  var WALLET_FILE_TIMEOUT_MS = 15000;
  function nextRequestId() {
    return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }
  function postSecurity(channel, body, timeoutMs) {
    if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
      return Promise.reject(new Error('unsupported'));
    }
    var requestId = nextRequestId();
    return new Promise(function(resolve, reject) {
      var settled = false;
      var timer = 0;
      function settle(ok, value) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        delete securityHandlers[requestId];
        if (ok) resolve(value);
        else reject(value);
      }
      securityHandlers[requestId] = {
        resolve: function(result) { settle(true, result); },
        reject: function(err) { settle(false, err); }
      };
      if (timeoutMs) {
        timer = setTimeout(function() {
          settle(false, new Error('wallet-file-timeout'));
        }, timeoutMs);
      }
      var msg = Object.assign({ channel: channel, direction: 'command', requestId: requestId, lockGeneration: lockGeneration }, body);
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    });
  }
  window.gnhMobile.getLockGeneration = function() { return lockGeneration; };
  window.gnhMobile.setLockGeneration = function(n) { lockGeneration = n; };
  window.gnhMobile._resolveSecurity = function(result) {
    var id = result && result.requestId;
    if (!id || !securityHandlers[id]) return;
    var h = securityHandlers[id];
    delete securityHandlers[id];
    if (result.error) h.reject(new Error(result.error));
    else h.resolve(result);
  };
  window.gnhMobile.biometric = {
    isAvailable: function(purpose) {
      return postSecurity('gnh-biometric', { action: 'isAvailable', purpose: purpose || 'data' });
    },
    enrollDataUnlock: function(walletId, password) {
      return postSecurity('gnh-biometric', { action: 'enrollDataUnlock', walletId: walletId, password: password });
    },
    unlockDataUnlock: function(walletId, credentialId) {
      return postSecurity('gnh-biometric', { action: 'unlockDataUnlock', walletId: walletId, credentialId: credentialId });
    },
    enrollAppAccess: function(passcode) {
      return postSecurity('gnh-biometric', { action: 'enrollAppAccess', passcode: passcode });
    },
    unlockAppAccess: function() {
      return postSecurity('gnh-biometric', { action: 'unlockAppAccess' });
    },
    removeCredential: function(credentialId) {
      return postSecurity('gnh-biometric', { action: 'removeCredential', credentialId: credentialId });
    }
  };
  window.gnhMobile.securePrefs = {
    get: function(key) { return postSecurity('gnh-secure-prefs', { action: 'get', key: key }); },
    set: function(key, value) { return postSecurity('gnh-secure-prefs', { action: 'set', key: key, value: value }); },
    remove: function(key) { return postSecurity('gnh-secure-prefs', { action: 'remove', key: key }); }
  };
  window.gnhMobile.walletFile = {
    exists: function() { return postSecurity('gnh-wallet-file', { action: 'exists' }, WALLET_FILE_TIMEOUT_MS); },
    read: function() { return postSecurity('gnh-wallet-file', { action: 'read' }, WALLET_FILE_TIMEOUT_MS); },
    write: function(value) { return postSecurity('gnh-wallet-file', { action: 'write', value: value }, WALLET_FILE_TIMEOUT_MS); },
    remove: function() { return postSecurity('gnh-wallet-file', { action: 'remove' }, WALLET_FILE_TIMEOUT_MS); }
  };
  window.gnhMobile.copySensitive = function(value) {
    return postSecurity('gnh-privacy', { action: 'copySensitive', value: value });
  };
  window.gnhMobile.clearClipboard = function() {
    return postSecurity('gnh-privacy', { action: 'clearClipboard' });
  };
  window.gnhMobile.setBlurInAppSwitcher = function(enabled) {
    if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      channel: 'gnh-privacy',
      direction: 'event',
      type: 'setBlurInAppSwitcher',
      enabled: !!enabled
    }));
  };
  window.gnhMobile.onLifecycle = function(handler) {
    lifecycleHandlers.push(handler);
    return function() {
      var i = lifecycleHandlers.indexOf(handler);
      if (i >= 0) lifecycleHandlers.splice(i, 1);
    };
  };
  window.gnhMobile._dispatchLifecycleEvent = function(evt) {
    for (var i = 0; i < lifecycleHandlers.length; i++) {
      try { lifecycleHandlers[i](evt); } catch (e) {}
    }
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          channel: 'gnh-lifecycle',
          direction: 'event',
          type: 'lifecycle-delivered',
          deliveredType: evt && evt.type
        }));
      }
    } catch (e) {}
  };`;
}

/** Inject native lifecycle event into WebView. */
export function buildLifecycleDispatchScript(
  type: string,
  backgroundElapsedMs?: number,
): string {
  const evt =
    typeof backgroundElapsedMs === "number" && backgroundElapsedMs >= 0
      ? `{type:${JSON.stringify(type)},backgroundElapsedMs:${Math.floor(backgroundElapsedMs)}}`
      : `{type:${JSON.stringify(type)}}`;
  return `(function(){try{window.gnhMobile&&window.gnhMobile._dispatchLifecycleEvent(${evt});}catch(e){}})();true;`;
}
