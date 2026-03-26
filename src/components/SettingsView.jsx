import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  DatabaseZap,
  FolderOpen,
  Keyboard,
  KeyRound,
  Loader2,
  LockKeyhole,
  MoonStar,
  Palette,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  TimerReset,
  RefreshCw,
  Wrench,
} from "lucide-react";
import {
  ACCENT_THEMES,
  AUTO_LOCK_OPTIONS,
  formatShortcutFromEvent,
  normalizeAppSettings,
  RESERVED_ACCELERATORS,
  SHORTCUT_ACTIONS,
  SHORTCUT_ACTIONS_BY_ID,
  THEME_MODE_OPTIONS,
} from "../app/settings";
import { useToast } from "./common/ToastProvider";
import { openLogDirectory, vacuumDatabase } from "../lib/settings";
import { checkForAppUpdate, getCurrentAppVersion } from "../lib/updater";

const SECTIONS = [
  {
    id: "privacy",
    label: "隐私与安全",
    description: "锁屏与访问保护",
    icon: Shield,
  },
  {
    id: "general",
    label: "系统常规",
    description: "启动与系统行为",
    icon: SlidersHorizontal,
  },
  {
    id: "appearance",
    label: "个性化与外观",
    description: "主题与强调色",
    icon: Palette,
  },
  {
    id: "shortcuts",
    label: "快捷键",
    description: "高频动作与导航效率",
    icon: Keyboard,
  },
  {
    id: "advanced",
    label: "高级维护",
    description: "数据库与日志",
    icon: Wrench,
  },
];

const SHORTCUT_SECTION_ORDER = ["全局", "导航", "工作日记"];

function formatVersion(version) {
  if (!version) {
    return "--";
  }

  return version.startsWith("v") ? version : `v${version}`;
}

function formatBytes(byteCount) {
  if (!byteCount) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = byteCount;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDateTime(dateValue) {
  if (!dateValue) {
    return "";
  }

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return String(dateValue);
  }

  return parsedDate.toLocaleString();
}

