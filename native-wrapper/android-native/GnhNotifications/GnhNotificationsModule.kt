package im.getnowhere.app.notifications

import android.Manifest
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

/** RN bridge for GnhNotifications — payloads are JSON strings from the WebView bridge. */
class GnhNotificationsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val publisher by lazy { GnhNotificationPublisher(reactApplicationContext) }

    override fun getName(): String = "GnhNotifications"

    @ReactMethod
    fun applyPrivacySettings(settingsJson: String, promise: Promise) {
        try {
            val settings = JSONObject(settingsJson)
            val notificationsEnabled = settings.optBoolean("notificationsEnabled", false)
            if (notificationsEnabled) {
                publisher.ensureChannel()
            } else {
                // Notifications turned off: remove any banners this feature posted.
                publisher.cancelAll()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_APPLY_SETTINGS", e.message)
        }
    }

    @ReactMethod
    fun publishEvent(payloadJson: String, promise: Promise) {
        try {
            val payload = JSONObject(payloadJson)
            val outcome =
                publisher.publishEvent(
                    PublishEventInput(
                        eventId = payload.getString("eventId"),
                        title = payload.optString("title", "Get NowHere"),
                        body = payload.optString("body", "New message"),
                        badgeCount = payload.optInt("badgeCount", 0),
                        notificationsEnabled =
                            payload.optBoolean("notificationsEnabled", false),
                        bannersEnabled = payload.optBoolean("bannersEnabled", false),
                        appInForeground = payload.optBoolean("appInForeground", true),
                    ),
                )
            promise.resolve(outcome.name)
        } catch (e: Exception) {
            promise.reject("ERR_PUBLISH", e.message)
        }
    }

    @ReactMethod
    fun setBadgeCount(count: Int, promise: Promise) {
        // Android has no public app-badge API without a notification; launcher
        // badge support varies by OEM. The channel badge + setNumber cover it.
        promise.resolve(true)
    }

    @ReactMethod
    fun clearBadge(promise: Promise) {
        publisher.cancelAll()
        promise.resolve(true)
    }

    @ReactMethod
    fun getPermissionStatus(promise: Promise) {
        try {
            val enabled =
                NotificationManagerCompat.from(reactApplicationContext)
                    .areNotificationsEnabled()
            val result =
                JSONObject()
                    .put("status", if (enabled) "authorized" else "denied")
                    .put("alert", enabled)
                    .put("badge", enabled)
            promise.resolve(result.toString())
        } catch (e: Exception) {
            promise.reject("ERR_STATUS", e.message)
        }
    }

    /** Must run from a foreground user gesture (Settings toggle flow). */
    @ReactMethod
    fun requestPermissions(badge: Boolean, alert: Boolean, promise: Promise) {
        try {
            publisher.ensureChannel()
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                promise.resolve(
                    JSONObject()
                        .put("granted", publisher.hasPostPermission())
                        .put("status", "authorized")
                        .toString(),
                )
                return
            }
            if (publisher.hasPostPermission()) {
                promise.resolve(
                    JSONObject().put("granted", true).put("status", "authorized").toString(),
                )
                return
            }
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.resolve(
                    JSONObject().put("granted", false).put("status", "unavailable").toString(),
                )
                return
            }
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                POST_NOTIFICATIONS_REQUEST_CODE,
            )
            // Async result lands in onRequestPermissionsResult; report requested state.
            promise.resolve(
                JSONObject().put("granted", false).put("status", "requested").toString(),
            )
        } catch (e: Exception) {
            promise.reject("ERR_REQUEST_PERMISSIONS", e.message)
        }
    }

    companion object {
        const val POST_NOTIFICATIONS_REQUEST_CODE = 7301
    }
}
