package com.pragati.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

// Pragati main activity: hosts the web app (assets/www) inside a WebView and exposes
// UsageBridge (screen-time + steps) to the JS layer via addJavascriptInterface.
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true // required for localStorage-based state
        webView.settings.allowFileAccess = true
        webView.webViewClient = WebViewClient()

        webView.addJavascriptInterface(UsageBridge(this), "AndroidBridge")

        webView.loadUrl("file:///android_asset/www/index.html")

        // Start collecting steps in the background so getStepsToday() has fresh data.
        StepTrackerService.start(this)
    }

    override fun onResume() {
        super.onResume()
        // Let the web app re-sync usage/steps silently whenever the app is reopened, and pull
        // any changes the admin made (exam dates, new questions/topics/rewards, calendar edits)
        // instead of showing stale cached data until she happens to tap something.
        webView.evaluateJavascript(
            "if (window.UsageBridge) { UsageBridge.syncFromNative(); UsageBridge.syncStepsFromNative(); } " +
            "if (typeof backgroundRefresh === 'function') { backgroundRefresh(); }",
            null
        )
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}