function formatCheckedTime(dateValue) {
  if (!(dateValue instanceof Date)) {
    return "";
  }

  return dateValue.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ToggleSwitch({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm ${
        disabled ? "opacity-70" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-bold text-gray-900">{label}</div>
        {description && <div className="mt-1 text-sm text-gray-500">{description}</div>}
      </div>
      <span className="relative mt-1 inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          className={`flex h-7 w-12 items-center rounded-full border transition-colors ${
            checked ? "border-blue-600 bg-blue-600" : "border-gray-300 bg-gray-200"
          } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span
            className={`mx-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              checked ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </span>
      </span>
    </label>
  );
}

function InlineSwitch({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition-all ${
        checked
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span>{checked ? "已启用" : "已禁用"}</span>
      <span
        className={`flex h-6 w-10 items-center rounded-full border transition-colors ${
          checked ? "border-blue-600 bg-blue-600" : "border-gray-300 bg-gray-200"
        }`}
      >
        <span
          className={`mx-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

function SettingsView({
  settings,
  keyboardShortcuts,
  onUpdateSettings,
  onSavePassword,
  onUpdateShortcut,
  onResetShortcut,
  isSaving,
  savingShortcutActionId,
}) {
  const { showToast } = useToast();
  const [activeSection, setActiveSection] = useState("privacy");
  const [passwordInput, setPasswordInput] = useState("");
  const [recordingActionId, setRecordingActionId] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isVacuuming, setIsVacuuming] = useState(false);
  const [isOpeningLogs, setIsOpeningLogs] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState(null);
  const [updateState, setUpdateState] = useState("idle");
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({
    downloadedBytes: 0,
    totalBytes: 0,
  });
  const normalizedSettings = useMemo(() => normalizeAppSettings(settings), [settings]);
  const shortcutMap = useMemo(
    () => new Map(keyboardShortcuts.map((shortcut) => [shortcut.actionId, shortcut])),
    [keyboardShortcuts],
  );
  const shortcutGroups = useMemo(
    () =>
      SHORTCUT_SECTION_ORDER.map((section) => ({
        section,
        actions: SHORTCUT_ACTIONS.filter((action) => action.section === section),
      })),
    [],
  );

  useEffect(() => {
    if (!recordingActionId) {
      return undefined;
    }

    const handleKeyDown = async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecordingActionId("");
        showToast({
          tone: "info",
          title: "已取消快捷键录制",
          description: "当前快捷键保持不变。",
        });
        return;
      }

      const shortcut = shortcutMap.get(recordingActionId);
      if (!shortcut) {
        setRecordingActionId("");
        return;
      }

      const accelerator = formatShortcutFromEvent(event);
      if (!accelerator) {
        return;
      }

      try {
        await handleShortcutPersist({
          ...shortcut,
          accelerator,
          isEnabled: true,
        });
        setRecordingActionId("");
      } catch (error) {
        console.error(error);
        showToast({
          tone: "error",
          title: "录制快捷键失败",
          description: String(error),
          duration: 4200,
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [recordingActionId, shortcutMap, showToast]);

  useEffect(() => {
    document.body.dataset.shortcutRecording = recordingActionId ? "true" : "false";
    return () => {
      document.body.dataset.shortcutRecording = "false";
    };
  }, [recordingActionId]);

  const activeSectionMeta = useMemo(
    () => SECTIONS.find((section) => section.id === activeSection) ?? SECTIONS[0],
    [activeSection],
  );
  const ActiveSectionIcon = activeSectionMeta.icon;
  const updateReleaseNotes =
    availableUpdate?.body?.trim() || availableUpdate?.rawJson?.notes?.toString().trim() || "";
  const progressPercent =
    downloadProgress.totalBytes > 0
      ? Math.min(100, Math.round((downloadProgress.downloadedBytes / downloadProgress.totalBytes) * 100))
      : 0;

  const passwordHint = normalizedSettings.hasAppLockPassword
    ? "留空表示保持现有密码不变。"
    : "首次开启应用锁定时，必须先设置密码。";

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentVersion() {
      try {
        const version = await getCurrentAppVersion();
        if (!cancelled) {
          setCurrentVersion(version);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          showToast({
            tone: "error",
            title: "读取当前版本失败",
            description: String(error),
            duration: 4200,
          });
        }
      }
    }

    loadCurrentVersion();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(
    () => () => {
      if (availableUpdate) {
        availableUpdate.close().catch(() => {});
      }
    },
    [availableUpdate],
  );

  function replaceAvailableUpdate(nextUpdate) {
    setAvailableUpdate(nextUpdate);
  }

  async function applySettingsPatch(partial) {
    const nextSettings = normalizeAppSettings({
      ...normalizedSettings,
      ...partial,
    });

    if (nextSettings.appLockEnabled && !normalizedSettings.hasAppLockPassword) {
      showToast({
        tone: "warning",
        title: "无法开启应用锁定",
        description: "请先设置锁定密码，再开启应用锁定保护。",
        duration: 4200,
      });
      return;
    }

    try {
      await onUpdateSettings(nextSettings);
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        title: "更新设置失败",
        description: String(error),
        duration: 4200,
      });
    }
  }

  async function handleSavePassword() {
    if (!passwordInput.trim()) {
      showToast({
        tone: "warning",
        title: "请输入锁定密码",
        description: "密码为空时无法开启或更新锁定保护。",
      });
      return;
    }

    setIsSavingPassword(true);
    try {
      await onSavePassword(passwordInput.trim());
      setPasswordInput("");
      showToast({
        tone: "success",
        title: normalizedSettings.hasAppLockPassword ? "锁定密码已更新" : "锁定密码已设置",
        description: "锁屏验证将立即使用最新密码。",
      });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        title: "保存锁定密码失败",
        description: String(error),
        duration: 4200,
      });
    } finally {
      setIsSavingPassword(false);
    }
  }

  function validateAccelerator(actionId, accelerator, isEnabled) {
    if (!accelerator) {
      throw new Error("请按下一个快捷键组合。");
    }

    if (RESERVED_ACCELERATORS.has(accelerator)) {
      throw new Error(`快捷键 ${accelerator} 为系统保留组合，请更换。`);
    }

    const parts = accelerator.split("+");
    const hasModifier = parts.length > 1;
    const mainKey = parts[parts.length - 1];
    if (!hasModifier && !/^F\d{1,2}$/i.test(mainKey)) {
      throw new Error("快捷键至少包含一个修饰键（Ctrl / Alt / Shift）。");
    }

    if (!isEnabled) {
      return;
    }

    const conflictShortcut = keyboardShortcuts.find(
      (shortcut) =>
        shortcut.actionId !== actionId &&
        shortcut.isEnabled &&
        shortcut.accelerator === accelerator,
    );
    if (conflictShortcut) {
      const conflictMeta = SHORTCUT_ACTIONS_BY_ID[conflictShortcut.actionId];
      throw new Error(`快捷键 ${accelerator} 已被“${conflictMeta.label}”占用。`);
    }
  }

  async function handleShortcutPersist(nextShortcut) {
    validateAccelerator(nextShortcut.actionId, nextShortcut.accelerator, nextShortcut.isEnabled);
    await onUpdateShortcut(nextShortcut);
    const actionMeta = SHORTCUT_ACTIONS_BY_ID[nextShortcut.actionId];
    showToast({
      tone: "success",
      title: "快捷键已更新",
      description: `${actionMeta.label} 已应用为 ${nextShortcut.accelerator}。`,
    });
  }

  async function handleShortcutToggle(shortcut, isEnabled) {
    if (!shortcut) {
      return;
    }

    try {
      validateAccelerator(shortcut.actionId, shortcut.accelerator, isEnabled);
      await onUpdateShortcut({
        ...shortcut,
        isEnabled,
      });
      const actionMeta = SHORTCUT_ACTIONS_BY_ID[shortcut.actionId];
      showToast({
        tone: "success",
        title: isEnabled ? "快捷键已启用" : "快捷键已禁用",
        description: `${actionMeta.label}${isEnabled ? " 已启用。" : " 已禁用。"}`,
      });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        title: "切换快捷键状态失败",
        description: String(error),
        duration: 4200,
      });
    }
  }

  async function handleShortcutReset(actionId) {
    try {
      const savedShortcut = await onResetShortcut(actionId);
      const actionMeta = SHORTCUT_ACTIONS_BY_ID[actionId];
      showToast({
        tone: "success",
        title: "已恢复默认快捷键",
        description: `${actionMeta.label} 已恢复默认：${savedShortcut.accelerator}。`,
      });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        title: "恢复默认快捷键失败",
        description: String(error),
        duration: 4200,
      });
    }
  }

  async function handleVacuumDatabase() {
    setIsVacuuming(true);
    try {
      const result = await vacuumDatabase();
      showToast({
        tone: "success",
        title: "数据库整理完成",
        description: result.message || "数据库清理完成。",
        duration: 4200,
      });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        title: "数据库整理失败",
        description: String(error),
        duration: 4200,
      });
    } finally {
      setIsVacuuming(false);
    }
  }

  async function handleOpenLogDirectory() {
    setIsOpeningLogs(true);
    try {
      const result = await openLogDirectory();
      showToast({
        tone: "success",
        title: "日志目录已打开",
        description: result.message || "已打开日志目录。",
      });
    } catch (error) {
      console.error(error);
      showToast({
        tone: "error",
        title: "打开日志目录失败",
        description: String(error),
        duration: 4200,
      });
    } finally {
      setIsOpeningLogs(false);
    }
  }

  async function handleCheckForUpdates() {
    setIsCheckingUpdate(true);
    try {
      const update = await checkForAppUpdate();
      setLastCheckedAt(new Date());
      setDownloadProgress({
        downloadedBytes: 0,
        totalBytes: 0,
      });

      if (!update) {
        replaceAvailableUpdate(null);
        setUpdateState("up-to-date");
        showToast({
          tone: "success",
          title: "当前已是最新版本",
          description: `当前版本 ${formatVersion(currentVersion)} 无需更新。`,
        });
        return;
      }

      replaceAvailableUpdate(update);
      setUpdateState("available");
      showToast({
        tone: "info",
        title: "发现新版本",
        description: `可从 ${formatVersion(update.currentVersion)} 更新到 ${formatVersion(update.version)}。`,
        duration: 4200,
      });
    } catch (error) {
      console.error(error);
      setUpdateState("error");
      showToast({
        tone: "error",
        title: "检查更新失败",
        description: String(error),
        duration: 4200,
      });
    } finally {
      setIsCheckingUpdate(false);
    }
  }

  async function handleInstallUpdate() {
    if (!availableUpdate) {
      return;
    }

    setIsInstallingUpdate(true);
    setUpdateState("installing");
    setDownloadProgress({
      downloadedBytes: 0,
      totalBytes: 0,
    });

    try {
      await availableUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setDownloadProgress({
            downloadedBytes: 0,
            totalBytes: event.data.contentLength ?? 0,
          });
          return;
        }

        if (event.event === "Progress") {
          setDownloadProgress((current) => ({
            ...current,
            downloadedBytes: current.downloadedBytes + event.data.chunkLength,
          }));
          return;
        }

        setDownloadProgress((current) => ({
          downloadedBytes: current.totalBytes || current.downloadedBytes,
          totalBytes: current.totalBytes,
        }));
      });

      replaceAvailableUpdate(null);
      setUpdateState("installed");
      showToast({
        tone: "success",
        title: "更新包已下载完成",
        description: "安装程序已启动。若应用未自动退出，请手动关闭并重新打开以完成更新。",
        duration: 5200,
      });
    } catch (error) {
      console.error(error);
      setUpdateState("available");
      showToast({
        tone: "error",
        title: "下载安装更新失败",
        description: String(error),
        duration: 4200,
      });
    } finally {
      setIsInstallingUpdate(false);
    }
  }

  return (
    <div className="flex-1 overflow-hidden">
      <div className="flex h-full gap-4">
        <aside className="flex h-full w-[280px] shrink-0 flex-col rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="px-2 pb-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-gray-400">
              Global Settings
            </div>
            <h2 className="mt-2 text-2xl font-black text-gray-900">全局设置</h2>
            <p className="mt-2 text-sm text-gray-500">
              统一管理应用锁定、开机行为、主题外观、快捷键和底层维护能力。
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const isActive = section.id === activeSection;

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                    isActive
                      ? "border-blue-300 bg-blue-50 shadow-sm"
                      : "border-transparent bg-white hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                        isActive ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-bold ${isActive ? "text-blue-700" : "text-gray-900"}`}>
                        {section.label}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{section.description}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-auto px-2 pt-4">
            <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] px-4 py-3 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
                Version
              </div>
              <div className="mt-2 text-lg font-black text-gray-900">{formatVersion(currentVersion)}</div>
              <div className="mt-1 text-xs text-gray-500">
                {availableUpdate
                  ? `发现可更新版本 ${formatVersion(availableUpdate.version)}`
                  : lastCheckedAt
                    ? `最近检查：${formatCheckedTime(lastCheckedAt)}`
                    : "尚未检查更新"}
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                  <ActiveSectionIcon size={22} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl font-black text-gray-900">{activeSectionMeta.label}</h3>
                  <p className="mt-1 text-sm text-gray-500">{activeSectionMeta.description}</p>
                </div>
              </div>
              {isSaving && (
                <div className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                  <Loader2 size={14} className="animate-spin" />
                  正在同步设置
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-[#FAFAFA] px-6 py-6 scrollbar-thin">
            <div className="mx-auto flex max-w-4xl flex-col gap-5">
              {activeSection === "privacy" && (
                <>
                  <ToggleSwitch
                    checked={normalizedSettings.appLockEnabled}
                    disabled={isSaving}
                    onChange={(checked) => applySettingsPatch({ appLockEnabled: checked })}
                    label="开启应用锁定保护"
                    description="启用后，应用可在启动后、手动快捷锁定或静置超时后进入锁定遮罩。"
                  />

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                      <KeyRound size={16} className="text-blue-600" />
                      锁定密码
                    </div>
                    <div className="mt-2 text-sm text-gray-500">{passwordHint}</div>
                    <div className="mt-2 text-xs text-gray-400">
                      当前状态：{normalizedSettings.hasAppLockPassword ? "已设置密码" : "未设置密码"}
                    </div>
                    <div className="mt-4 flex flex-col gap-3 md:flex-row">
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(event) => setPasswordInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleSavePassword();
                          }
                        }}
                        placeholder={
                          normalizedSettings.hasAppLockPassword
                            ? "输入新密码以覆盖现有密码"
                            : "请输入锁定密码"
                        }
                        className="flex-1 rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        type="button"
                        onClick={handleSavePassword}
                        disabled={isSavingPassword || isSaving}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm shadow-blue-200 transition-all hover:bg-blue-700 disabled:opacity-60"
                      >
                        {isSavingPassword && <Loader2 size={14} className="animate-spin" />}
                        {normalizedSettings.hasAppLockPassword ? "更新密码" : "设置密码"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                      <TimerReset size={16} className="text-blue-600" />
                      静置后自动锁定
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      锁定后仅保留一个极简密码输入框，避免工作台在离开工位时暴露内容。
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {AUTO_LOCK_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={isSaving}
                          onClick={() => applySettingsPatch({ autoLockMinutes: option.value })}
                          className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                            normalizedSettings.autoLockMinutes === option.value
                              ? "border-blue-300 bg-blue-50"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          } disabled:opacity-70`}
                        >
                          <div className="text-sm font-bold text-gray-900">{option.label}</div>
                          <div className="mt-1 text-xs text-gray-500">{option.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {activeSection === "general" && (
                <ToggleSwitch
                  checked={normalizedSettings.autoStartEnabled}
                  disabled={isSaving}
                  onChange={(checked) => applySettingsPatch({ autoStartEnabled: checked })}
                  label="开机时自动启动"
                  description="改动后立即同步系统登录项，当前面向 Windows 桌面环境。"
                />
              )}

              {activeSection === "appearance" && (
                <>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                      <Sparkles size={16} className="text-blue-600" />
                      主题模式
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      切换整个应用的亮暗方案，设置页与工作区保持同步。
                    </div>
                    <div className="mt-4 inline-flex rounded-2xl border border-gray-200 bg-gray-50 p-1">
                      {THEME_MODE_OPTIONS.map((option) => {
                        const isActive = normalizedSettings.themeMode === option.value;
                        const icon =
                          option.value === "light" ? (
                            <SunMedium size={15} />
                          ) : option.value === "dark" ? (
                            <MoonStar size={15} />
                          ) : (
                            <Sparkles size={15} />
                          );

                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={isSaving}
                            onClick={() => applySettingsPatch({ themeMode: option.value })}
                            className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition-all ${
                              isActive ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                            } disabled:opacity-70`}
                          >
                            {icon}
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                      <Palette size={16} className="text-blue-600" />
                      强调色
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      顶栏激活态、主按钮、锁屏焦点态与设置页都会统一跟随所选强调色。
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {Object.entries(ACCENT_THEMES).map(([key, theme]) => {
                        const isActive = normalizedSettings.accentTheme === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={isSaving}
                            onClick={() => applySettingsPatch({ accentTheme: key })}
                            className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                              isActive ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
                            } disabled:opacity-70`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="h-10 w-10 rounded-2xl border border-white/60 shadow-sm"
                                style={{ backgroundColor: theme.swatch }}
                              />
                              <div>
                                <div className="text-sm font-bold text-gray-900">{theme.label}</div>
                                <div className="mt-1 text-xs text-gray-500">{theme.swatch}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {activeSection === "shortcuts" && (
                <>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                      <Keyboard size={16} className="text-blue-600" />
                      科学默认方案
                    </div>
                    <div className="mt-2 text-sm text-gray-500">
                      全局动作采用 Ctrl 组合，导航使用 Alt + 数字，日记高频动作保留 Ctrl+S 与 Ctrl+Alt+J，
                      兼顾记忆成本、冲突概率和单手可达性。
                    </div>
                  </div>

                  {shortcutGroups.map(({ section, actions }) => (
                    <div key={section} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="text-sm font-bold text-gray-900">{section}</div>
                      <div className="mt-1 text-sm text-gray-500">
                        {section === "全局"
                          ? "影响整个应用的基础动作。"
                          : section === "导航"
                            ? "用于跨模块快速切换。"
                            : "面向日记录入和当天执行流。"}
                      </div>

                      <div className="mt-4 flex flex-col gap-4">
                        {actions.map((action) => {
                          const shortcut = shortcutMap.get(action.actionId);
                          const isRecording = recordingActionId === action.actionId;
                          const isSavingCurrent = savingShortcutActionId === action.actionId;

                          return (
                            <div
                              key={action.actionId}
                              className="rounded-2xl border border-gray-200 bg-[#FAFAFA] px-4 py-4"
                            >
                              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-bold text-gray-900">{action.label}</div>
                                    <span className="rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
                                      {shortcut?.accelerator}
                                    </span>
                                    {!shortcut?.isEnabled && (
                                      <span className="rounded-xl bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                                        已禁用
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-2 text-sm text-gray-500">{action.description}</div>
                                  <div className="mt-2 text-xs text-gray-400">
                                    默认值：{shortcut?.defaultAccelerator}
                                  </div>
                                </div>

                                <InlineSwitch
                                  checked={shortcut?.isEnabled ?? false}
                                  disabled={isSavingCurrent}
                                  onChange={(checked) => handleShortcutToggle(shortcut, checked)}
                                />
                              </div>

                              <div className="mt-4 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isSavingCurrent}
                                  onClick={() =>
                                    setRecordingActionId((current) =>
                                      current === action.actionId ? "" : action.actionId,
                                    )
                                  }
                                  aria-label={`${action.label} 录制快捷键`}
                                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold transition-all ${
                                    isRecording
                                      ? "border border-blue-300 bg-blue-50 text-blue-700"
                                      : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                  } disabled:opacity-60`}
                                >
                                  {isSavingCurrent ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Keyboard size={14} />
                                  )}
                                  {isRecording ? "按下新的组合键..." : "录制快捷键"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isSavingCurrent}
                                  onClick={() => handleShortcutReset(action.actionId)}
                                  aria-label={`${action.label} 恢复默认`}
                                  className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-60"
                                >
                                  <RotateCcw size={14} />
                                  恢复默认
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {activeSection === "advanced" && (
                <>
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                          <ArrowDownToLine size={16} className="text-blue-600" />
                          应用更新
                        </div>
                        <div className="mt-2 text-sm text-gray-500">
                          从已配置的更新源检查最新版本，并在应用内完成下载与安装。
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] px-4 py-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                              当前版本
                            </div>
                            <div className="mt-2 text-lg font-black text-gray-900">
                              {formatVersion(availableUpdate?.currentVersion || currentVersion)}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-gray-200 bg-[#FAFAFA] px-4 py-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                              更新状态
                            </div>
                            <div className="mt-2 text-sm font-bold text-gray-900">
                              {isInstallingUpdate
                                ? "正在下载安装更新"
                                : isCheckingUpdate
                                  ? "正在检查更新"
                                  : availableUpdate
                                    ? `发现新版本 ${formatVersion(availableUpdate.version)}`
                                    : updateState === "up-to-date"
                                      ? "当前已是最新版本"
                                      : updateState === "installed"
                                        ? "安装程序已启动"
                                        : "尚未执行检查"}
                            </div>
                            {lastCheckedAt && (
                              <div className="mt-1 text-xs text-gray-500">
                                最近检查：{formatDateTime(lastCheckedAt.toISOString())}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCheckForUpdates}
                        disabled={isCheckingUpdate || isInstallingUpdate}
                        className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-60"
                      >
                        {isCheckingUpdate ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        {isCheckingUpdate ? "检查中..." : "检查更新"}
                      </button>
                    </div>

                    {availableUpdate && (
                      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-blue-900">
                              新版本 {formatVersion(availableUpdate.version)} 已可安装
                            </div>
                            <div className="mt-2 text-sm text-blue-900/80">
                              {availableUpdate.date
                                ? `发布日期：${formatDateTime(availableUpdate.date)}`
                                : "发布信息已获取，随时可下载安装。"}
                            </div>
                            <div className="mt-3 rounded-2xl border border-blue-100 bg-white/80 px-4 py-3 text-sm leading-6 text-gray-700 whitespace-pre-wrap">
                              {updateReleaseNotes || "本次发布未提供更新说明。"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={handleInstallUpdate}
                            disabled={isInstallingUpdate || isCheckingUpdate}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-sm shadow-blue-200 transition-all hover:bg-blue-700 disabled:opacity-60"
                          >
                            {isInstallingUpdate ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <ArrowDownToLine size={14} />
                            )}
                            {isInstallingUpdate ? "下载并安装中..." : "下载并安装"}
                          </button>
                        </div>

                        {(isInstallingUpdate || downloadProgress.downloadedBytes > 0) && (
                          <div className="mt-4">
                            <div className="flex items-center justify-between text-xs font-semibold text-blue-900/80">
                              <span>
                                已下载 {formatBytes(downloadProgress.downloadedBytes)}
                                {downloadProgress.totalBytes > 0
                                  ? ` / ${formatBytes(downloadProgress.totalBytes)}`
                                  : ""}
                              </span>
                              <span>
                                {downloadProgress.totalBytes > 0 ? `${progressPercent}%` : "处理中"}
                              </span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
                              <div
                                className="h-full rounded-full bg-blue-600 transition-all"
                                style={{
                                  width: `${downloadProgress.totalBytes > 0 ? progressPercent : 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                          <DatabaseZap size={16} className="text-blue-600" />
                          深度清理与压缩数据库
                        </div>
                        <div className="mt-2 text-sm text-gray-500">
                          清理历史数据碎片，释放本地存储空间，提升查表速度。
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleVacuumDatabase}
                        disabled={isVacuuming}
                        className="shrink-0 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-200 transition-all hover:bg-blue-700 disabled:opacity-60"
                      >
                        {isVacuuming ? "执行中..." : "立即执行"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                          <FolderOpen size={16} className="text-blue-600" />
                          打开本地日志目录
                        </div>
                        <div className="mt-2 text-sm text-gray-500">
                          维护日志与数据库整理记录都保存在应用本地日志目录中。
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenLogDirectory}
                        disabled={isOpeningLogs}
                        className="shrink-0 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-60"
                      >
                        {isOpeningLogs ? "打开中..." : "打开目录"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 bg-white px-6 py-4">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <LockKeyhole size={15} className="text-blue-600" />
                所有开关、主题和强调色即时生效；密码、快捷键和维护动作各自独立应用。
              </div>
              {recordingActionId && (
                <div className="text-sm font-semibold text-blue-700">
                  正在录制：{SHORTCUT_ACTIONS_BY_ID[recordingActionId].label}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default SettingsView;
