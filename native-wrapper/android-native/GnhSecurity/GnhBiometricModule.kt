package im.getnowhere.app.security

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import org.json.JSONObject
import java.security.KeyStore
import java.security.SecureRandom
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Native-only biometric gate: encrypts wallet password or app passcode in Keystore.
 * No intermediate secrets cross the WebView bridge.
 */
class GnhBiometricModule(
    private val activity: FragmentActivity,
    private val securePrefs: GnhSecurePrefs,
) {
    private val inFlight = AtomicBoolean(false)

    fun isAvailable(purpose: String): Boolean {
        if (purpose != PURPOSE_APP && purpose != PURPOSE_DATA) return false
        return isBiometricAvailable()
    }

    fun enrollDataUnlock(walletId: String, password: String, callback: (JSONObject) -> Unit) {
        if (!beginPrompt()) {
            callback(error("busy"))
            return
        }
        if (!isBiometricAvailable()) {
            endPrompt()
            callback(error("unsupported"))
            return
        }
        val credentialId = randomCredentialId(PREFIX_DATA)
        runCryptoEnroll(
            credentialId = credentialId,
            title = "Enable biometric unlock",
            subtitle = "Confirm with fingerprint or face",
            plaintext = password.toByteArray(Charsets.UTF_8),
            onSuccess = {
                securePrefs.set(metaKey(credentialId), walletId)
                endPrompt()
                callback(ok().put("credentialId", credentialId))
            },
            onError = { code ->
                removeStoredCredential(credentialId)
                securePrefs.remove(metaKey(credentialId))
                endPrompt()
                callback(error(code))
            },
        )
    }

    fun unlockDataUnlock(walletId: String, credentialId: String, callback: (JSONObject) -> Unit) {
        if (!beginPrompt()) {
            callback(error("busy"))
            return
        }
        if (securePrefs.get(metaKey(credentialId)) != walletId) {
            endPrompt()
            callback(error("failed"))
            return
        }
        runCryptoUnlock(
            credentialId = credentialId,
            title = "Unlock wallet",
            subtitle = "Use biometrics to unlock",
            onSuccess = { plaintext ->
                endPrompt()
                callback(ok().put("password", String(plaintext, Charsets.UTF_8)))
            },
            onError = { code ->
                if (code == "invalidated") removeStoredCredential(credentialId)
                endPrompt()
                callback(error(code))
            },
        )
    }

    fun enrollAppAccess(passcode: String, callback: (JSONObject) -> Unit) {
        if (!beginPrompt()) {
            callback(error("busy"))
            return
        }
        if (!isBiometricAvailable()) {
            endPrompt()
            callback(error("unsupported"))
            return
        }
        val credentialId = randomCredentialId(PREFIX_APP)
        runCryptoEnroll(
            credentialId = credentialId,
            title = "Enable app unlock",
            subtitle = "Confirm with fingerprint or face",
            plaintext = passcode.toByteArray(Charsets.UTF_8),
            onSuccess = {
                securePrefs.set(APP_CREDENTIAL_KEY, credentialId)
                endPrompt()
                callback(ok().put("credentialId", credentialId))
            },
            onError = { code ->
                removeStoredCredential(credentialId)
                securePrefs.remove(APP_CREDENTIAL_KEY)
                endPrompt()
                callback(error(code))
            },
        )
    }

    fun unlockAppAccess(callback: (JSONObject) -> Unit) {
        if (!beginPrompt()) {
            callback(error("busy"))
            return
        }
        val credentialId = securePrefs.get(APP_CREDENTIAL_KEY)
        if (credentialId.isNullOrEmpty()) {
            endPrompt()
            callback(error("failed"))
            return
        }
        runCryptoUnlock(
            credentialId = credentialId,
            title = "Unlock app",
            subtitle = "Use biometrics",
            onSuccess = {
                endPrompt()
                callback(ok().put("ok", true))
            },
            onError = { code ->
                if (code == "invalidated") {
                    removeStoredCredential(credentialId)
                    securePrefs.remove(APP_CREDENTIAL_KEY)
                }
                endPrompt()
                callback(error(code))
            },
        )
    }

    fun removeCredential(credentialId: String) {
        removeStoredCredential(credentialId)
        securePrefs.remove(metaKey(credentialId))
        if (securePrefs.get(APP_CREDENTIAL_KEY) == credentialId) {
            securePrefs.remove(APP_CREDENTIAL_KEY)
        }
    }

    private fun beginPrompt(): Boolean = inFlight.compareAndSet(false, true)

    private fun endPrompt() {
        inFlight.set(false)
    }

    private fun isBiometricAvailable(): Boolean {
        val manager = BiometricManager.from(activity)
        var authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            authenticators = authenticators or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        }
        return manager.canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS
    }

    private fun runCryptoEnroll(
        credentialId: String,
        title: String,
        subtitle: String,
        plaintext: ByteArray,
        onSuccess: () -> Unit,
        onError: (String) -> Unit,
    ) {
        activity.runOnUiThread {
            try {
                val key = createKey(credentialId)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.ENCRYPT_MODE, key)
                showCryptoPrompt(
                    title,
                    subtitle,
                    cipher,
                    onAuthenticated = {
                        try {
                            val iv = cipher.iv
                            val ciphertext = cipher.doFinal(plaintext)
                            saveBlob(credentialId, iv, ciphertext)
                            onSuccess()
                        } catch (_: Exception) {
                            onError("failed")
                        }
                    },
                    onError = onError,
                )
            } catch (_: Exception) {
                onError("failed")
            }
        }
    }

    private fun runCryptoUnlock(
        credentialId: String,
        title: String,
        subtitle: String,
        onSuccess: (ByteArray) -> Unit,
        onError: (String) -> Unit,
    ) {
        activity.runOnUiThread {
            try {
                val blob = loadBlob(credentialId) ?: run {
                    onError("failed")
                    return@runOnUiThread
                }
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                val spec = GCMParameterSpec(GCM_TAG_LENGTH, blob.iv)
                val key = loadKey(credentialId)
                cipher.init(Cipher.DECRYPT_MODE, key, spec)
                showCryptoPrompt(
                    title,
                    subtitle,
                    cipher,
                    onAuthenticated = {
                        try {
                            onSuccess(cipher.doFinal(blob.ciphertext))
                        } catch (e: Exception) {
                            if (e.cause is KeyPermanentlyInvalidatedException) onError("invalidated")
                            else onError("failed")
                        }
                    },
                    onError = onError,
                )
            } catch (e: Exception) {
                if (e is KeyPermanentlyInvalidatedException) onError("invalidated")
                else onError("failed")
            }
        }
    }

    private fun showCryptoPrompt(
        title: String,
        subtitle: String,
        cipher: Cipher,
        onAuthenticated: () -> Unit,
        onError: (String) -> Unit,
    ) {
        val executor: Executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onAuthenticated()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onError("cancelled")
                }
            },
        )
        val infoBuilder = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Cancel")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            infoBuilder.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        }
        try {
            prompt.authenticate(infoBuilder.build(), BiometricPrompt.CryptoObject(cipher))
        } catch (_: Exception) {
            onError("failed")
        }
    }

    private fun createKey(credentialId: String): SecretKey {
        val alias = keystoreAlias(credentialId)
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        val builder = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
        } else {
            builder.setUserAuthenticationValidityDurationSeconds(-1)
        }
        generator.init(builder.build())
        return generator.generateKey()
    }

    private fun loadKey(credentialId: String): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        val entry = keyStore.getEntry(keystoreAlias(credentialId), null) as KeyStore.SecretKeyEntry
        return entry.secretKey
    }

    private fun saveBlob(credentialId: String, iv: ByteArray, ciphertext: ByteArray) {
        securePrefs.set(prefKey(credentialId, "iv"), b64(iv))
        securePrefs.set(prefKey(credentialId, "ct"), b64(ciphertext))
    }

    private fun loadBlob(credentialId: String): EncryptedBlob? {
        val iv = securePrefs.get(prefKey(credentialId, "iv")) ?: return null
        val ct = securePrefs.get(prefKey(credentialId, "ct")) ?: return null
        return EncryptedBlob(b64d(iv), b64d(ct))
    }

    private fun removeStoredCredential(credentialId: String) {
        try {
            val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
            val alias = keystoreAlias(credentialId)
            if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
        } catch (_: Exception) {
        }
        securePrefs.remove(prefKey(credentialId, "iv"))
        securePrefs.remove(prefKey(credentialId, "ct"))
    }

    private data class EncryptedBlob(val iv: ByteArray, val ciphertext: ByteArray)

    companion object {
        private const val KEYSTORE = "AndroidKeyStore"
        private const val GCM_TAG_LENGTH = 128
        private const val PREFIX_DATA = "data-"
        private const val PREFIX_APP = "app-"
        const val PURPOSE_APP = "app"
        const val PURPOSE_DATA = "data"
        private const val APP_CREDENTIAL_KEY = "gnh.appAccessCredentialId"

        fun create(context: Context, activity: FragmentActivity): GnhBiometricModule {
            return GnhBiometricModule(activity, GnhSecurePrefs(context))
        }

        private fun randomCredentialId(prefix: String): String =
            prefix + b64(randomBytes(12)).replace("=", "")

        private fun randomBytes(n: Int): ByteArray =
            ByteArray(n).also { SecureRandom().nextBytes(it) }

        private fun keystoreAlias(credentialId: String) =
            "gnh_bio_" + credentialId.replace(Regex("[^A-Za-z0-9_-]"), "_")

        private fun prefKey(credentialId: String, suffix: String) = "cred_${credentialId}_$suffix"

        private fun metaKey(credentialId: String) = "meta_$credentialId"

        private fun b64(bytes: ByteArray) =
            Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

        private fun b64d(value: String) =
            Base64.decode(value, Base64.URL_SAFE or Base64.NO_PADDING)

        private fun ok(): JSONObject = JSONObject()

        private fun error(code: String): JSONObject = JSONObject().put("error", code)
    }
}
