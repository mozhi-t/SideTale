import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";

const STORAGE_KEY = "sidetale:settings";
const EVENT_NAME = "sidetale://settings";

export interface Settings {
  /** 隐私保护：开启后使用 Windows SetWindowDisplayAffinity 防止截屏 */
  privacyProtection: boolean;
  /** 小窗背景透明度 0 - 1（0 表示背景完全透明） */
  miniBgOpacity: number;
  /** 小窗文字透明度 0.35 - 1 */
  miniTextOpacity: number;
  /** 小窗文字颜色（#RRGGBB） */
  miniTextColor: string;
  /** 正文字号（px） */
  fontSize: number;
  /** 正文行高倍数 */
  lineHeight: number;
  /** 上一章快捷键 */
  prevChapterKey: string;
  /** 下一章快捷键 */
  nextChapterKey: string;
  /** 显示小窗快捷键 */
  showMiniKey: string;
  /** 隐藏小窗快捷键 */
  hideMiniKey: string;
}

export const DEFAULT_TEXT_COLOR = "#eeede8";

export const TEXT_COLOR_PRESETS = [
  { label: "米白", value: "#eeede8" },
  { label: "纯白", value: "#ffffff" },
  { label: "暖黄", value: "#f4dfa8" },
  { label: "薄荷", value: "#cfe8d8" },
  { label: "浅蓝", value: "#cfe1f5" },
  { label: "墨黑", value: "#1f1f1f" },
] as const;

export const DEFAULT_SETTINGS: Settings = {
  privacyProtection: false,
  miniBgOpacity: 0.84,
  miniTextOpacity: 0.9,
  miniTextColor: DEFAULT_TEXT_COLOR,
  fontSize: 17,
  lineHeight: 1.9,
  prevChapterKey: "1",
  nextChapterKey: "2",
  showMiniKey: "Ctrl+Shift+3",
  hideMiniKey: "Ctrl+Shift+4",
};

export function normalizeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeColor(hex, DEFAULT_TEXT_COLOR).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export function colorWithAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const safeAlpha = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

/** 判断颜色是否偏暗，用于给文字选择框、下拉菜单选择对比色 */
export function isDarkColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.55;
}

function normalizeKey(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 48) return fallback;
  return trimmed;
}

interface ParsedShortcut {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

/** 按键名统一成字符串中保存的形式：字母小写、数字直接用字符 */
function eventKeyToken(event: KeyboardEvent): string {
  const code = event.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^(F[1-9]|F1[0-2])$/.test(code)) return code;
  if (code === "Space") return "Space";
  if (
    /^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Escape|Enter|Tab|Backspace|Delete|Home|End|PageUp|PageDown)$/.test(
      code,
    )
  ) {
    return code;
  }
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const parsed: ParsedShortcut = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
  const tokens = shortcut === " " ? ["Space"] : shortcut.split("+");
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    switch (trimmed.toLowerCase()) {
      case "ctrl":
      case "control":
        parsed.ctrl = true;
        break;
      case "shift":
        parsed.shift = true;
        break;
      case "alt":
      case "option":
        parsed.alt = true;
        break;
      case "meta":
      case "cmd":
      case "super":
      case "win":
        parsed.meta = true;
        break;
      default:
        parsed.key = trimmed;
    }
  }
  return parsed;
}

/** 把键盘事件转换成可保存的组合键字符串，例如 Ctrl+Shift+3 */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const modifierKeys = ["Shift", "Control", "Alt", "Meta"];
  if (modifierKeys.includes(event.key)) return null;

  const tokens: string[] = [];
  if (event.ctrlKey) tokens.push("Ctrl");
  if (event.shiftKey) tokens.push("Shift");
  if (event.altKey) tokens.push("Alt");
  if (event.metaKey) tokens.push("Win");
  tokens.push(eventKeyToken(event));
  return tokens.join("+");
}

