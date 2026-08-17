/**
 * WebView injection for window.gnhMobile bridge (before Vite UI loads).
 * @see docs/architecture/mobile-p2p-runtime.md
 */
import { securityBridgeInjectionJs } from "./securityBridgeInjection";

/** Build injected JS: gnhMobile API with bridge token held in closure (not on window). */
export function buildMobileBridgeInjection(bridgeToken: string): string {
  const tokenJson = JSON.stringify(bridgeToken);
  const securityJs = securityBridgeInjectionJs();
  return `(function(){
  if (window.gnhMobile) return;
  var token = ${tokenJson};
  var handlers = [];
  var saveHandlers = [];
  window.gnhMobile = {
    saveTextFile: function(opts) {
      if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        channel: 'gnh-file',
        direction: 'command',
        requestId: opts.requestId,
        filename: opts.filename,
        content: opts.content
      }));
    },
    _onSaveTextFile: function(handler) {
      saveHandlers.push(handler);
      return function() {
        var i = saveHandlers.indexOf(handler);
        if (i >= 0) saveHandlers.splice(i, 1);
      };
    },
    _resolveSaveTextFile: function(result) {
      for (var i = 0; i < saveHandlers.length; i++) {
        try { saveHandlers[i](result); } catch (e) {}
      }
    },
    sendCommand: function(cmd) {
      if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
      var msg = { channel: 'gnh-bridge', direction: 'command', token: token, type: cmd.type };
      if (cmd.topicRef !== undefined) msg.topicRef = cmd.topicRef;
      if (cmd.roomId !== undefined) msg.roomId = cmd.roomId;
      if (cmd.payload !== undefined) msg.payload = cmd.payload;
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    },
    onBridgeEvent: function(handler) {
      handlers.push(handler);
      return function() {
        var i = handlers.indexOf(handler);
        if (i >= 0) handlers.splice(i, 1);
      };
    },
    _dispatchBridgeEvent: function(evt) {
      for (var i = 0; i < handlers.length; i++) {
        try { handlers[i](evt); } catch (e) {}
      }
    }
  };
  ${securityJs}
})();true;`;
}

/** Dispatch a sidecar event into the WebView main world. */
export function buildBridgeEventDispatchScript(event: object): string {
  return `(function(){try{window.gnhMobile&&window.gnhMobile._dispatchBridgeEvent(${JSON.stringify(event)});}catch(e){}})();true;`;
}
