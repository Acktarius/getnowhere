package im.getnowhere.app.backgroundsync

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/** Schedules unique 15-minute periodic WorkManager remote-node sync. */
object RemoteNodeBackgroundSyncScheduler {
    fun scheduleRemoteNodeBackgroundSync(context: Context) {
        val constraints =
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        val request =
            PeriodicWorkRequestBuilder<BlockchainRemoteSyncWorker>(
                RemoteNodeBackgroundSyncConfig.REPEAT_INTERVAL_MINUTES,
                TimeUnit.MINUTES,
            )
                .setConstraints(constraints)
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
}
