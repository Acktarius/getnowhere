package im.getnowhere.app.notifications

import android.content.Context
import android.content.SharedPreferences

/**
 * Persisted opaque-eventId ledger: banner dedup across restarts + stable
 * notification ids. Stores only event ids — never titles, bodies, or metadata.
 */
class DeliveredEventLedger(
    context: Context,
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE),
) {

    /** Returns false when the eventId was already delivered (replay). */
    @Synchronized
    fun markDelivered(eventId: String): Boolean {
        val delivered = prefs.getStringSet(KEY_DELIVERED, emptySet()) ?: emptySet()
        if (delivered.contains(eventId)) return false
        val next = LinkedHashSet(delivered)
        next.add(eventId)
        while (next.size > MAX_ENTRIES) {
            val oldest = next.firstOrNull() ?: break
            next.remove(oldest)
        }
        prefs.edit().putStringSet(KEY_DELIVERED, next).apply()
        return true
    }

    fun isDelivered(eventId: String): Boolean {
        val delivered = prefs.getStringSet(KEY_DELIVERED, emptySet()) ?: emptySet()
        return delivered.contains(eventId)
    }

    /** Positive stable id per event; distinct events rarely collide (31-bit hash). */
    fun notificationIdFor(eventId: String): Int {
        var hash = 0
        for (ch in eventId) hash = (hash * 31 + ch.code) and 0x7fffffff
        return if (hash == 0) 1 else hash
    }

    @Synchronized
    fun clear() {
        prefs.edit().remove(KEY_DELIVERED).apply()
    }

    companion object {
        const val PREFS_NAME = "gnh_notifications_ledger"
        const val KEY_DELIVERED = "delivered_event_ids"
        const val MAX_ENTRIES = 512
    }
}
