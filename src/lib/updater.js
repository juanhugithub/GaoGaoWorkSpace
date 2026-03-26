import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { BUILD_APP_VERSION } from "../app/version";

export async function getCurrentAppVersion() {
  try {
    return await getVersion();
  } catch (error) {
    if (BUILD_APP_VERSION) {
      return BUILD_APP_VERSION;
    }

    throw error;
  }
}

export function checkForAppUpdate(options) {
  return check(options);
}
