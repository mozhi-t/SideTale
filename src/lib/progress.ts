import { api } from "./api";

const POSITION_PREFIX = "sidetale:position";

export interface SavedPosition {
  chapter: number;
  ratio: number;
}

export function readPosition(bookId: string): SavedPosition | null {
  try {
    const raw = localStorage.getItem(`${POSITION_PREFIX}:${bookId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedPosition>;
    if (!Number.isFinite(parsed.chapter) || !Number.isFinite(parsed.ratio)) return null;
    return {
      chapter: Number(parsed.chapter),
      ratio: Math.min(1, Math.max(0, Number(parsed.ratio))),
    };
  } catch {
    return null;
  }
}

export function writePosition(bookId: string, position: SavedPosition): void {
  try {
    localStorage.setItem(`${POSITION_PREFIX}:${bookId}`, JSON.stringify(position));
  } catch {
    // 忽略存储失败
  }
}

export function clearPosition(bookId: string): void {
  try {
    localStorage.removeItem(`${POSITION_PREFIX}:${bookId}`);
  } catch {
    // 忽略
  }
}

/** 同时写入本地进度和书库元信息，保证重新打开书籍时能恢复章节与滚动位置 */
export function persistProgress(bookId: string, chapter: number, ratio: number): void {
  const safeRatio = Math.min(1, Math.max(0, ratio));
  writePosition(bookId, { chapter, ratio: safeRatio });
  void api.saveReadProgress(bookId, chapter, safeRatio).catch(() => undefined);
}
