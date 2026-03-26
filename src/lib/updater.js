import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";

export function getCurrentAppVersion() {
  return getVersion();
}

export function checkForAppUpdate(options) {
  return check(options);
}
