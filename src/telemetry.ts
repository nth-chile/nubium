const ENDPOINT = "https://stats.nubium.rocks/ping";

export function sendLaunchPing() {
  if (import.meta.env.DEV) return;

  const version = __APP_VERSION__;
  const os = detectOS();
  const platform = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ? "desktop" : "browser";

  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, os, platform }),
  }).catch(() => {});
}

function detectOS(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "darwin";
  if (ua.includes("linux")) return "linux";
  if (ua.includes("win")) return "windows";
  return "unknown";
}
