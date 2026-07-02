package com.pragati.app

import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.IBinder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Lightweight background listener for the device step-counter sensor.
 * Maintains a "steps since local midnight" value in SharedPreferences that
 * UsageBridge.getStepsToday() reads. Not a foreground service (no persistent
 * notification) — acceptable for a personal single-user app; it restarts each
 * time MainActivity is opened, so a quick daily open keeps the count current.
 */
class StepTrackerService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var stepSensor: Sensor? = null

    companion object {
        private const val PREFS = "pragati_steps"
        fun start(context: Context) {
            context.startService(Intent(context, StepTrackerService::class.java))
        }
    }

    override fun onCreate() {
        super.onCreate()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        stepSensor?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || event.sensor.type != Sensor.TYPE_STEP_COUNTER) return
        val totalStepsSinceBoot = event.values[0].toInt()

        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val savedDate = prefs.getString("baseline_date", null)

        var baseline = prefs.getInt("baseline_steps", -1)
        if (savedDate != today || baseline < 0) {
            // new day (or first run): reset baseline to current sensor reading
            baseline = totalStepsSinceBoot
            prefs.edit().putString("baseline_date", today).putInt("baseline_steps", baseline).apply()
        }

        val todaySteps = (totalStepsSinceBoot - baseline).coerceAtLeast(0)
        prefs.edit().putInt("steps_today", todaySteps).apply()
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onDestroy() {
        sensorManager.unregisterListener(this)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
