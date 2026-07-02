// Pragati — screen-time & steps integration (now writes through Store to Supabase).
// If running inside the native Android wrapper, window.AndroidBridge exposes:
//   AndroidBridge.getUsageStatsJson()  -> JSON string { "WhatsApp": minutes, ... } for TODAY
//   AndroidBridge.getStepsToday()      -> integer
//   AndroidBridge.hasUsagePermission() -> boolean
//   AndroidBridge.requestUsagePermission() -> opens system settings
// In plain browser mode (no native bridge), the UI falls back to manual daily entry.
const UsageBridge = (() => {

  function isNative() {
    return typeof window.AndroidBridge !== "undefined" && window.AndroidBridge !== null;
  }

  function hasPermission() {
    if (!isNative()) return false;
    try { return !!window.AndroidBridge.hasUsagePermission(); } catch (e) { return false; }
  }

  function requestPermission() {
    if (isNative()) {
      try { window.AndroidBridge.requestUsagePermission(); } catch (e) {}
    }
  }

  async function syncFromNative() {
    if (!isNative() || !hasPermission()) return false;
    try {
      const json = window.AndroidBridge.getUsageStatsJson();
      const data = JSON.parse(json);
      const today = Store.todayKey();
      for (const app of Object.keys(data)) {
        await Store.logUsageMinutes(app, Math.round(data[app]), today);
      }
      return true;
    } catch (e) { return false; }
  }

  async function syncStepsFromNative() {
    if (!isNative()) return false;
    try {
      const steps = window.AndroidBridge.getStepsToday();
      await Store.logSteps(steps, Store.todayKey());
      return true;
    } catch (e) { return false; }
  }

  async function manualLog(appName, minutes) {
    await Store.logUsageMinutes(appName, minutes, Store.todayKey());
  }

  async function manualSteps(count) {
    await Store.logSteps(count, Store.todayKey());
  }

  return { isNative, hasPermission, requestPermission, syncFromNative, syncStepsFromNative, manualLog, manualSteps };
})();
