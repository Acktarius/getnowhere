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
        if (trimmed != "wake" && trimmed.isNotEmpty()) return
        val dedupKey = id ?: "no-id"
        if (dedupIds.contains(dedupKey)) return
        if (dedupIds.remainingCapacity() == 0) dedupIds.pollFirst()
        dedupIds.addLast(dedupKey)
        onWake()
    }
}
