/** Injected gnhMobile security API fragment (biometric, securePrefs, lifecycle). */
export function securityBridgeInjectionJs(): string {
  return `
  var securityHandlers = {};
  var lifecycleHandlers = [];
  var lockGeneration = 0;
  function nextRequestId() {
    return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }
  function postSecurity(channel, body) {
    if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
      return Promise.reject(new Error('unsupported'));
    }
    var requestId = nextRequestId();
    return new Promise(function(resolve, reject) {
      securityHandlers[requestId] = { resolve: resolve, reject: reject };
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
