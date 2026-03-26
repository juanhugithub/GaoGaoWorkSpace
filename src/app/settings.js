export const AUTO_LOCK_OPTIONS = [
  { value: 0, label: "不锁定", description: "仅在重新启动应用后进入锁定界面。" },
  { value: 5, label: "5 分钟", description: "连续 5 分钟无操作后自动锁定。" },
  { value: 15, label: "15 分钟", description: "连续 15 分钟无操作后自动锁定。" },
  { value: 30, label: "30 分钟", description: "连续 30 分钟无操作后自动锁定。" },
];

export const THEME_MODE_OPTIONS = [
  { value: "light", label: "明亮" },
  { value: "dark", label: "暗黑" },
  { value: "system", label: "跟随系统" },
];

export const ACCENT_THEMES = {
  "classic-blue": {
    label: "经典蓝",
    swatch: "#2563EB",
    colors: {
      50: "#EFF6FF",
      "50a": "rgba(239, 246, 255, 0.72)",
      100: "#DBEAFE",
      200: "#BFDBFE",
      300: "#93C5FD",
      400: "#60A5FA",
      500: "#3B82F6",
      600: "#2563EB",
      700: "#1D4ED8",
      800: "#1E40AF",
      ring: "rgba(37, 99, 235, 0.28)",
      ringSoft: "rgba(37, 99, 235, 0.16)",
    },
  },
  "emerald-green": {
    label: "翡翠绿",
    swatch: "#059669",
    colors: {
      50: "#ECFDF5",
      "50a": "rgba(236, 253, 245, 0.72)",
      100: "#D1FAE5",
      200: "#A7F3D0",
      300: "#6EE7B7",
      400: "#34D399",
      500: "#10B981",
      600: "#059669",
      700: "#047857",
      800: "#065F46",
      ring: "rgba(5, 150, 105, 0.28)",
      ringSoft: "rgba(5, 150, 105, 0.16)",
    },
  },
  "amber-gold": {
    label: "琥珀黄",
    swatch: "#D97706",
    colors: {
      50: "#FFFBEB",
      "50a": "rgba(255, 251, 235, 0.78)",
      100: "#FEF3C7",
      200: "#FDE68A",
      300: "#FCD34D",
      400: "#FBBF24",
      500: "#F59E0B",
      600: "#D97706",
      700: "#B45309",
      800: "#92400E",
      ring: "rgba(217, 119, 6, 0.28)",
      ringSoft: "rgba(217, 119, 6, 0.16)",
    },
  },
  "soft-violet": {
    label: "淡浅紫",
    swatch: "#7C3AED",
    colors: {
      50: "#F5F3FF",
      "50a": "rgba(245, 243, 255, 0.72)",
      100: "#EDE9FE",
      200: "#DDD6FE",
      300: "#C4B5FD",
      400: "#A78BFA",
      500: "#8B5CF6",
      600: "#7C3AED",
      700: "#6D28D9",
      800: "#5B21B6",
      ring: "rgba(124, 58, 237, 0.28)",
      ringSoft: "rgba(124, 58, 237, 0.16)",
    },
  },
  "cherry-rose": {
    label: "樱桃粉",
    swatch: "#E11D48",
    colors: {
      50: "#FFF1F2",
      "50a": "rgba(255, 241, 242, 0.72)",
      100: "#FFE4E6",
      200: "#FECDD3",
      300: "#FDA4AF",
      400: "#FB7185",
      500: "#F43F5E",
      600: "#E11D48",
      700: "#BE123C",
      800: "#9F1239",
      ring: "rgba(225, 29, 72, 0.28)",
      ringSoft: "rgba(225, 29, 72, 0.16)",
    },
  },
};

export const SHORTCUT_ACTIONS = [
  {
    actionId: "quick_lock",
    label: "快速锁定应用",
    description: "立即进入应用锁定界面。",
    section: "全局",
    defaultAccelerator: "Ctrl+L",
    allowInInput: true,
  },
  {
    actionId: "open_settings",
    label: "打开全局设置",
    description: "快速切换到右上角的全局设置页。",
    section: "全局",
    defaultAccelerator: "Ctrl+,",
    allowInInput: true,
  },
  {
    actionId: "tab_workspace",
    label: "切到文件空间",
    description: "快速切换到文件空间模块。",
    section: "导航",
    defaultAccelerator: "Alt+1",
    allowInInput: false,
  },
  {
    actionId: "tab_dashboard",
    label: "切到数据看板",
    description: "快速切换到数据看板模块。",
    section: "导航",
    defaultAccelerator: "Alt+2",
    allowInInput: false,
  },
  {
    actionId: "tab_notes",
    label: "切到脑图笔记",
    description: "快速切换到脑图笔记模块。",
    section: "导航",
    defaultAccelerator: "Alt+3",
    allowInInput: false,
  },
  {
    actionId: "tab_journal",
    label: "切到工作日记",
    description: "快速切换到工作日记模块。",
    section: "导航",
    defaultAccelerator: "Alt+4",
    allowInInput: false,
  },
  {
    actionId: "save_current_journal",
    label: "保存当前日记",
    description: "保存当前打开的日记内容。",
    section: "工作日记",
    defaultAccelerator: "Ctrl+S",
    allowInInput: true,
  },
  {
    actionId: "create_today_journal",
    label: "打开或创建今日日记",
    description: "快速切到工作日记并打开今日日记模板。",
    section: "工作日记",
    defaultAccelerator: "Ctrl+Alt+J",
    allowInInput: true,
  },
];

