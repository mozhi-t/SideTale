import { invoke } from "@tauri-apps/api/core";

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  chapterCount: number;
  importedAt: number;
  lastReadChapter: number;
  lastReadProgress: number;
  sizeBytes: number;
  format: string;
  sourcePath: string;
}

export interface BookDetail {
  meta: BookMeta;
  chapterTitles: string[];
}

export interface ChapterPayload {
  index: number;
  title: string;
  content: string;
  chapterCount: number;
}

export interface SaveBookPayload {
  title: string;
  author: string;
  sourcePath: string;
  format: string;
  sizeBytes: number;
  chapters: { title: string; content: string }[];
}

export const api = {
  listBooks: () => invoke<BookMeta[]>("list_books"),
  importTextBook: (path: string) => invoke<BookMeta>("import_text_book", { path }),
  saveParsedBook: (payload: SaveBookPayload) =>
    invoke<BookMeta>("save_parsed_book", { payload }),
  getBookDetail: (id: string) => invoke<BookDetail>("get_book_detail", { id }),
  getChapter: (id: string, index: number) =>
    invoke<ChapterPayload>("get_chapter", { id, index }),
  deleteBook: (id: string) => invoke<void>("delete_book", { id }),
  saveReadProgress: (id: string, chapter: number, progress: number) =>
    invoke<void>("save_read_progress", { id, chapter, progress }),
  readFileBase64: (path: string) => invoke<string>("read_file_base64", { path }),
  setPrivacyProtection: (enabled: boolean) =>
    invoke<void>("set_privacy_protection", { enabled }),
  showMiniWindow: () => invoke<void>("show_mini_window"),
  hideMiniWindow: () => invoke<void>("hide_mini_window"),
};

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "未知错误";
}
