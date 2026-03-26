import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  FolderTree,
  LockKeyhole,
  Settings,
} from "lucide-react";
import {
  ACCENT_THEMES,
  APP_SHORTCUT_EVENT_NAME,
  DEFAULT_APP_SETTINGS,
  formatShortcutFromEvent,
  isEditableTarget,
  normalizeAppSettings,
  normalizeKeyboardShortcuts,
  SHORTCUT_ACTIONS_BY_ID,
} from "./app/settings";
import SettingsView from "./components/SettingsView";
import TabButton from "./components/common/TabButton";
import { useToast } from "./components/common/ToastProvider";
import DashboardView from "./components/dashboard/DashboardView";
import JournalWorkspaceView from "./components/journal/JournalWorkspaceView";
import NotesWorkspaceView from "./components/notes/NotesWorkspaceView";
import VirtualWorkspaceView from "./components/workspace/VirtualWorkspaceView";
import {
  getAppSettings,
  listKeyboardShortcuts,
  resetKeyboardShortcut,
  saveAppSettings,
  saveKeyboardShortcut,
  verifyAppLockPassword,
} from "./lib/settings";
import { checkForAppUpdate } from "./lib/updater";

const ACTIVE_TAB_STORAGE_KEY = "personal-os.active-tab";
const LOCK_STATE_STORAGE_KEY = "personal-os.lock-state";
const LOCK_STATE_LOCKED = "locked";
const LOCK_STATE_UNLOCKED = "unlocked";
const UPDATE_NOTICE_STORAGE_KEY = "personal-os.notified-update-version";
const VALID_TABS = ["workspace", "dashboard", "notes", "journal", "settings"];
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
const TAB_ACTIONS = {
  tab_workspace: "workspace",
  tab_dashboard: "dashboard",
  tab_notes: "notes",
  tab_journal: "journal",
};
const JOURNAL_SHORTCUT_ACTIONS = new Set(["save_current_journal", "create_today_journal"]);
const TAB_LABELS = {
  workspace: "文件空间",
  dashboard: "数据看板",
  notes: "脑图笔记",
  journal: "工作日记",
  settings: "全局设置",
};

function getInitialActiveTab() {
  if (typeof window === "undefined") {
    return "journal";
  }

  const storedValue = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return VALID_TABS.includes(storedValue) ? storedValue : "journal";
}

function getSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getNavigationType() {
  if (typeof window === "undefined" || typeof window.performance === "undefined") {
    return "navigate";
  }

  if (typeof window.performance.getEntriesByType === "function") {
    const navigationEntries = window.performance.getEntriesByType("navigation");
    const navigationEntry = navigationEntries[0];
    if (navigationEntry && typeof navigationEntry.type === "string") {
      return navigationEntry.type;
    }
  }

  if (window.performance.navigation && typeof window.performance.navigation.type === "number") {
    return window.performance.navigation.type === 1 ? "reload" : "navigate";
  }

  return "navigate";
}

function getReloadLockState() {
  if (typeof window === "undefined" || getNavigationType() !== "reload") {
    return "";
  }

  try {
    return window.sessionStorage.getItem(LOCK_STATE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function persistLockState(isLocked) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      LOCK_STATE_STORAGE_KEY,
      isLocked ? LOCK_STATE_LOCKED : LOCK_STATE_UNLOCKED,
    );
  } catch {}
}

function resolveInitialLockState(settings) {
  if (!settings.appLockEnabled || !settings.hasAppLockPassword) {
    return false;
  }

  const reloadLockState = getReloadLockState();
  if (reloadLockState === LOCK_STATE_LOCKED) {
    return true;
  }
  if (reloadLockState === LOCK_STATE_UNLOCKED) {
    return false;
  }

  return true;
}

function formatVersion(version) {
  if (!version) {
    return "--";
  }

  return version.startsWith("v") ? version : `v${version}`;
}

function getNotifiedUpdateVersion() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(UPDATE_NOTICE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function persistNotifiedUpdateVersion(version) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(UPDATE_NOTICE_STORAGE_KEY, version);
  } catch {}
}

function applyAccentTheme(accentTheme) {
  const accent = ACCENT_THEMES[accentTheme] ?? ACCENT_THEMES["classic-blue"];
  const root = document.documentElement;
  Object.entries(accent.colors).forEach(([token, value]) => {
    root.style.setProperty(`--accent-${token}`, value);
  });
}

