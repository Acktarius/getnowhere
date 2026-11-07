package im.getnowhere.app.security

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import javax.crypto.spec.SecretKeySpec

class GnhWalletFileCryptoTest {
    private val key = SecretKeySpec(ByteArray(32) { 7 }, "AES")
    private val crypto = GnhWalletFileCrypto(key)

    @Test
    fun packParseRoundTrip() {
        val nonce = ByteArray(12) { 1 }
        val body = ByteArray(32) { 2 }
        val packed = GnhWalletFileEnvelope.pack(nonce, body)
        val parsed = GnhWalletFileEnvelope.parse(packed)
        assertArrayEquals(nonce, parsed.nonce)
        assertArrayEquals(body, parsed.ciphertextAndTag)
        assertEquals(0x01.toByte(), packed[4])
        assertEquals(12.toByte(), packed[5])
        assertEquals("GNHW", packed.copyOfRange(0, 4).toString(Charsets.US_ASCII))
    }

    @Test
    fun encryptDecryptRoundTrip() {
        val plain = "wallet-blob-fixture"
        val first = crypto.encrypt(plain.toByteArray())
        val second = crypto.encrypt(plain.toByteArray())
        assertNotEquals(first.toList(), second.toList())
        assertEquals(plain, String(crypto.decrypt(first)))
        assertEquals(plain, String(crypto.decrypt(second)))
    }

    @Test
    fun tamperedCiphertextDoesNotYieldPlaintext() {
        val envelope = crypto.encrypt("secret-wallet".toByteArray())
        envelope[envelope.lastIndex] = (envelope[envelope.lastIndex].toInt() xor 0x01).toByte()
        try {
            crypto.decrypt(envelope)
            fail("expected auth failure")
        } catch (e: WalletFileException) {
            assertEquals("auth-failed", e.reason)
        }
    }

    @Test
    fun atomicReplaceWritesCanonicalFileAndRemovesTemp() {
        val dir = File.createTempFile("gnh-wallet", "dir").apply {
            delete()
            mkdirs()
        }
        try {
            val store = GnhEncryptedWalletFile(dir, crypto)
            store.write("first")
            store.write("second")
            val dest = File(dir, GnhEncryptedWalletFile.CANONICAL_NAME)
            val tmp = File(dir, GnhEncryptedWalletFile.TEMP_NAME)
            assertTrue(dest.isFile)
            assertFalse(tmp.exists())
            val read = store.read()
            assertTrue(read is GnhEncryptedWalletFile.WalletFileRead.Ok)
            assertEquals("second", (read as GnhEncryptedWalletFile.WalletFileRead.Ok).value)
        } finally {
            dir.deleteRecursively()
        }
    }
}
