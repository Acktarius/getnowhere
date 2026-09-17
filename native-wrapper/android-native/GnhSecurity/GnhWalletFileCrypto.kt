package im.getnowhere.app.security

import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES/GCM/NoPadding. Production uses a Keystore key; tests pass a SecretKey. */
class GnhWalletFileCrypto(private val key: SecretKey) {
    fun encrypt(plaintext: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        // Keystore rejects caller IVs when randomizedEncryptionRequired is set.
        // @see https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder#setRandomizedEncryptionRequired(boolean)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val nonce = cipher.iv
        if (nonce == null || nonce.size != GnhWalletFileEnvelope.NONCE_BYTES) {
            throw WalletFileException("io-error")
        }
        cipher.updateAAD(GnhWalletFileEnvelope.AAD_BYTES)
        val ciphertextAndTag = cipher.doFinal(plaintext)
        return GnhWalletFileEnvelope.pack(nonce, ciphertextAndTag)
    }

    fun decrypt(envelope: ByteArray): ByteArray {
        val parsed = GnhWalletFileEnvelope.parse(envelope)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            key,
            GCMParameterSpec(GnhWalletFileEnvelope.TAG_BITS, parsed.nonce),
        )
        cipher.updateAAD(GnhWalletFileEnvelope.AAD_BYTES)
        return try {
            cipher.doFinal(parsed.ciphertextAndTag)
        } catch (_: AEADBadTagException) {
            throw WalletFileException("auth-failed")
        }
    }
}
