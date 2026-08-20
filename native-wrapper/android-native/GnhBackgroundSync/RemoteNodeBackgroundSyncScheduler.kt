package im.getnowhere.app.backgroundsync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Schedules unique 15-minute periodic WorkManager remote-node sync. */
object RemoteNodeBackgroundSyncScheduler {
    private val appInBackground = AtomicBoolean(false)

    private fun networkConstraints(): Constraints =
        Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

    fun scheduleRemoteNodeBackgroundSync(context: Context) {
        val request =
            PeriodicWorkRequestBuilder<BlockchainRemoteSyncWorker>(
                RemoteNodeBackgroundSyncConfig.REPEAT_INTERVAL_MINUTES,
                TimeUnit.MINUTES,
            )
                .setConstraints(networkConstraints())
                .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
            RemoteNodeBackgroundSyncConfig.UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }

    fun cancelRemoteNodeBackgroundSync(context: Context) {
        WorkManager.getInstance(context.applicationContext).cancelUniqueWork(
            RemoteNodeBackgroundSyncConfig.UNIQUE_WORK_NAME,
        )
    }

    fun setAppInBackground(context: Context, inBackground: Boolean) {
        appInBackground.set(inBackground)
        if (inBackground) {
            scheduleSoonRemoteNodeSync(context)
        } else {
            cancelSoonRemoteNodeSync(context)
        }
    }

    fun shouldChainSoon(): Boolean = appInBackground.get()

    fun scheduleSoonRemoteNodeSync(context: Context) {
        val request =
            OneTimeWorkRequestBuilder<BlockchainRemoteSyncWorker>()
                .setConstraints(networkConstraints())
                .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            RemoteNodeBackgroundSyncConfig.UNIQUE_SOON_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            request,
        )
    }

    fun cancelSoonRemoteNodeSync(context: Context) {
        WorkManager.getInstance(context.applicationContext).cancelUniqueWork(
            RemoteNodeBackgroundSyncConfig.UNIQUE_SOON_WORK_NAME,
        )
    }
}
