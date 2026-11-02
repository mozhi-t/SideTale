import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

import { api } from "./api";

const POSITIONS_PREFIX = "sidetale:positions";
const LEGACY_PREFIX = "sidetale:position";
const EVENT_NAME = "sidetale://position";

export interface PositionEvent {
  bookId: string;
  chapter: number;
  ratio: number;
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 按章节保存阅读位置，切换章节后回来仍能回到原来的滚动位置 */
function readMap(bookId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(`${POSITIONS_PREFIX}:${bookId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown> | null;
      if (parsed && typeof parsed === "object") {
        const map: Record<string, number> = {};
        for (const [key, value] of Object.entries(parsed)) {
          const chapter = Number(key);
          const ratio = Number(value);
          if (Number.isInteger(chapter) && chapter >= 0 && Number.isFinite(ratio)) {
            map[String(chapter)] = clampRatio(ratio);
          }
        }
        return map;
      }
    }
  } catch {
    // 忽略损坏的存储数据
  }

  // 兼容旧版本：整本书只保存一个位置
  try {
    const legacy = localStorage.getItem(`${LEGACY_PREFIX}:${bookId}`);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { chapter?: unknown; ratio?: unknown };
      const chapter = Number(parsed.chapter);
      const ratio = Number(parsed.ratio);
      if (Number.isInteger(chapter) && chapter >= 0 && Number.isFinite(ratio)) {
        return { [String(chapter)]: clampRatio(ratio) };
      }
    }
  } catch {
    // 忽略
  }

  return {};
}

export function readChapterRatio(bookId: string, chapter: number): number | null {
  const value = readMap(bookId)[String(chapter)];
  return typeof value === "number" ? value : null;
}

export function clearPositions(bookId: string): void {
  try {
    localStorage.removeItem(`${POSITIONS_PREFIX}:${bookId}`);
    localStorage.removeItem(`${LEGACY_PREFIX}:${bookId}`);
  } catch {
    // 忽略
  }
}

/** 记录某一章的阅读位置，并同步给书库元信息；默认广播给另一窗口以保持进度一致 */
export function persistChapterRatio(
  bookId: string,
  chapter: number,
  ratio: number,
  options?: { broadcast?: boolean },
): void {
  const safeRatio = clampRatio(ratio);
  const map = readMap(bookId);
  map[String(chapter)] = safeRatio;
  try {
    localStorage.setItem(`${POSITIONS_PREFIX}:${bookId}`, JSON.stringify(map));
  } catch {
    // 忽略存储失败
  }

  void api.saveReadProgress(bookId, chapter, safeRatio).catch(() => undefined);

  if (options?.broadcast !== false) {
    void emit<PositionEvent>(EVENT_NAME, { bookId, chapter, ratio: safeRatio }).catch(
      () => undefined,
    );
  }
}

export function listenPosition(handler: (position: PositionEvent) => void): Promise<UnlistenFn> {
  return listen<PositionEvent>(EVENT_NAME, (event) => handler(event.payload));
}
