package im.getnowhere.app.backgroundsync

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/** RN bridge: register WebView injector + receive background-sync responses. */
class GnhBackgroundSyncModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "GnhBackgroundSync"

    @ReactMethod
    fun registerWebViewInjector() {
        RemoteNodeSyncBridgeHolder.setScriptInjector { script ->
            if (reactApplicationContext.hasActiveReactInstance()) {
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("gnhBackgroundSyncInject", script)
            }
        }
    }

    @ReactMethod
    fun clearWebViewInjector() {
        RemoteNodeSyncBridgeHolder.setScriptInjector(null)
    }

    @ReactMethod
    fun resolveBackgroundSync(requestId: String, outcome: String) {
        RemoteNodeSyncBridgeHolder.resolveRequest(
            requestId,
            RemoteNodeSyncBridgeHolder.parseOutcome(outcome),
        )
    }
}
