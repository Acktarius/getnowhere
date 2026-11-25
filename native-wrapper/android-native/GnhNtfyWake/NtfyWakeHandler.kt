package im.getnowhere.app.ntfywake

import java.util.concurrent.LinkedBlockingDeque

/** Testable dedup + dispatch logic, decoupled from Android context. */
internal class NtfyWakeHandler(
    private val onWake: () -> Unit,
    private val maxDedupIds: Int = 50,
) {
    private val dedupIds = LinkedBlockingDeque<String>(maxDedupIds)

    fun handle(id: String?, body: String) {
        val trimmed = body.trim()
        if (!isWakeBody(trimmed)) return
        val dedupKey =
            id?.takeIf { it.isNotBlank() } ?: jsonStringField(trimmed, "id") ?: "no-id"
        if (dedupIds.contains(dedupKey)) return
        if (dedupIds.remainingCapacity() == 0) dedupIds.pollFirst()
        dedupIds.addLast(dedupKey)
        onWake()
    }

    /** Bare `wake`, or ntfy's JSON envelope whose message field is `wake`. */
    private fun isWakeBody(trimmed: String): Boolean {
        if (trimmed == "wake" || trimmed.isEmpty()) return true
        if (!trimmed.startsWith("{")) return false
        val event = jsonStringField(trimmed, "event")
        if (event != null && event != "message") return false
        return jsonStringField(trimmed, "message") == "wake"
    }

    private fun jsonStringField(json: String, key: String): String? {
        val match = Regex(""""$key"\s*:\s*"([^"\\]*)"""").find(json) ?: return null
        return match.groupValues[1]
    }
}
