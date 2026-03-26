import { invokeCommand } from "./tauri";

export function getAppSettings() {
  return invokeCommand("get_app_settings");
}

export function saveAppSettings(settings) {
  return invokeCommand("save_app_settings", { settings });
}

export function listKeyboardShortcuts() {
  return invokeCommand("list_keyboard_shortcuts");
}

export function saveKeyboardShortcut(shortcut) {
  return invokeCommand("save_keyboard_shortcut", { shortcut });
}

export function resetKeyboardShortcut(actionId) {
  return invokeCommand("reset_keyboard_shortcut", { actionId });
}

export function verifyAppLockPassword(password) {
  return invokeCommand("verify_app_lock_password", { password });
}

export function vacuumDatabase() {
  return invokeCommand("vacuum_database");
}

export function openLogDirectory() {
  return invokeCommand("open_log_directory");
}