/** 判断键盘事件是否匹配用户设置的快捷键 */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  if (event.repeat) return false;
  const parsed = parseShortcut(shortcut);
  if (!parsed.key) return false;
  if (event.ctrlKey !== parsed.ctrl) return false;
  if (event.shiftKey !== parsed.shift) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.metaKey !== parsed.meta) return false;
  return eventKeyToken(event).toLowerCase() === parsed.key.toLowerCase();
}

/** 快捷键展示文本，例如 Ctrl + Shift + 3 */
export function formatShortcut(shortcut: string): string {
  const labels: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Space: "空格",
    Escape: "Esc",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Home: "Home",
    End: "End",
    PageUp: "PgUp",
    PageDown: "PgDn",
  };
  const tokens = shortcut === " " ? ["Space"] : shortcut.split("+");
  return tokens
    .map((token) => {
      const trimmed = token.trim();
      if (!trimmed) return "";
      const modifier = trimmed.toLowerCase();
      if (modifier === "ctrl" || modifier === "control") return "Ctrl";
      if (modifier === "shift") return "Shift";
      if (modifier === "alt" || modifier === "option") return "Alt";
      if (modifier === "meta" || modifier === "cmd" || modifier === "super" || modifier === "win") {
        return "Win";
      }
      return labels[trimmed] ?? (trimmed.length === 1 ? trimmed.toUpperCase() : trimmed);
    })
    .filter(Boolean)
    .join(" + ");
}

/** 判断事件是否来自可输入控件，避免输入文字时误触快捷键 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function normalize(raw: Partial<Settings> | null | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  const showMiniKey = normalizeKey(merged.showMiniKey, DEFAULT_SETTINGS.showMiniKey);
  const hideMiniKey = normalizeKey(merged.hideMiniKey, DEFAULT_SETTINGS.hideMiniKey);
  return {
    privacyProtection: Boolean(merged.privacyProtection),
    miniBgOpacity: clamp(Number(merged.miniBgOpacity), 0, 1, DEFAULT_SETTINGS.miniBgOpacity),
    miniTextOpacity: clamp(
      Number(merged.miniTextOpacity),
      0.35,
      1,
      DEFAULT_SETTINGS.miniTextOpacity,
    ),
    miniTextColor: normalizeColor(merged.miniTextColor, DEFAULT_SETTINGS.miniTextColor),
    fontSize: clamp(Number(merged.fontSize), 14, 24, DEFAULT_SETTINGS.fontSize),
    lineHeight: clamp(Number(merged.lineHeight), 1.4, 2.6, DEFAULT_SETTINGS.lineHeight),
    prevChapterKey: normalizeKey(merged.prevChapterKey, DEFAULT_SETTINGS.prevChapterKey),
    nextChapterKey: normalizeKey(merged.nextChapterKey, DEFAULT_SETTINGS.nextChapterKey),
    // 旧版本默认的单键 3/4 注册为全局热键会拦截其它软件的输入，升级为组合键
    showMiniKey: showMiniKey === "3" ? DEFAULT_SETTINGS.showMiniKey : showMiniKey,
    hideMiniKey: hideMiniKey === "4" ? DEFAULT_SETTINGS.hideMiniKey : hideMiniKey,
  };
}

function readStorage(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalize(JSON.parse(raw) as Partial<Settings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let current: Settings = readStorage();
const listeners = new Set<(settings: Settings) => void>();

function apply(next: Settings): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage 不可用时设置依然在当前窗口内生效
  }
  listeners.forEach((listener) => listener(current));
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  apply(normalize({ ...current, ...patch }));
  void emit(EVENT_NAME, current).catch(() => undefined);
}

export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(current);

  useEffect(() => {
    setSettings(current);
    listeners.add(setSettings);
    return () => {
      listeners.delete(setSettings);
    };
  }, []);

  return settings;
}

export async function initSettingsBridge(): Promise<void> {
  await listen<Partial<Settings>>(EVENT_NAME, (event) => {
    apply(normalize(event.payload));
  });
}
