package im.getnowhere.app.security

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** EncryptedSharedPreferences wrapper for enrollment metadata and prefs. */
class GnhSecurePrefs(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun get(key: String): String? = prefs.getString(key, null)

    /** Synchronous write; true only once the value is on disk. */
    fun set(key: String, value: String): Boolean = prefs.edit().putString(key, value).commit()

    /** Synchronous removal; true only once the change is on disk. */
    fun remove(key: String): Boolean = prefs.edit().remove(key).commit()

    companion object {
        private const val PREFS_NAME = "gnh_secure_prefs"
    }
}
