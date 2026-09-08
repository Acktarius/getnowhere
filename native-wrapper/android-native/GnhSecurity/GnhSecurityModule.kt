package im.getnowhere.app.security

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import androidx.fragment.app.FragmentActivity
import org.json.JSONObject

/** RN bridge for gnhMobile security WebView messages. */
class GnhSecurityModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "GnhSecurity"

    private val securePrefs by lazy { GnhSecurePrefs(reactApplicationContext) }

    private fun activity(): FragmentActivity? =
        reactApplicationContext.currentActivity as? FragmentActivity

    private fun biometricModule(): GnhBiometricModule? {
        val act = activity() ?: return null
        return GnhBiometricModule.create(reactApplicationContext, act)
    }

    @ReactMethod
    fun securePrefsGet(key: String, promise: Promise) {
        try {
            promise.resolve(securePrefs.get(key))
        } catch (e: Exception) {
            promise.reject("ERR", e.message)
        }
    }

    @ReactMethod
    fun securePrefsSet(key: String, value: String, promise: Promise) {
        try {
            securePrefs.set(key, value)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR", e.message)
        }
    }

    @ReactMethod
    fun securePrefsRemove(key: String, promise: Promise) {
        try {
            securePrefs.remove(key)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR", e.message)
        }
    }

    @ReactMethod
    fun copySensitive(value: String, promise: Promise) {
        try {
            val clipboard = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE)
                as ClipboardManager
            val clip = ClipData.newPlainText("", value)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val extras = PersistableBundle()
                extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true)
                clip.description.extras = extras
            }
            clipboard.setPrimaryClip(clip)
            promise.resolve(true)
        } catch (_: Exception) {
            promise.reject("ERR", "failed")
        }
    }

    @ReactMethod
    fun clearClipboard(promise: Promise) {
        try {
            val clipboard = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE)
                as ClipboardManager
            // Overwrite first: clearPrimaryClip() is a no-op on some devices
            // when this app did not set the current clip.
            clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                clipboard.clearPrimaryClip()
            }
            promise.resolve(true)
        } catch (_: Exception) {
            promise.reject("ERR", "failed")
        }
    }

    @ReactMethod
    fun handleBiometricCommand(payloadJson: String, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            val module = biometricModule()
            if (module == null) {
                promise.resolve(errorJson("failed"))
                return@runOnUiThread
            }
            try {
                val payload = JSONObject(payloadJson)
                val action = payload.optString("action", "")
                when (action) {
                    "isAvailable" -> {
                        val purpose = payload.optString("purpose", GnhBiometricModule.PURPOSE_DATA)
                        val available = module.isAvailable(purpose)
                        promise.resolve(JSONObject().put("available", available).toString())
                    }
                    "enrollDataUnlock" -> {
                        module.enrollDataUnlock(
                            payload.getString("walletId"),
                            payload.getString("password"),
                        ) { result ->
                            promise.resolve(result.toString())
                        }
                    }
                    "unlockDataUnlock" -> {
                        module.unlockDataUnlock(
                            payload.getString("walletId"),
                            payload.getString("credentialId"),
                        ) { result ->
                            promise.resolve(result.toString())
                        }
                    }
                    "enrollAppAccess" -> {
                        module.enrollAppAccess(payload.getString("passcode")) { result ->
                            promise.resolve(result.toString())
                        }
                    }
                    "unlockAppAccess" -> {
                        module.unlockAppAccess { result ->
                            promise.resolve(result.toString())
                        }
                    }
                    "removeCredential" -> {
                        module.removeCredential(payload.getString("credentialId"))
                        promise.resolve(JSONObject().put("ok", true).toString())
                    }
                    else -> promise.resolve(errorJson("failed"))
                }
            } catch (e: Exception) {
                promise.resolve(errorJson("failed"))
            }
        }
    }

    private fun errorJson(code: String): String =
        JSONObject().put("error", code).toString()
}
