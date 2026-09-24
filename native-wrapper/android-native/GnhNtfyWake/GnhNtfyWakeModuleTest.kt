package im.getnowhere.app.ntfywake

import org.junit.Assert.assertEquals
import org.junit.Test

class GnhNtfyWakeModuleTest {

    private fun handler(calls: MutableList<Unit> = mutableListOf()): Pair<NtfyWakeHandler, MutableList<Unit>> {
        val list = calls
        return NtfyWakeHandler(onWake = { list.add(Unit) }) to list
    }

    @Test
    fun `wake body triggers onWake`() {
        val (h, calls) = handler()
        h.handle("id-1", "wake")
        assertEquals(1, calls.size)
    }

    @Test
    fun `empty body triggers onWake`() {
        val (h, calls) = handler()
        h.handle("id-1", "")
        assertEquals(1, calls.size)
    }

    @Test
    fun `whitespace-only body triggers onWake`() {
        val (h, calls) = handler()
        h.handle("id-1", "  ")
        assertEquals(1, calls.size)
    }

    @Test
    fun `non-wake body does not trigger onWake`() {
        val (h, calls) = handler()
        h.handle("id-1", "keepalive")
        h.handle("id-2", "open")
        h.handle("id-3", "some other message")
        assertEquals(0, calls.size)
    }

    @Test
    fun `duplicate id is deduped`() {
        val (h, calls) = handler()
        h.handle("id-1", "wake")
        h.handle("id-1", "wake")
        assertEquals(1, calls.size)
    }

    @Test
    fun `different ids each trigger onWake`() {
        val (h, calls) = handler()
        h.handle("id-1", "wake")
        h.handle("id-2", "wake")
        assertEquals(2, calls.size)
    }

    @Test
    fun `null id deduped as no-id`() {
        val (h, calls) = handler()
        h.handle(null, "wake")
        h.handle(null, "wake")
        assertEquals(1, calls.size)
    }

    @Test
    fun `dedup evicts oldest when full`() {
        val (h, calls) = handler()
        // Fill up dedup window (maxDedupIds=50 by default, use small custom handler)
        val smallCalls = mutableListOf<Unit>()
        val small = NtfyWakeHandler(onWake = { smallCalls.add(Unit) }, maxDedupIds = 3)
        small.handle("a", "wake") // [a]
        small.handle("b", "wake") // [a, b]
        small.handle("c", "wake") // [a, b, c] — full
        small.handle("a", "wake") // duplicate — ignored
        assertEquals(3, smallCalls.size)
        // now add a 4th — evicts "a", accepts "d"
        small.handle("d", "wake") // evicts a → [b, c, d]
        assertEquals(4, smallCalls.size)
        // "a" is no longer in dedup, so it fires again
        small.handle("a", "wake") // evicts b → [c, d, a]
        assertEquals(5, smallCalls.size)
    }
}
