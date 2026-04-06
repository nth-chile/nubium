import { showToast } from "./components/Toast";

let updateChecked = false;

export async function checkForUpdates(manual = false) {
  // Only auto-check once per session
  if (!manual && updateChecked) return;
  updateChecked = true;

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (update) {
      showToast(
        `Update ${update.version} available — restart to install`,
        "info"
      );
      // Store for later install
      (window as any).__nubiumUpdate = update;
    } else if (manual) {
      showToast("You're on the latest version", "success");
    }
  } catch {
    // Not in Tauri, or network error — silently ignore for auto-check
    if (manual) {
      showToast("Could not check for updates", "error");
    }
  }
}

export async function installUpdate() {
  const update = (window as any).__nubiumUpdate;
  if (!update) return;

  try {
    showToast("Downloading update…", "info");
    await update.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    showToast("Update failed — try again later", "error");
    console.error("Update install failed:", err);
  }
}