export const SHORTCUT_ACTIONS_BY_ID = SHORTCUT_ACTIONS.reduce((result, action) => {
  result[action.actionId] = action;
  return result;
}, {});

export const RESERVED_ACCELERATORS = new Set([
  "Alt+F4",
  "Ctrl+R",
  "Ctrl+Shift+Esc",
  "Ctrl+W",
  "F5",
]);

export const APP_SHORTCUT_EVENT_NAME = "personal-os:shortcut";

export const DEFAULT_APP_SETTINGS = {
  appLockEnabled: false,
  hasAppLockPassword: false,
  autoLockMinutes: 0,
  autoStartEnabled: false,
  themeMode: "system",
  accentTheme: "classic-blue",
};

export function normalizeAppSettings(settings = {}) {
  const accentTheme = ACCENT_THEMES[settings.accentTheme]
    ? settings.accentTheme
    : DEFAULT_APP_SETTINGS.accentTheme;
  const themeMode = THEME_MODE_OPTIONS.some((option) => option.value === settings.themeMode)
    ? settings.themeMode
    : DEFAULT_APP_SETTINGS.themeMode;
  const autoLockMinutes = AUTO_LOCK_OPTIONS.some(
    (option) => option.value === settings.autoLockMinutes,
  )
    ? settings.autoLockMinutes
    : DEFAULT_APP_SETTINGS.autoLockMinutes;

  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    appLockEnabled: Boolean(settings.appLockEnabled),
    hasAppLockPassword: Boolean(settings.hasAppLockPassword),
    autoStartEnabled: Boolean(settings.autoStartEnabled),
    autoLockMinutes,
    themeMode,
    accentTheme,
  };
}

export function normalizeKeyboardShortcuts(shortcuts = []) {
  const shortcutMap = new Map(
    shortcuts.map((shortcut) => [
      shortcut.actionId,
      {
        ...shortcut,
        isEnabled: Boolean(shortcut.isEnabled),
      },
    ]),
  );

  return SHORTCUT_ACTIONS.map((action) => {
    const stored = shortcutMap.get(action.actionId);
    return {
      actionId: action.actionId,
      accelerator: stored?.accelerator || action.defaultAccelerator,
      defaultAccelerator: stored?.defaultAccelerator || action.defaultAccelerator,
      isEnabled: stored?.isEnabled ?? true,
    };
  });
}

export function formatShortcutFromEvent(event) {
  const modifierKeys = [];
  if (event.ctrlKey || event.metaKey) {
    modifierKeys.push("Ctrl");
  }
  if (event.altKey) {
    modifierKeys.push("Alt");
  }
  if (event.shiftKey) {
    modifierKeys.push("Shift");
  }

  const normalizedKey = normalizeShortcutKey(event.key);
  if (!normalizedKey) {
    return "";
  }

  if (modifierKeys.length === 0 && isModifierKey(event.key)) {
    return "";
  }

  return [...modifierKeys, normalizedKey].join("+");
}

export function normalizeShortcutKey(key) {
  if (!key) {
    return "";
  }

  if (key === " ") {
    return "Space";
  }
  if (key === ",") {
    return ",";
  }

  const normalized = key.length === 1 ? key.toUpperCase() : key;
  switch (normalized) {
    case "Alt":
    case "Control":
    case "Meta":
    case "Shift":
      return "";
    case "ArrowUp":
      return "Up";
    case "ArrowDown":
      return "Down";
    case "ArrowLeft":
      return "Left";
    case "ArrowRight":
      return "Right";
    case "Escape":
      return "Esc";
    default:
      return normalized;
  }
}

export function isModifierKey(key) {
  return ["Alt", "Control", "Meta", "Shift"].includes(key);
}

export function isEditableTarget(target) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"),
  );
}
