import { beforeEach, vi } from "vitest";

const appApi = vi.hoisted(() => ({
  getVersion: vi.fn(),
}));

const updaterPlugin = vi.hoisted(() => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => appApi);
vi.mock("@tauri-apps/plugin-updater", () => updaterPlugin);

import { BUILD_APP_VERSION } from "../app/version";
import { checkForAppUpdate, getCurrentAppVersion } from "../lib/updater";

beforeEach(() => {
  vi.clearAllMocks();
});

test("falls back to the build version when the runtime version lookup fails", async () => {
  appApi.getVersion.mockRejectedValue(new Error("runtime version unavailable"));

  await expect(getCurrentAppVersion()).resolves.toBe(BUILD_APP_VERSION);
});

test("forwards update checks to the updater plugin", async () => {
  const updateResult = { version: "1.0.330" };
  updaterPlugin.check.mockResolvedValue(updateResult);

  await expect(checkForAppUpdate()).resolves.toBe(updateResult);
  expect(updaterPlugin.check).toHaveBeenCalledTimes(1);
});
