import { BookOpen, FolderOpen, Plus, Trash2 } from "lucide-react";
import { Button } from "@heroui/react";

import type { BookMeta } from "../lib/api";
import { coverGradient, formatBytes, formatDate } from "../lib/format";

interface LibraryPageProps {
  books: BookMeta[];
  loading: boolean;
  importing: boolean;
  error: string | null;
  onImport: () => void;
  onOpenBook: (book: BookMeta) => void;
  onDeleteBook: (book: BookMeta) => void;
}

function progressPercent(book: BookMeta): number {
  if (book.chapterCount <= 0) return 0;
  const value = (book.lastReadChapter + book.lastReadProgress) / book.chapterCount;
  return Math.min(99, Math.max(0, Math.round(value * 100)));
}

function BookCard({
  book,
  onOpen,
  onDelete,
}: {
  book: BookMeta;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const gradient = coverGradient(book.id);
  const percent = progressPercent(book);

  return (
    <div className="group relative">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div
          className="relative aspect-[4/5] overflow-hidden rounded-2xl shadow-[0_14px_30px_-18px_rgba(38,37,31,0.7)] transition-transform duration-300 group-hover:-translate-y-1"
          style={{
            backgroundImage: `linear-gradient(155deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
          }}
        >
          <div className="absolute inset-y-0 left-3 w-px bg-white/20" />
          <div className="absolute -right-12 -top-12 size-36 rounded-full border border-white/15" />
          <div className="absolute -right-6 top-10 size-16 rounded-full bg-white/[0.06]" />
          <div className="absolute left-4 top-4 text-[10px] uppercase tracking-[0.18em] text-white/55">
            {book.format.toUpperCase()}
          </div>
          <div className="absolute inset-x-4 bottom-4">
            <div className="line-clamp-3 font-serif text-[17px] leading-[1.35] text-white/95">
              {book.title}
            </div>
            <div className="mt-1.5 line-clamp-1 text-[11px] text-white/60">
              {book.author || "未知作者"}
            </div>
          </div>
        </div>

        <div className="mt-3 px-0.5">
          <div className="flex items-center justify-between text-[11px] text-[#8a867c]">
            <span>{book.chapterCount} 章</span>
            <span>{formatBytes(book.sizeBytes)}</span>
          </div>
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-black/[0.08]">
            <div
              className="h-full rounded-full bg-[#2b2a24]/70 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-[#a09b8f]">
            <span>{percent > 0 ? `已读 ${percent}%` : "尚未开始"}</span>
            <span>{formatDate(book.importedAt)}</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        title="从书库移除"
        onClick={onDelete}
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg bg-black/25 text-white/70 opacity-0 backdrop-blur transition-all hover:bg-black/45 hover:text-white group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" strokeWidth={1.8} />
      </button>
    </div>
  );
}

export function LibraryPage({
  books,
  loading,
  importing,
  error,
  onImport,
  onOpenBook,
  onDeleteBook,
}: LibraryPageProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-end justify-between px-9 pb-6 pt-8">
        <div>
          <h1 className="font-serif text-[26px] tracking-[0.02em] text-[#2b2a24]">书库</h1>
          <p className="mt-1.5 text-[12px] text-[#8a867c]">
            {books.length > 0 ? `共 ${books.length} 本书` : "导入 TXT / Markdown / EPUB 开始阅读"}
          </p>
        </div>
        <Button onPress={onImport} isDisabled={importing}>
          {importing ? (
            <FolderOpen className="size-4" strokeWidth={1.8} />
          ) : (
            <Plus className="size-4" strokeWidth={2} />
          )}
          {importing ? "正在导入…" : "导入小说"}
        </Button>
      </header>

      {error && (
        <div className="mx-9 mb-4 rounded-xl border border-red-200/70 bg-red-50 px-4 py-2.5 text-[12px] leading-relaxed text-red-700">
          {error}
        </div>
      )}

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-9 pb-10">
        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-7 gap-y-9">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="animate-pulse">
                <div className="aspect-[4/5] rounded-2xl bg-black/[0.06]" />
                <div className="mt-3 h-3 w-2/3 rounded bg-black/[0.06]" />
              </div>
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="flex h-[70%] flex-col items-center justify-center">
            <div className="w-full max-w-[420px] rounded-3xl border border-dashed border-black/10 bg-white/55 px-8 py-12 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#2b2a24]/[0.06] text-[#5f5b51]">
                <BookOpen className="size-6" strokeWidth={1.6} />
              </div>
              <h2 className="mt-4 font-serif text-[18px] text-[#2b2a24]">书架还是空的</h2>
              <p className="mx-auto mt-2 max-w-[280px] text-[12px] leading-relaxed text-[#8a867c]">
                导入本地小说文件即可开始阅读。支持自动识别章节，
                中文 TXT 会自行处理 GBK / UTF-8 编码。
              </p>
              <Button className="mt-5" onPress={onImport}>
                <Plus className="size-4" strokeWidth={2} />
                导入小说
              </Button>
              <p className="mt-4 text-[10.5px] text-[#a09b8f]">TXT · MD · EPUB</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-7 gap-y-9">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onOpen={() => onOpenBook(book)}
                onDelete={() => onDeleteBook(book)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
