import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";

const STORAGE_KEY = "sidetale:reader";
const EVENT_NAME = "sidetale://reader";

export interface ReaderState {
  bookId: string | null;
  chapterIndex: number;
}

function readStorage(): ReaderState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bookId: null, chapterIndex: 0 };
    const parsed = JSON.parse(raw) as Partial<ReaderState>;
    return {
      bookId: typeof parsed.bookId === "string" ? parsed.bookId : null,
      chapterIndex: Number.isFinite(parsed.chapterIndex) ? Math.max(0, Number(parsed.chapterIndex)) : 0,
    };
  } catch {
    return { bookId: null, chapterIndex: 0 };
  }
}

let current: ReaderState = readStorage();
const listeners = new Set<(state: ReaderState) => void>();

function apply(next: ReaderState): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 忽略存储失败
  }
  listeners.forEach((listener) => listener(current));
}

export function getReaderState(): ReaderState {
  return current;
}

export function setReaderState(patch: Partial<ReaderState>): void {
  apply({
    bookId: patch.bookId ?? current.bookId,
    chapterIndex: patch.chapterIndex ?? current.chapterIndex,
  });
  void emit(EVENT_NAME, current).catch(() => undefined);
}

export function useReaderState(): ReaderState {
  const [state, setState] = useState<ReaderState>(current);

  useEffect(() => {
    setState(current);
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return state;
}

export async function initReaderBridge(): Promise<void> {
  await listen<Partial<ReaderState>>(EVENT_NAME, (event) => {
    apply({
      bookId: typeof event.payload.bookId === "string" ? event.payload.bookId : null,
      chapterIndex: Math.max(0, Number(event.payload.chapterIndex) || 0),
    });
  });
}
