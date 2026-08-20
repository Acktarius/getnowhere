package im.getnowhere.app.backgroundsync

import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Holds the WebView inject hook registered from the Expo shell.
 * When absent (process killed / UI not ready), sync is a no-op success.
 */
object RemoteNodeSyncBridgeHolder {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val injectScript = AtomicReference<((String) -> Unit)?>(null)
    private val pending = ConcurrentHashMap<String, (RemoteNodeSyncOutcome) -> Unit>()

    fun setScriptInjector(injector: ((String) -> Unit)?) {
        injectScript.set(injector)
    }

    fun resolveRequest(requestId: String, outcome: RemoteNodeSyncOutcome) {
        pending.remove(requestId)?.invoke(outcome)
    }

    fun parseOutcome(raw: String?): RemoteNodeSyncOutcome =
        when (raw?.lowercase()) {
            "completed", "no_change" -> RemoteNodeSyncOutcome.COMPLETED
            "skipped_in_progress" -> RemoteNodeSyncOutcome.SKIPPED_IN_PROGRESS
            "no_op" -> RemoteNodeSyncOutcome.NO_OP
            "retryable" -> RemoteNodeSyncOutcome.RETRYABLE
            else -> RemoteNodeSyncOutcome.FAILURE
        }

    suspend fun requestBackgroundSync(timeoutMs: Long): RemoteNodeSyncOutcome {
        val injector = injectScript.get()
        if (injector == null) {
            return RemoteNodeSyncOutcome.NO_OP
        }
        val requestId = "bg-sync-${System.nanoTime()}"
        return suspendCancellableCoroutine { cont ->
            pending[requestId] = { outcome ->
                if (cont.isActive) cont.resume(outcome)
            }
            cont.invokeOnCancellation {
                pending.remove(requestId)
            }
            mainHandler.post {
                try {
                    injector(buildInjectScript(requestId))
                } catch (_: Exception) {
                    pending.remove(requestId)
                    if (cont.isActive) cont.resume(RemoteNodeSyncOutcome.RETRYABLE)
                }
            }
            mainHandler.postDelayed({
                if (pending.remove(requestId) != null && cont.isActive) {
                    cont.resume(RemoteNodeSyncOutcome.RETRYABLE)
                }
            }, timeoutMs)
        }
    }

    private fun buildInjectScript(requestId: String): String {
        val req = JSONObject.quote(requestId)
        val noOp = fallbackPostMessage(requestId, "no_op")
        val retry = fallbackPostMessage(requestId, "retryable")
        return (
            "(function(){try{if(window.gnhMobile&&window.gnhMobile._runBackgroundRemoteSync){" +
                "window.gnhMobile._runBackgroundRemoteSync($req);" +
                "}else{$noOp;}}catch(e){$retry;}})();true;"
        )
    }

    private fun fallbackPostMessage(requestId: String, outcome: String): String {
        val payload =
            JSONObject()
                .put("channel", "gnh-background-sync")
                .put("direction", "response")
                .put("requestId", requestId)
                .put("outcome", outcome)
                .toString()
        return (
            "window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(" +
                JSONObject.quote(payload) +
                ")"
        )
    }

    /** Blocking helper for unit tests. */
    internal fun awaitRequestForTest(requestId: String, timeoutMs: Long): RemoteNodeSyncOutcome? {
        val latch = CountDownLatch(1)
        var result: RemoteNodeSyncOutcome? = null
        pending[requestId] = {
            result = it
            latch.countDown()
        }
        latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        pending.remove(requestId)
        return result
    }
}
