package im.getnowhere.app.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Local-notification publisher for background L1/L1′ sync events.
 * @see docs/features/local-background-notifications.md
 */
class GnhNotificationPublisher(
    private val context: Context,
    private val ledger: DeliveredEventLedger = DeliveredEventLedger(context),
) {

    fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel =
            NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                setShowBadge(true)
                enableVibration(false)
            }
        manager.createNotificationChannel(channel)
    }

    fun hasPostPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return NotificationManagerCompat.from(context).areNotificationsEnabled()
        }
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * Post one banner for a validated event. Returns the delivery decision;
     * never throws on permission denial or channel block.
     */
    fun publishEvent(input: PublishEventInput): PublishOutcome {
        if (!input.notificationsEnabled) return PublishOutcome.DISABLED
        // Do not burn the eventId: a later background publish must still post.
        if (input.appInForeground) return PublishOutcome.FOREGROUND_SUPPRESSED
        if (ledger.isDelivered(input.eventId)) return PublishOutcome.DUPLICATE
        if (!input.bannersEnabled) {
            if (!ledger.markDelivered(input.eventId)) return PublishOutcome.DUPLICATE
            return PublishOutcome.BADGE_ONLY
        }
        if (!hasPostPermission()) return PublishOutcome.NO_PERMISSION

        if (!ledger.markDelivered(input.eventId)) return PublishOutcome.DUPLICATE
        ensureChannel()
        val notification =
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(context.applicationInfo.icon)
                .setContentTitle(input.title)
                .setContentText(input.body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(input.body))
                .setNumber(input.badgeCount)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setContentIntent(launchIntent(input.eventId))
                .build()
        return try {
            NotificationManagerCompat.from(context)
                .notify(ledger.notificationIdFor(input.eventId), notification)
            PublishOutcome.POSTED
        } catch (_: SecurityException) {
            PublishOutcome.NO_PERMISSION
        }
    }

    fun cancelAll() {
        NotificationManagerCompat.from(context).cancelAll()
    }

    /** Opaque eventId only — no room ids, addresses, or plaintext in extras. */
    private fun launchIntent(eventId: String): android.app.PendingIntent? {
        val launch =
            context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: return null
        launch.putExtra(EXTRA_EVENT_ID, eventId)
        launch.addFlags(
            android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP or
                android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP,
        )
        return android.app.PendingIntent.getActivity(
            context,
            ledger.notificationIdFor(eventId),
            launch,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or
                android.app.PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        const val CHANNEL_ID = "nowhere_messages"
        const val CHANNEL_NAME = "Messages"
        const val EXTRA_EVENT_ID = "gnhNotificationEventId"
    }
}

data class PublishEventInput(
    val eventId: String,
    val title: String,
    val body: String,
    val badgeCount: Int,
    val notificationsEnabled: Boolean,
    val bannersEnabled: Boolean,
    val appInForeground: Boolean,
)

enum class PublishOutcome {
    POSTED,
    BADGE_ONLY,
    DUPLICATE,
    DISABLED,
    FOREGROUND_SUPPRESSED,
    NO_PERMISSION,
}
