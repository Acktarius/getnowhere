package im.getnowhere.app.backgroundsync

import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.TestDriver
import androidx.work.testing.WorkManagerTestInitHelper
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RemoteNodeBackgroundSyncSchedulerTest {

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        WorkManagerTestInitHelper.initializeTestWorkManager(
            context,
            Configuration.Builder().build(),
        )
    }

    @Test
    fun uniquePeriodicWorkDoesNotDuplicate() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    RemoteNodeBackgroundSyncScheduler.scheduleRemoteNodeBackgroundSync(context)
    RemoteNodeBackgroundSyncScheduler.scheduleRemoteNodeBackgroundSync(context)
    val infos =
        WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(RemoteNodeBackgroundSyncConfig.UNIQUE_WORK_NAME)
            .get()
    assertEquals(1, infos.size)
    assertEquals(WorkInfo.State.ENQUEUED, infos[0].state)
}

@Test
fun soonWorkReplacesWithoutDuplicating() {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    RemoteNodeBackgroundSyncScheduler.scheduleSoonRemoteNodeSync(context)
    RemoteNodeBackgroundSyncScheduler.scheduleSoonRemoteNodeSync(context)
    val infos =
        WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(RemoteNodeBackgroundSyncConfig.UNIQUE_SOON_WORK_NAME)
            .get()
    assertEquals(1, infos.size)
    assertEquals(WorkInfo.State.ENQUEUED, infos[0].state)
}
}
