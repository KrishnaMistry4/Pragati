package com.pragati.app

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Process
import android.provider.Settings
import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.util.Calendar

/**
 * Bridges native Android usage-stats + step data into the web app running in the WebView.
 * Exposed to JS as `window.AndroidBridge` (see MainActivity + web/js/usage.js).
 *
 * All reads are silent — this class never posts a notification or shows UI on its own;
 * the web layer decides what (if anything) to display, and per the product spec it does NOT
 * alert the student when points are deducted for screen time.
 */
class UsageBridge(private val context: Context) {

    // package name -> friendly label used by web/js/usage.js + store.js usage rules
    private val trackedPackages = mapOf(
        "com.whatsapp" to "WhatsApp",
        "com.instagram.android" to "Instagram",
        "com.google.android.youtube" to "Other social/video",
        "com.zhiliaoapp.musically" to "Other social/video",   // TikTok
        "com.snapchat.android" to "Other social/video",
        "com.facebook.katana" to "Other social/video",
        "com.facebook.lite" to "Other social/video",
        "com.twitter.android" to "Other social/video",
        "com.instagram.lite" to "Instagram"
    )

    @JavascriptInterface
    fun hasUsagePermission(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    @JavascriptInterface
    fun requestUsagePermission() {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            // fall back to app details settings if the usage-access screen isn't available
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            intent.data = Uri.parse("package:" + context.packageName)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }
    }

    /**
     * Returns today's per-app foreground minutes as a JSON string, e.g.
     * {"WhatsApp":42.3,"Instagram":18.0,"Other social/video":55.1}
     * Computed from raw MOVE_TO_FOREGROUND/MOVE_TO_BACKGROUND events since local midnight,
     * which is more accurate than the coarse queryUsageStats() daily bucket.
     */
    @JavascriptInterface
    fun getUsageStatsJson(): String {
        val result = JSONObject()
        if (!hasUsagePermission()) return result.toString()

        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0)
        val startTime = cal.timeInMillis
        val endTime = System.currentTimeMillis()

        val events = usm.queryEvents(startTime, endTime)
        val lastForegroundStart = mutableMapOf<String, Long>()
        val totalForegroundMs = mutableMapOf<String, Long>()
        val event = UsageEvents.Event()

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val pkg = event.packageName ?: continue
            if (!trackedPackages.containsKey(pkg)) continue
            when (event.eventType) {
                UsageEvents.Event.MOVE_TO_FOREGROUND -> lastForegroundStart[pkg] = event.timeStamp
                UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                    val start = lastForegroundStart.remove(pkg)
                    if (start != null) {
                        totalForegroundMs[pkg] = (totalForegroundMs[pkg] ?: 0L) + (event.timeStamp - start)
                    }
                }
            }
        }
        // still-open apps: count time up to now
        lastForegroundStart.forEach { (pkg, start) ->
            totalForegroundMs[pkg] = (totalForegroundMs[pkg] ?: 0L) + (endTime - start)
        }

        val byLabel = mutableMapOf<String, Double>()
        totalForegroundMs.forEach { (pkg, ms) ->
            val label = trackedPackages[pkg]!!
            byLabel[label] = (byLabel[label] ?: 0.0) + (ms / 60000.0)
        }
        byLabel.forEach { (label, minutes) -> result.put(label, minutes) }
        return result.toString()
    }

    @JavascriptInterface
    fun getStepsToday(): Int {
        val prefs = context.getSharedPreferences("pragati_steps", Context.MODE_PRIVATE)
        return prefs.getInt("steps_today", 0)
    }
}
