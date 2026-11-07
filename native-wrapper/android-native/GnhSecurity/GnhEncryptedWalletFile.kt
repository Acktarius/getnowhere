package im.getnowhere.app.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.io.FileOutputStream
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/** App-private encrypted wallet file. Atomic replace in the same directory. */
class GnhEncryptedWalletFile(
    private val directory: File,
    private val crypto: GnhWalletFileCrypto,
) {
    private val lock = Any()
    private val dest = File(directory, CANONICAL_NAME)
    private val tmp = File(directory, TEMP_NAME)

    fun exists(): WalletFileExists {
        return synchronized(lock) {
            try {
                cleanupStaleTempIfSafe()
                WalletFileExists.Ok(dest.isFile)
            } catch (e: WalletFileException) {
                if (e.reason == "auth-failed" || e.reason == "invalid-envelope") {
                    WalletFileExists.Ok(true)
                } else {
                    WalletFileExists.Err(e.reason)
                }
            } catch (_: Exception) {
                WalletFileExists.Err("io-error")
            }
        }
    }

    fun read(): WalletFileRead {
        return synchronized(lock) {
            try {
                cleanupStaleTempIfSafe()
                if (!dest.isFile) return@synchronized WalletFileRead.Missing
                val plain = crypto.decrypt(dest.readBytes())
                WalletFileRead.Ok(String(plain, StandardCharsets.UTF_8))
            } catch (e: WalletFileException) {
                WalletFileRead.Err(e.reason)
            } catch (_: Exception) {
                WalletFileRead.Err("io-error")
            }
        }
    }

    fun write(plaintext: String) {
        synchronized(lock) {
            try {
                if (!directory.exists() && !directory.mkdirs()) {
                    throw WalletFileException("io-error")
                }
                val envelope = crypto.encrypt(plaintext.toByteArray(StandardCharsets.UTF_8))
                FileOutputStream(tmp).use { fos ->
                    fos.write(envelope)
                    fos.fd.sync()
                }
                try {
                    Files.move(
                        tmp.toPath(),
                        dest.toPath(),
                        StandardCopyOption.ATOMIC_MOVE,
                        StandardCopyOption.REPLACE_EXISTING,
                    )
                } catch (_: java.nio.file.AtomicMoveNotSupportedException) {
                    Files.move(
                        tmp.toPath(),
                        dest.toPath(),
                        StandardCopyOption.REPLACE_EXISTING,
                    )
                }
                syncDirectoryBestEffort()
            } catch (e: WalletFileException) {
                android.util.Log.e("GnhWalletFile", "write failed: ${e.reason}")
                throw e
            } catch (e: Exception) {
                android.util.Log.e(
                    "GnhWalletFile",
                    "write failed: ${e.javaClass.simpleName}: ${e.message}",
                )
                throw WalletFileException("io-error")
            }
        }
    }

    fun remove() {
        synchronized(lock) {
            if (tmp.exists()) tmp.delete()
            if (dest.exists() && !dest.delete()) {
                throw WalletFileException("io-error")
            }
        }
    }

    private fun cleanupStaleTempIfSafe() {
        if (!tmp.exists() || !dest.isFile) return
        crypto.decrypt(dest.readBytes())
        tmp.delete()
    }

    private fun syncDirectoryBestEffort() {
        try {
            FileOutputStream(directory).use { it.fd.sync() }
        } catch (_: Exception) {
            /* directory fsync is best-effort */
        }
    }

    sealed class WalletFileExists {
        data class Ok(val exists: Boolean) : WalletFileExists()
        data class Err(val reason: String) : WalletFileExists()
    }

    sealed class WalletFileRead {
        data class Ok(val value: String) : WalletFileRead()
        data object Missing : WalletFileRead()
        data class Err(val reason: String) : WalletFileRead()
    }

    companion object {
        const val DIR_NAME = "gnh"
        const val CANONICAL_NAME = "wallet.v1.enc"
        const val TEMP_NAME = "wallet.v1.enc.tmp"
        const val KEYSTORE_ALIAS = "gnh-wallet-file-v1"

        fun create(context: Context): GnhEncryptedWalletFile {
            val dir = File(context.filesDir, DIR_NAME)
            return GnhEncryptedWalletFile(dir, GnhWalletFileCrypto(getOrCreateKey()))
        }

        fun getOrCreateKey(): SecretKey {
            val store = KeyStore.getInstance("AndroidKeyStore")
            store.load(null)
            val existing = store.getKey(KEYSTORE_ALIAS, null) as? SecretKey
            if (existing != null) return existing
            val gen = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore",
            )
            gen.init(
                KeyGenParameterSpec.Builder(
                    KEYSTORE_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setUserAuthenticationRequired(false)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            return gen.generateKey()
        }
    }
}
