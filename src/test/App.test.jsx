import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderWithToast } from "./renderWithToast";

const settingsApi = vi.hoisted(() => ({
  getAppSettings: vi.fn(),
  listKeyboardShortcuts: vi.fn(),
  resetKeyboardShortcut: vi.fn(),
  saveAppSettings: vi.fn(),
  saveKeyboardShortcut: vi.fn(),
  verifyAppLockPassword: vi.fn(),
}));

vi.mock("../lib/settings", () => settingsApi);

vi.mock("../components/dashboard/DashboardView", () => ({
  default: () => <div>Dashboard Workspace</div>,
}));

vi.mock("../components/notes/NotesWorkspaceView", () => ({
  default: () => <div>Notes Workspace</div>,
}));

vi.mock("../components/workspace/VirtualWorkspaceView", () => ({
  default: () => <div>Virtual Workspace</div>,
}));

vi.mock("../components/journal/JournalWorkspaceView", () => ({
  default: () => <div>Journal Workspace</div>,
}));

vi.mock("../components/SettingsView", () => ({
  default: () => <div>Settings Workspace</div>,
}));

import App from "../App";

beforeEach(() => {
  settingsApi.getAppSettings.mockResolvedValue({
    appLockEnabled: true,
    hasAppLockPassword: true,
    autoLockMinutes: 0,
    autoStartEnabled: false,
    themeMode: "system",
    accentTheme: "classic-blue",
  });
  settingsApi.listKeyboardShortcuts.mockResolvedValue([]);
  settingsApi.resetKeyboardShortcut.mockResolvedValue({});
  settingsApi.saveAppSettings.mockResolvedValue({
    appLockEnabled: true,
    hasAppLockPassword: true,
    autoLockMinutes: 0,
    autoStartEnabled: false,
    themeMode: "system",
    accentTheme: "classic-blue",
  });
  settingsApi.saveKeyboardShortcut.mockResolvedValue({});
  settingsApi.verifyAppLockPassword.mockResolvedValue({
    success: true,
    message: "验证通过",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

test("restores the protected view after unlocking", async () => {
  const user = userEvent.setup();
  renderWithToast(<App />);

  expect(await screen.findByText("应用已锁定")).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText("输入锁定密码"), "1234");
  await user.click(screen.getByRole("button", { name: "解锁进入" }));

  await waitFor(() => {
    expect(settingsApi.verifyAppLockPassword).toHaveBeenCalledWith("1234");
  });

  await waitFor(() => {
    expect(screen.queryByText("应用已锁定")).not.toBeInTheDocument();
  });
  await screen.findByText("Journal Workspace");
  await user.click(screen.getByRole("button", { name: "脑图笔记" }));
  expect(screen.getByText("Notes Workspace")).toBeInTheDocument();

  const quickLockButton = screen.getByRole("button", { name: "立即锁定" });
  expect(quickLockButton).toBeEnabled();
  await user.click(quickLockButton);

  expect(screen.getByText("应用已锁定")).toBeInTheDocument();
  expect(screen.getByText("解锁后将恢复到锁定前的脑图笔记。")).toBeInTheDocument();

  await user.type(screen.getByPlaceholderText("输入锁定密码"), "1234");
  await user.click(screen.getByRole("button", { name: "解锁进入" }));

  await waitFor(() => {
    expect(settingsApi.verifyAppLockPassword).toHaveBeenCalledTimes(2);
  });

  await waitFor(() => {
    expect(screen.queryByText("应用已锁定")).not.toBeInTheDocument();
  });
  expect(screen.getByText("Notes Workspace")).toBeInTheDocument();
  await screen.findByText("已恢复到锁定前的脑图笔记，当前视图状态已保留。");
});

test("keeps quick lock disabled when lock protection is not fully configured", async () => {
  settingsApi.getAppSettings.mockResolvedValueOnce({
    appLockEnabled: true,
    hasAppLockPassword: false,
    autoLockMinutes: 0,
    autoStartEnabled: false,
    themeMode: "system",
    accentTheme: "classic-blue",
  });

  renderWithToast(<App />);

  await screen.findByText("Journal Workspace");
  expect(screen.queryByText("应用已锁定")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "立即锁定" })).toBeDisabled();
});

test("locks the app when the quick lock shortcut is pressed", async () => {
  const user = userEvent.setup();
  renderWithToast(<App />);

  await screen.findByText("应用已锁定");
  await user.type(screen.getByPlaceholderText("输入锁定密码"), "1234");
  await user.click(screen.getByRole("button", { name: "解锁进入" }));
  await screen.findByText("Journal Workspace");

  fireEvent.keyDown(window, {
    key: "l",
    ctrlKey: true,
  });

  expect(await screen.findByText("应用已锁定")).toBeInTheDocument();
});

test("opens settings when the global settings shortcut is pressed", async () => {
  const user = userEvent.setup();
  renderWithToast(<App />);

  await screen.findByText("应用已锁定");
  await user.type(screen.getByPlaceholderText("输入锁定密码"), "1234");
  await user.click(screen.getByRole("button", { name: "解锁进入" }));
  await screen.findByText("Journal Workspace");

  fireEvent.keyDown(window, {
    key: ",",
    ctrlKey: true,
  });

  expect(await screen.findByText("Settings Workspace")).toBeInTheDocument();
});
