package im.getnowhere.app.ntfywake

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import im.getnowhere.app.backgroundsync.RemoteNodeBackgroundSyncScheduler
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** RN bridge: subscribe to per-room ntfy SSE streams; triggers background sync on wake message. @see docs/features/peer-wake-notification.md */
class GnhNtfyWakeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "GnhNtfyWake"
        private const val BACKOFF_CAP_MS = 60_000L
    }

    override fun getName(): String = NAME

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.SECONDS)
        .build()

    private val connections = ConcurrentHashMap<String, EventSource>()

    private val wakeHandler = NtfyWakeHandler(onWake = {
        val ctx = reactApplicationContext.applicationContext
        RemoteNodeBackgroundSyncScheduler.scheduleSoonRemoteNodeSync(ctx)
    })

    @ReactMethod
    fun subscribe(roomId: String, topic: String, token: String) {
        connections.remove(roomId)?.cancel()
        connectSse(roomId, topic, token, 0L)
    }

    @ReactMethod
    fun unsubscribe(roomId: String) {
        connections.remove(roomId)?.cancel()
    }

    @ReactMethod
    fun unsubscribeAll() {
        val keys = connections.keys.toList()
        for (key in keys) connections.remove(key)?.cancel()
    }

    private fun connectSse(roomId: String, topic: String, token: String, delayMs: Long) {
        if (delayMs > 0) Thread.sleep(delayMs)
        val reqBuilder = Request.Builder().url("$topic/json")
        if (token.isNotBlank()) reqBuilder.header("Authorization", "Bearer $token")
        val request = reqBuilder.build()
        val listener = object : EventSourceListener() {
            override fun onEvent(
                eventSource: EventSource,
                id: String?,
                type: String?,
                data: String,
            ) {
                wakeHandler.handle(id, data)
            }

            override fun onFailure(
                eventSource: EventSource,
                t: Throwable?,
                response: Response?,
            ) {
                if (!connections.containsKey(roomId)) return
                val next = (delayMs * 2).coerceIn(1_000L, BACKOFF_CAP_MS)
                connectSse(roomId, topic, token, next)
            }
        }
        val es = EventSources.createFactory(client).newEventSource(request, listener)
        connections[roomId] = es
    }
}
