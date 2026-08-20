package im.getnowhere.app.notifications

import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class GnhNotificationPublisherTest {

    private lateinit var context: Context
    private lateinit var ledger: DeliveredEventLedger
    private lateinit var publisher: GnhNotificationPublisher

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        ledger = DeliveredEventLedger(context)
        ledger.clear()
        publisher = GnhNotificationPublisher(context, ledger)
        shadowOf(
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager,
        ).setNotificationsEnabled(true)
        grantPostNotifications()
    }

    private fun grantPostNotifications() {
        shadowOf(context.applicationContext as android.app.Application)
            .grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun input(
        eventId: String = "evt-1",
        notificationsEnabled: Boolean = true,
        bannersEnabled: Boolean = true,
        appInForeground: Boolean = false,
    ) = PublishEventInput(
        eventId = eventId,
        title = "Alice",
        body = "Alice: hello",
        badgeCount = 1,
        notificationsEnabled = notificationsEnabled,
        bannersEnabled = bannersEnabled,
        appInForeground = appInForeground,
    )

    @Test
    fun `creates channel with badge enabled`() {
        publisher.ensureChannel()
        val manager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = manager.getNotificationChannel(GnhNotificationPublisher.CHANNEL_ID)
        assertNotNull(channel)
        assertTrue(channel.canShowBadge())
    }

    @Test
    fun `posts banner when enabled and backgrounded`() {
        assertEquals(PublishOutcome.POSTED, publisher.publishEvent(input()))
        val manager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        assertEquals(1, shadowOf(manager).allNotifications.size)
    }

    @Test
    fun `duplicate eventId is not posted twice`() {
        assertEquals(PublishOutcome.POSTED, publisher.publishEvent(input()))
        assertEquals(PublishOutcome.DUPLICATE, publisher.publishEvent(input()))
        val manager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        assertEquals(1, shadowOf(manager).allNotifications.size)
    }

    @Test
    fun `banners disabled records ledger but posts nothing`() {
        assertEquals(
            PublishOutcome.BADGE_ONLY,
            publisher.publishEvent(input(bannersEnabled = false)),
        )
        val manager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        assertEquals(0, shadowOf(manager).allNotifications.size)
        assertTrue(ledger.isDelivered("evt-1"))
    }

    @Test
    fun `notifications disabled is a no-op`() {
        assertEquals(
            PublishOutcome.DISABLED,
            publisher.publishEvent(input(notificationsEnabled = false)),
        )
        assertFalse(ledger.isDelivered("evt-1"))
    }

    @Test
    fun `foreground app suppresses banner without burning ledger`() {
        assertEquals(
            PublishOutcome.FOREGROUND_SUPPRESSED,
            publisher.publishEvent(input(appInForeground = true)),
        )
        val manager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        assertEquals(0, shadowOf(manager).allNotifications.size)
        assertFalse(ledger.isDelivered("evt-1"))
        assertEquals(PublishOutcome.POSTED, publisher.publishEvent(input()))
        assertEquals(1, shadowOf(manager).allNotifications.size)
    }

    @Test
    fun `stable notification ids differ across events`() {
        val a = ledger.notificationIdFor("evt-a")
        val b = ledger.notificationIdFor("evt-b")
        assertTrue(a > 0)
        assertTrue(b > 0)
        assertTrue(a != b)
        assertEquals(a, ledger.notificationIdFor("evt-a"))
    }

    @Test
    fun `ledger survives new instance (persistence)`() {
        assertTrue(ledger.markDelivered("evt-persist"))
        val fresh = DeliveredEventLedger(context)
        assertTrue(fresh.isDelivered("evt-persist"))
        assertFalse(fresh.markDelivered("evt-persist"))
    }
}
