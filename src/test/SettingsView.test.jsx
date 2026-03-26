import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, vi } from "vitest";
import { normalizeKeyboardShortcuts } from "../app/settings";
import SettingsView from "../components/SettingsView";
import { renderWithToast } from "./renderWithToast";

const updaterApi = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn(),
  getCurrentAppVersion: vi.fn(),
}));

vi.mock("../lib/updater", () => updaterApi);

const baseSettings = {
  appLockEnabled: false,
  hasAppLockPassword: true,
  autoLockMinutes: 0,
  autoStartEnabled: false,
  themeMode: "system",
  accentTheme: "classic-blue",
};

function renderSettingsView(overrides = {}) {
  const props = {
    settings: baseSettings,
    keyboardShortcuts: normalizeKeyboardShortcuts(),
    onUpdateSettings: vi.fn().mockResolvedValue(baseSettings),
    onSavePassword: vi.fn().mockResolvedValue(baseSettings),
    onUpdateShortcut: vi.fn().mockResolvedValue({}),
    onResetShortcut: vi.fn().mockResolvedValue({ accelerator: "Ctrl+L" }),
    isSaving: false,
    savingShortcutActionId: "",
    ...overrides,
  };

  return {
    ...renderWithToast(<SettingsView {...props} />),
    props,
  };
}

beforeEach(() => {
  updaterApi.getCurrentAppVersion.mockResolvedValue("1.0.326");
  updaterApi.checkForAppUpdate.mockResolvedValue(null);
});

test("applies appearance changes immediately without explicit save", async () => {
  const user = userEvent.setup();
  const { props } = renderSettingsView();

  await user.click(screen.getByRole("button", { name: /个性化与外观/ }));
  await user.click(screen.getByRole("button", { name: "暗黑" }));

  await waitFor(() => {
    expect(props.onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        themeMode: "dark",
      }),
    );
  });
});

test("shows a toast instead of saving when a recorded shortcut conflicts", async () => {
  const user = userEvent.setup();
  const onUpdateShortcut = vi.fn().mockResolvedValue({});
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  renderSettingsView({
    onUpdateShortcut,
  });

  await user.click(screen.getByRole("button", { name: /快捷键/ }));
  await user.click(screen.getByRole("button", { name: "打开全局设置 录制快捷键" }));

  fireEvent.keyDown(window, {
    key: "l",
    ctrlKey: true,
  });

  await screen.findByText(/快捷键 Ctrl\+L 已被“快速锁定应用”占用。/);
  expect(onUpdateShortcut).not.toHaveBeenCalled();

  consoleErrorSpy.mockRestore();
});

test("resets a shortcut to its default and confirms with a toast", async () => {
  const user = userEvent.setup();
  const onResetShortcut = vi.fn().mockResolvedValue({
    actionId: "quick_lock",
    accelerator: "Ctrl+L",
    defaultAccelerator: "Ctrl+L",
    isEnabled: true,
  });

  renderSettingsView({
    onResetShortcut,
  });

  await user.click(screen.getByRole("button", { name: /快捷键/ }));
  await user.click(screen.getByRole("button", { name: "快速锁定应用 恢复默认" }));

  await waitFor(() => {
    expect(onResetShortcut).toHaveBeenCalledWith("quick_lock");
  });
  await screen.findByText("已恢复默认快捷键");
  await screen.findByText("快速锁定应用 已恢复默认：Ctrl+L。");
});

test("warns instead of enabling lock protection before a password exists", async () => {
  const user = userEvent.setup();
  const { props } = renderSettingsView({
    settings: {
      ...baseSettings,
      hasAppLockPassword: false,
    },
  });

  await user.click(screen.getByText("开启应用锁定保护").closest("label"));

  expect(props.onUpdateSettings).not.toHaveBeenCalled();
  await screen.findByText("无法开启应用锁定");
  await screen.findByText("请先设置锁定密码，再开启应用锁定保护。");
});

test("saves the lock password explicitly and confirms with a toast", async () => {
  const user = userEvent.setup();
  const onSavePassword = vi.fn().mockResolvedValue({
    ...baseSettings,
    hasAppLockPassword: true,
  });

  renderSettingsView({
    settings: {
      ...baseSettings,
      hasAppLockPassword: false,
    },
    onSavePassword,
  });

  await user.type(screen.getByPlaceholderText("请输入锁定密码"), " 123456 ");
  await user.click(screen.getByRole("button", { name: "设置密码" }));

  await waitFor(() => {
    expect(onSavePassword).toHaveBeenCalledWith("123456");
  });
  await screen.findByText("锁定密码已设置");
  await screen.findByText("锁屏验证将立即使用最新密码。");
});

test("applies general settings immediately without explicit save", async () => {
  const user = userEvent.setup();
  const { props } = renderSettingsView();

  await user.click(screen.getByRole("button", { name: /系统常规/ }));
  await user.click(screen.getByText("开机时自动启动").closest("label"));

  await waitFor(() => {
    expect(props.onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        autoStartEnabled: true,
      }),
    );
  });
});

test("shows the current version in the lower-left settings footer", async () => {
  renderSettingsView();

  expect(await screen.findByText("v1.0.326")).toBeInTheDocument();
  expect(screen.getByText("Version")).toBeInTheDocument();
});

test("checks for updates and downloads the available release in settings", async () => {
  const user = userEvent.setup();
  const update = {
    currentVersion: "1.0.326",
    version: "1.0.327",
    body: "修复若干问题",
    date: "2026-03-26T10:00:00.000Z",
    rawJson: {},
    close: vi.fn().mockResolvedValue(undefined),
    downloadAndInstall: vi.fn().mockImplementation(async (onEvent) => {
      onEvent({
        event: "Started",
        data: { contentLength: 100 },
      });
      onEvent({
        event: "Progress",
        data: { chunkLength: 25 },
      });
      onEvent({
        event: "Progress",
        data: { chunkLength: 75 },
      });
      onEvent({
        event: "Finished",
      });
    }),
  };

  updaterApi.checkForAppUpdate.mockResolvedValue(update);

  renderSettingsView();

  await screen.findByText("v1.0.326");
  await user.click(screen.getByRole("button", { name: /高级维护/ }));
  await user.click(screen.getByRole("button", { name: "检查更新" }));

  await waitFor(() => {
    expect(updaterApi.checkForAppUpdate).toHaveBeenCalledTimes(1);
  });

  await screen.findByText("新版本 v1.0.327 已可安装");
  await screen.findByText("修复若干问题");

  await user.click(screen.getByRole("button", { name: "下载并安装" }));

  await waitFor(() => {
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  await screen.findByText("更新包已下载完成");
});
