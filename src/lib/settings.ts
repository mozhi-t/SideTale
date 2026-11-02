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
  showMiniKey: "3",
  hideMiniKey: "4",
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
  if (trimmed.length === 0 || trimmed.length > 20) return fallback;
  return trimmed;
}

/** 判断键盘事件是否匹配用户设置的快捷键 */
export function matchesShortcut(event: KeyboardEvent, key: string): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return false;
  return event.key.toLowerCase() === key.toLowerCase();
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
    showMiniKey: normalizeKey(merged.showMiniKey, DEFAULT_SETTINGS.showMiniKey),
    hideMiniKey: normalizeKey(merged.hideMiniKey, DEFAULT_SETTINGS.hideMiniKey),
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