function App() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState(getInitialActiveTab);
  const [appSettings, setAppSettings] = useState(DEFAULT_APP_SETTINGS);
  const [keyboardShortcuts, setKeyboardShortcuts] = useState(() => normalizeKeyboardShortcuts());
  const [isSettingsReady, setIsSettingsReady] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [savingShortcutActionId, setSavingShortcutActionId] = useState("");
  const [systemTheme, setSystemTheme] = useState(getSystemTheme);
  const [isLocked, setIsLocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [pendingJournalShortcutAction, setPendingJournalShortcutAction] = useState("");
  const [lockedViewSnapshot, setLockedViewSnapshot] = useState(() => ({
    tab: getInitialActiveTab(),
    label: TAB_LABELS[getInitialActiveTab()] ?? "当前界面",
  }));
  const autoLockTimerRef = useRef(null);
  const activeTabRef = useRef(getInitialActiveTab());
  const appSettingsRef = useRef(DEFAULT_APP_SETTINGS);
  const keyboardShortcutsRef = useRef(normalizeKeyboardShortcuts());
  const settingsSaveTokenRef = useRef(0);
  const hasCheckedStartupUpdateRef = useRef(false);

  const resolvedThemeMode = useMemo(() => {
    if (appSettings.themeMode === "system") {
      return systemTheme;
    }
    return appSettings.themeMode;
  }, [appSettings.themeMode, systemTheme]);

  const canQuickLock = appSettings.appLockEnabled && appSettings.hasAppLockPassword;

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    appSettingsRef.current = appSettings;
  }, [appSettings]);

  useEffect(() => {
    keyboardShortcutsRef.current = keyboardShortcuts;
  }, [keyboardShortcuts]);

  useEffect(() => {
    if (!isLocked) {
      setLockedViewSnapshot({
        tab: activeTab,
        label: TAB_LABELS[activeTab] ?? "当前界面",
      });
    }
  }, [activeTab, isLocked]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!isSettingsReady) {
      return;
    }

    persistLockState(isLocked);
  }, [isLocked, isSettingsReady]);

  useEffect(() => {
    let cancelled = false;

    async function loadAppState() {
      try {
        const [settingsResponse, shortcutsResponse] = await Promise.all([
          getAppSettings(),
          listKeyboardShortcuts(),
        ]);
        if (cancelled) {
          return;
        }

        const settings = normalizeAppSettings(settingsResponse);
        const shortcuts = normalizeKeyboardShortcuts(shortcutsResponse);
        setAppSettings(settings);
        setKeyboardShortcuts(shortcuts);
        setLockedViewSnapshot({
          tab: activeTabRef.current,
          label: TAB_LABELS[activeTabRef.current] ?? "当前界面",
        });
        setIsLocked(resolveInitialLockState(settings));
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          showToast({
            tone: "error",
            title: "加载应用配置失败",
            description: String(error),
            duration: 4200,
          });
        }
      } finally {
        if (!cancelled) {
          setIsSettingsReady(true);
        }
      }
    }

    loadAppState();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event) => setSystemTheme(event.matches ? "dark" : "light");

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    document.body.dataset.theme = resolvedThemeMode;
    document.documentElement.dataset.theme = resolvedThemeMode;
    document.body.style.colorScheme = resolvedThemeMode;
    applyAccentTheme(appSettings.accentTheme);
  }, [appSettings.accentTheme, resolvedThemeMode]);

  useEffect(() => {
    if (
      !isSettingsReady ||
      !appSettings.appLockEnabled ||
      !appSettings.hasAppLockPassword ||
      appSettings.autoLockMinutes === 0 ||
      isLocked
    ) {
      if (autoLockTimerRef.current) {
        window.clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }
      return undefined;
    }

    const resetTimer = () => {
      if (autoLockTimerRef.current) {
        window.clearTimeout(autoLockTimerRef.current);
      }
      autoLockTimerRef.current = window.setTimeout(() => {
        lockApp();
      }, appSettings.autoLockMinutes * 60 * 1000);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer);
      });
      if (autoLockTimerRef.current) {
        window.clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = null;
      }
    };
  }, [
    appSettings.appLockEnabled,
    appSettings.autoLockMinutes,
    appSettings.hasAppLockPassword,
    isLocked,
    isSettingsReady,
  ]);

  useEffect(() => {
    if (!pendingJournalShortcutAction || activeTab !== "journal" || isLocked) {
      return;
    }

    dispatchShortcutEvent(pendingJournalShortcutAction);
    setPendingJournalShortcutAction("");
  }, [activeTab, isLocked, pendingJournalShortcutAction]);

  useEffect(() => {
    if (!isSettingsReady || isLocked || hasCheckedStartupUpdateRef.current) {
      return;
    }

    hasCheckedStartupUpdateRef.current = true;
    let cancelled = false;

    async function checkStartupUpdate() {
      try {
        const update = await checkForAppUpdate();
        if (cancelled || !update?.version) {
          return;
        }

        if (getNotifiedUpdateVersion() === update.version) {
          return;
        }

        persistNotifiedUpdateVersion(update.version);
        showToast({
          tone: "info",
          title: `发现新版本 ${formatVersion(update.version)}`,
          description: "已安装用户可在“全局设置 > 高级维护”中下载并安装更新。",
          duration: 5200,
        });
        if (typeof update.close === "function") {
          update.close().catch(() => {});
        }
      } catch (error) {
        console.error(error);
      }
    }

    checkStartupUpdate();

    return () => {
      cancelled = true;
    };
  }, [isLocked, isSettingsReady, showToast]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isLocked) {
        return;
      }

      if (document.body.dataset.shortcutRecording === "true") {
        return;
      }

      const accelerator = formatShortcutFromEvent(event);
      if (!accelerator) {
        return;
      }

      const matchedShortcut = keyboardShortcutsRef.current.find(
        (shortcut) => shortcut.isEnabled && shortcut.accelerator === accelerator,
      );
      if (!matchedShortcut) {
        return;
      }

      const actionMeta = SHORTCUT_ACTIONS_BY_ID[matchedShortcut.actionId];
      if (!actionMeta) {
        return;
      }

      if (isEditableTarget(event.target) && !actionMeta.allowInInput) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleShortcutAction(matchedShortcut.actionId);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTab, canQuickLock, isLocked]);

  function dispatchShortcutEvent(actionId) {
    window.dispatchEvent(
      new CustomEvent(APP_SHORTCUT_EVENT_NAME, {
        detail: { actionId },
      }),
    );
  }

  function lockApp() {
    if (!appSettingsRef.current.appLockEnabled || !appSettingsRef.current.hasAppLockPassword) {
      return;
    }

    setLockedViewSnapshot({
      tab: activeTab,
      label: TAB_LABELS[activeTab] ?? "当前界面",
    });
    setUnlockPassword("");
    setUnlockError("");
    setIsLocked(true);
  }

  async function persistSettings(nextSettings, options = {}) {
    const { password = null, optimistic = true } = options;
    const normalized = normalizeAppSettings(nextSettings);
    const previousSettings = appSettingsRef.current;
    const saveToken = settingsSaveTokenRef.current + 1;
    settingsSaveTokenRef.current = saveToken;

    if (optimistic) {
      appSettingsRef.current = normalized;
      setAppSettings(normalized);
    }

    setIsSavingSettings(true);
    try {
      const savedSettings = normalizeAppSettings(
        await saveAppSettings({
          ...normalized,
          password: password?.trim() ? password.trim() : null,
        }),
      );

      if (settingsSaveTokenRef.current === saveToken) {
        appSettingsRef.current = savedSettings;
        setAppSettings(savedSettings);
        if (!savedSettings.appLockEnabled) {
          setIsLocked(false);
        }
      }

      return savedSettings;
    } catch (error) {
      if (optimistic && settingsSaveTokenRef.current === saveToken) {
        appSettingsRef.current = previousSettings;
        setAppSettings(previousSettings);
      }
      throw error;
    } finally {
      if (settingsSaveTokenRef.current === saveToken) {
        setIsSavingSettings(false);
      }
    }
  }

  async function handleUpdateSettings(nextSettings) {
    return persistSettings(nextSettings, { optimistic: true });
  }

  async function handleSavePassword(password) {
    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      throw new Error("请输入锁定密码。");
    }

    return persistSettings(appSettingsRef.current, {
      password: trimmedPassword,
      optimistic: false,
    });
  }

  async function handleUpdateShortcut(nextShortcut) {
    setSavingShortcutActionId(nextShortcut.actionId);
    try {
      const savedShortcut = await saveKeyboardShortcut(nextShortcut);
      setKeyboardShortcuts((current) =>
        normalizeKeyboardShortcuts([
          ...current.filter((shortcut) => shortcut.actionId !== savedShortcut.actionId),
          savedShortcut,
        ]),
      );
      return savedShortcut;
    } finally {
      setSavingShortcutActionId("");
    }
  }

  async function handleResetShortcut(actionId) {
    setSavingShortcutActionId(actionId);
    try {
      const savedShortcut = await resetKeyboardShortcut(actionId);
      setKeyboardShortcuts((current) =>
        normalizeKeyboardShortcuts([
          ...current.filter((shortcut) => shortcut.actionId !== savedShortcut.actionId),
          savedShortcut,
        ]),
      );
      return savedShortcut;
    } finally {
      setSavingShortcutActionId("");
    }
  }

  async function handleUnlock() {
    if (!unlockPassword.trim()) {
      setUnlockError("请输入锁定密码。");
      return;
    }

    setIsUnlocking(true);
    setUnlockError("");
    try {
      await verifyAppLockPassword(unlockPassword.trim());
      setUnlockPassword("");
      setIsLocked(false);
      showToast({
        tone: "success",
        title: "已恢复工作界面",
        description: `已恢复到锁定前的${lockedViewSnapshot.label}，当前视图状态已保留。`,
      });
    } catch (error) {
      console.error(error);
      setUnlockError(String(error));
    } finally {
      setIsUnlocking(false);
    }
  }

  function handleShortcutAction(actionId) {
    if (actionId === "quick_lock") {
      if (canQuickLock) {
        lockApp();
      }
      return;
    }

    if (actionId === "open_settings") {
      setActiveTab("settings");
      return;
    }

    if (TAB_ACTIONS[actionId]) {
      setActiveTab(TAB_ACTIONS[actionId]);
      return;
    }

    if (!JOURNAL_SHORTCUT_ACTIONS.has(actionId)) {
      return;
    }

    if (activeTab !== "journal") {
      setPendingJournalShortcutAction(actionId);
      setActiveTab("journal");
      return;
    }

    dispatchShortcutEvent(actionId);
  }

  function renderActiveView() {
    if (activeTab === "workspace") {
      return <VirtualWorkspaceView />;
    }
    if (activeTab === "dashboard") {
      return <DashboardView />;
    }
    if (activeTab === "notes") {
      return <NotesWorkspaceView />;
    }
    if (activeTab === "settings") {
      return (
        <SettingsView
          settings={appSettings}
          keyboardShortcuts={keyboardShortcuts}
          onUpdateSettings={handleUpdateSettings}
          onSavePassword={handleSavePassword}
          onUpdateShortcut={handleUpdateShortcut}
          onResetShortcut={handleResetShortcut}
          isSaving={isSavingSettings}
          savingShortcutActionId={savingShortcutActionId}
        />
      );
    }
    return <JournalWorkspaceView />;
  }

  if (!isSettingsReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F3F3F3] text-gray-500">
        正在加载应用配置...
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-[#F3F3F3] font-sans text-gray-900">
      <div
        className={`flex h-full flex-col overflow-hidden transition-opacity duration-200 ${
          isLocked ? "pointer-events-none select-none opacity-0" : "opacity-100"
        }`}
        aria-hidden={isLocked}
      >
        <div className="shrink-0 select-none overflow-x-auto border-b border-gray-200 bg-white px-4 pt-2 shadow-sm">
          <div className="flex items-center gap-1">
            <TabButton
              icon={<FolderTree size={16} />}
              label="文件空间"
              isActive={activeTab === "workspace"}
              onClick={() => setActiveTab("workspace")}
            />
            <TabButton
              icon={<BarChart3 size={16} />}
              label="数据看板"
              isActive={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
            />
            <TabButton
              icon={<BookOpen size={16} />}
              label="脑图笔记"
              isActive={activeTab === "notes"}
              onClick={() => setActiveTab("notes")}
            />
            <TabButton
              icon={<CalendarDays size={16} />}
              label="工作日记"
              isActive={activeTab === "journal"}
              onClick={() => setActiveTab("journal")}
            />

            <div className="flex-1" />

            <button
              type="button"
              onClick={lockApp}
              disabled={!canQuickLock || isLocked}
              className={`mb-1.5 mr-2 flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-bold transition-all ${
                canQuickLock && !isLocked
                  ? "border border-blue-200 bg-blue-50 text-blue-700 shadow-sm hover:border-blue-300"
                  : "cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400"
              }`}
            >
              <LockKeyhole size={16} />
              <span>立即锁定</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`group mb-1.5 mr-2 flex shrink-0 items-center gap-2 rounded-xl px-4 py-1.5 transition-all ${
                activeTab === "settings"
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-gray-500 hover:bg-blue-50 hover:text-blue-600"
              }`}
            >
              <Settings
                size={18}
                className={`transition-transform duration-500 ${
                  activeTab === "settings" ? "rotate-45" : "group-hover:rotate-45"
                }`}
              />
              <span className="text-sm font-bold">全局设置</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-4">{renderActiveView()}</div>
      </div>

      {isLocked && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-gray-200 bg-white p-8 shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-50 text-blue-700">
              <LockKeyhole size={24} />
            </div>
            <div className="mt-5 text-center">
              <h2 className="text-2xl font-black text-gray-900">应用已锁定</h2>
              <p className="mt-2 text-sm text-gray-500">
                请输入应用锁定密码，验证通过后才能继续进入主界面。
              </p>
              <p className="mt-3 text-xs font-semibold text-gray-400">
                解锁后将恢复到锁定前的{lockedViewSnapshot.label}。
              </p>
            </div>

            <div className="mt-6">
              <input
                type="password"
                value={unlockPassword}
                onChange={(event) => setUnlockPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleUnlock();
                  }
                }}
                placeholder="输入锁定密码"
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                autoFocus
              />
              {unlockError && (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {unlockError}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleUnlock}
              disabled={isUnlocking}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-blue-200 transition-all hover:bg-blue-700 disabled:opacity-60"
            >
              <LockKeyhole size={16} />
              {isUnlocking ? "验证中..." : "解锁进入"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
