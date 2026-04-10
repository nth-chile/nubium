let updateChecked = false;

export async function checkForUpdates(manual = false) {
  if (!manual && updateChecked) return;
  updateChecked = true;

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (update) {
      // Download silently in background
      await update.downloadAndInstall((event) => {
        // Could show progress, but keep it simple
        if (event.event === "Finished") {
          // Update is ready — show persistent prompt
          showUpdateDialog(update.version);
        }
      });
    } else if (manual) {
      const { showToast } = await import("./components/Toast");
      showToast("You're on the latest version", "success");
    }
  } catch {
    if (manual) {
      const { showToast } = await import("./components/Toast");
      showToast("Could not check for updates", "error");
    }
  }
}

let updateDialogVisible = false;
const updateDialogListeners = new Set<() => void>();

export function getUpdateDialogState() {
  return updateDialogVisible ? pendingVersion : null;
}

export function subscribeUpdateDialog(cb: () => void) {
  updateDialogListeners.add(cb);
  return () => updateDialogListeners.delete(cb);
}

let pendingVersion = "";

function showUpdateDialog(version: string) {
  pendingVersion = version;
  updateDialogVisible = true;
  for (const cb of updateDialogListeners) cb();
}

export function dismissUpdateDialog() {
  updateDialogVisible = false;
  for (const cb of updateDialogListeners) cb();
}

export async function restartApp() {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
