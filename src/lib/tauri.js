import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

export { emit, invoke, listen };

export async function invokeCommand(command, args = {}) {
  return invoke(command, args);
}

