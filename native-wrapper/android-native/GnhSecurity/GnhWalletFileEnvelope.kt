package im.getnowhere.app.security

import java.nio.charset.StandardCharsets

/** Versioned AES-GCM wallet-file envelope. @see docs/storage/mobile-durable-storage.md */
object GnhWalletFileEnvelope {
    val MAGIC: ByteArray = byteArrayOf(0x47, 0x4E, 0x48, 0x57) // GNHW
    const val VERSION: Byte = 0x01
    const val NONCE_LENGTH: Byte = 12
    const val NONCE_BYTES: Int = 12
    const val TAG_BITS: Int = 128
    const val HEADER_BYTES: Int = 6
    const val AAD: String = "getnowhere:wallet-file:v1"
    val AAD_BYTES: ByteArray = AAD.toByteArray(StandardCharsets.UTF_8)

    data class Parsed(
        val nonce: ByteArray,
        val ciphertextAndTag: ByteArray,
    )

    fun pack(nonce: ByteArray, ciphertextAndTag: ByteArray): ByteArray {
        if (nonce.size != NONCE_BYTES) throw WalletFileException("invalid-envelope")
        val out = ByteArray(HEADER_BYTES + nonce.size + ciphertextAndTag.size)
        MAGIC.copyInto(out, 0)
        out[4] = VERSION
        out[5] = NONCE_LENGTH
        nonce.copyInto(out, HEADER_BYTES)
        ciphertextAndTag.copyInto(out, HEADER_BYTES + NONCE_BYTES)
        return out
    }

    fun parse(bytes: ByteArray): Parsed {
        if (bytes.size < HEADER_BYTES + NONCE_BYTES + 16) {
            throw WalletFileException("invalid-envelope")
        }
        if (!bytes.copyOfRange(0, 4).contentEquals(MAGIC)) {
            throw WalletFileException("invalid-envelope")
        }
        if (bytes[4] != VERSION || bytes[5] != NONCE_LENGTH) {
            throw WalletFileException("invalid-envelope")
        }
        return Parsed(
            nonce = bytes.copyOfRange(HEADER_BYTES, HEADER_BYTES + NONCE_BYTES),
            ciphertextAndTag = bytes.copyOfRange(HEADER_BYTES + NONCE_BYTES, bytes.size),
        )
    }
}

class WalletFileException(val reason: String) : Exception()
