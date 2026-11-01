import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Label, ListBox, Select, Slider } from "@heroui/react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Key } from "@heroui/react";

import {
  api,
  errorMessage,
  type BookDetail,
  type BookMeta,
  type ChapterPayload,
} from "../lib/api";
import { splitParagraphs } from "../lib/format";
import { persistProgress, readPosition } from "../lib/progress";
import { setReaderState, useReaderState } from "../lib/reader";
import {
  colorWithAlpha,
  isDarkColor,
  isEditableTarget,
  matchesShortcut,
  updateSettings,
  useSettings,
  TEXT_COLOR_PRESETS,
} from "../lib/settings";

interface MiniButtonProps {
  label: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function MiniButton({ label, disabled, active, onClick, children }: MiniButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`mini-icon-btn grid size-7 shrink-0 place-items-center rounded-md transition-colors ${
        active ? "mini-icon-btn--active" : ""
      } disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  );
}

export function MiniReader() {
  const settings = useSettings();
  const { bookId, chapterIndex } = useReaderState();
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [chapter, setChapter] = useState<ChapterPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<number | null>(null);
  const progressRef = useRef<{ bookId: string | null; chapter: number; ratio: number }>({
    bookId: null,
    chapter: 0,
    ratio: 0,
  });

  useEffect(() => {
    let active = true;
    api
      .listBooks()
      .then((list) => {
        if (active) setBooks(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [bookId]);

  useEffect(() => {
    if (!bookId) {
      setDetail(null);
      return;
    }
    let active = true;
    api
      .getBookDetail(bookId)
      .then((value) => {
        if (active) {
          setDetail(value);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setDetail(null);
          setError(errorMessage(reason));
        }
      });
    return () => {
      active = false;
    };
  }, [bookId]);

  useEffect(() => {
    if (!bookId) {
      setChapter(null);
      return;
    }
    let active = true;
    api
      .getChapter(bookId, chapterIndex)
      .then((value) => {
        if (active) {
          setChapter(value);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setChapter(null);
          setError(errorMessage(reason));
        }
      });
    return () => {
      active = false;
    };
  }, [bookId, chapterIndex]);

  useEffect(() => {
    if (!chapter || !bookId) return;
    const node = scrollRef.current;
    if (!node) return;

    const saved = readPosition(bookId);
    const metaRatio =
      detail?.meta.lastReadChapter === chapter.index ? detail.meta.lastReadProgress : 0;
    const ratio = saved && saved.chapter === chapter.index ? saved.ratio : metaRatio;
    const max = Math.max(0, node.scrollHeight - node.clientHeight);
    node.scrollTop = ratio * max;

    progressRef.current = { bookId, chapter: chapter.index, ratio };
    persistProgress(bookId, chapter.index, ratio);
  }, [chapter, bookId, detail]);

  useEffect(() => {
    const flush = () => {
      const current = progressRef.current;
      if (!current.bookId) return;
      persistProgress(current.bookId, current.chapter, current.ratio);
    };
    const handleBeforeUnload = () => flush();

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      flush();
    };
  }, []);

  const handleScroll = () => {
    if (!bookId || !chapter) return;
    const node = scrollRef.current;
    if (!node) return;
    const max = node.scrollHeight - node.clientHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, node.scrollTop / max)) : 0;
    progressRef.current = { bookId, chapter: chapter.index, ratio };
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      persistProgress(bookId, chapter.index, ratio);
    }, 450);
  };

  const currentBook = books.find((item) => item.id === bookId) ?? detail?.meta;
  const titles = detail?.chapterTitles ?? [];
  const total = chapter?.chapterCount ?? currentBook?.chapterCount ?? 0;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (matchesShortcut(event, settings.prevChapterKey)) {
        event.preventDefault();
        if (chapterIndex > 0) setReaderState({ chapterIndex: chapterIndex - 1 });
        return;
      }

      if (matchesShortcut(event, settings.nextChapterKey)) {
        event.preventDefault();
        if (total > 0 && chapterIndex < total - 1) {
          setReaderState({ chapterIndex: chapterIndex + 1 });
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [chapterIndex, total, settings.prevChapterKey, settings.nextChapterKey]);

  const textColor = colorWithAlpha(settings.miniTextColor, settings.miniTextOpacity);
  const iconColor = colorWithAlpha(settings.miniTextColor, settings.miniTextOpacity * 0.55);
  const bgColor = `rgba(58, 59, 64, ${settings.miniBgOpacity})`;
  const frameColor = colorWithAlpha(settings.miniTextColor, 0.12 * settings.miniBgOpacity);
  const lineColor = colorWithAlpha(settings.miniTextColor, 0.08 * settings.miniBgOpacity);
  const navLineColor = colorWithAlpha(settings.miniTextColor, 0.06 * settings.miniBgOpacity);
  const fontSize = Math.max(12, settings.fontSize - 4);

  // 下拉菜单使用与自定义文字颜色相反明度的底色，保证任何文字颜色都能看清
  const darkText = isDarkColor(settings.miniTextColor);
  const menuBg = darkText ? "rgba(250, 249, 244, 0.97)" : "rgba(22, 23, 27, 0.97)";
  const menuBorder = darkText ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.16)";
  const chromeRgb = darkText ? "246, 244, 238" : "20, 21, 25";
  const chromeAlpha = 0.35 + 0.35 * settings.miniBgOpacity;
  const chromeBg = `rgba(${chromeRgb}, ${chromeAlpha})`;
  const chromeBorder = `rgba(${chromeRgb}, ${Math.min(1, chromeAlpha + 0.12)})`;
  const chromeHover = `rgba(${chromeRgb}, ${Math.min(1, chromeAlpha + 0.1)})`;
  const textShadow = darkText
    ? "0 1px 2px rgba(255, 255, 255, 0.6)"
    : "0 1px 3px rgba(0, 0, 0, 0.75)";
  const iconShadow = darkText
    ? "drop-shadow(0 1px 1px rgba(255, 255, 255, 0.55))"
    : "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.65))";
  const miniVars = {
    "--mini-text-color": textColor,
    "--mini-icon-color": iconColor,
    "--mini-bg-opacity": String(settings.miniBgOpacity),
    "--mini-chrome-bg": chromeBg,
    "--mini-chrome-border": chromeBorder,
    "--mini-chrome-hover": chromeHover,
    "--mini-text-shadow": textShadow,
    "--mini-icon-shadow": iconShadow,
  } as CSSProperties;

  const handleSelectBook = (value: Key | Key[] | null) => {
    if (Array.isArray(value) || value === null) return;
    const nextId = String(value);
    const meta = books.find((item) => item.id === nextId);
    setReaderState({
      bookId: nextId,
      chapterIndex: meta ? meta.lastReadChapter : 0,
    });
  };

  const handleSelectChapter = (value: Key | Key[] | null) => {
    if (Array.isArray(value) || value === null) return;
    const index = Number(value);
    if (Number.isFinite(index)) setReaderState({ chapterIndex: index });
  };

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-[14px] border"
      style={{
        ...miniVars,
        backgroundColor: bgColor,
        borderColor: frameColor,
        boxShadow: `inset 0 1px 0 ${colorWithAlpha(
          settings.miniTextColor,
          0.08 * settings.miniBgOpacity,
        )}`,
      }}
    >
      <header
        data-tauri-drag-region
        className="flex h-[42px] shrink-0 items-center gap-1.5 border-b px-2"
        style={{ borderColor: lineColor }}
      >
        <BookOpen
          data-tauri-drag-region
          className="size-3.5 shrink-0"
          style={{ color: iconColor }}
        />

        {books.length > 0 ? (
          <div className="min-w-0 flex-1">
            <Select
              className="mini-select w-full"
              placeholder="选择书籍"
              value={bookId}
              onChange={handleSelectBook}
            >
              <Label className="sr-only">选择书籍</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover
              className="mini-menu max-h-[240px]"
              style={
                {
                  "--mini-text-color": textColor,
                  backgroundColor: menuBg,
                  borderColor: menuBorder,
                } as CSSProperties
              }
            >
                <ListBox className="mini-scroll max-h-[220px] overflow-y-auto">
                  {books.map((book) => (
                    <ListBox.Item key={book.id} id={book.id} textValue={book.title}>
                      {book.title}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        ) : (
          <div className="min-w-0 flex-1 truncate text-[11px]" style={{ color: textColor }}>
            SideTale
          </div>
        )}

        <MiniButton
          label="外观设置"
          active={panelOpen}
          onClick={() => setPanelOpen((value) => !value)}
        >
          <SlidersHorizontal className="size-3.5" strokeWidth={1.9} />
        </MiniButton>
        <MiniButton
          label="关闭小窗"
          onClick={() => {
            void api.hideMiniWindow().catch(() => undefined);
          }}
        >
          <X className="size-3.5" strokeWidth={1.9} />
        </MiniButton>
      </header>

      <div
        className="flex h-[38px] shrink-0 items-center gap-1 border-b px-2"
        style={{ borderColor: navLineColor }}
      >
        <MiniButton
          label="上一章"
          disabled={chapterIndex <= 0}
          onClick={() => setReaderState({ chapterIndex: chapterIndex - 1 })}
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.9} />
        </MiniButton>

        <div className="min-w-0 flex-1">
          <Select
            aria-label="选择章节"
            className="mini-select w-full"
            placeholder="选择章节"
            value={String(chapterIndex)}
            onChange={handleSelectChapter}
            isDisabled={titles.length === 0}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover
              className="mini-menu max-h-[240px]"
              style={
                {
                  "--mini-text-color": textColor,
                  backgroundColor: menuBg,
                  borderColor: menuBorder,
                } as CSSProperties
              }
            >
              <ListBox className="mini-scroll max-h-[220px] overflow-y-auto">
                {titles.map((title, index) => (
                  <ListBox.Item
                    key={`${index}-${title}`}
                    id={String(index)}
                    textValue={`${index + 1}. ${title}`}
                  >
                    <span className="tabular-nums opacity-60">{index + 1}.</span>
                    <span className="ml-1.5">{title}</span>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>

        <MiniButton
          label="下一章"
          disabled={total === 0 || chapterIndex >= total - 1}
          onClick={() => setReaderState({ chapterIndex: chapterIndex + 1 })}
        >
          <ChevronRight className="size-3.5" strokeWidth={1.9} />
        </MiniButton>
      </div>

      <main
        ref={scrollRef}
        onScroll={handleScroll}
        className="mini-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2.5"
      >
        {!bookId ? (
          <div
            className="flex h-full items-center justify-center px-4 text-center text-[11px] leading-relaxed"
            style={{ color: textColor, opacity: 0.65 }}
          >
            请先在主窗口打开一本书，或在上方选择一本。
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-center text-[11px] leading-relaxed text-red-300/90">
            {error}
          </div>
        ) : chapter ? (
          <>
            <div
              className="mb-1.5 truncate font-serif text-[11px]"
              style={{ color: textColor, opacity: 0.55 }}
            >
              {chapter.title}
            </div>
            <div
              className="space-y-[0.55em] font-serif"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.85, color: textColor }}
            >
              {splitParagraphs(chapter.content).map((paragraph, index) => (
                <p key={index} style={{ textIndent: "2em" }}>
                  {paragraph}
                </p>
              ))}
            </div>
          </>
        ) : (
          <div
            className="flex h-full items-center justify-center text-[11px]"
            style={{ color: textColor, opacity: 0.6 }}
          >
            正在加载章节…
          </div>
        )}
      </main>

      {panelOpen && (
        <>
          <div className="absolute inset-0 z-20" onClick={() => setPanelOpen(false)} />
          <div className="mini-scroll absolute right-2 top-[46px] z-30 max-h-[calc(100%-56px)] w-[250px] overflow-y-auto rounded-2xl border border-white/10 bg-[#1c1d20]/95 p-3.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12px] font-medium text-white/80">小窗外观</span>
              <button
                type="button"
                aria-label="收起设置"
                onClick={() => setPanelOpen(false)}
                className="grid size-6 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white/90"
              >
                <X className="size-3.5" strokeWidth={1.9} />
              </button>
            </div>

            <MiniSlider
              label="背景透明度"
              value={settings.miniBgOpacity}
              min={0}
              max={1}
              onChange={(value) => updateSettings({ miniBgOpacity: value })}
            />
            <MiniSlider
              label="文字透明度"
              value={settings.miniTextOpacity}
              min={0.35}
              max={1}
              onChange={(value) => updateSettings({ miniTextOpacity: value })}
            />

            <div className="mb-3.5">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/60">
                <span>文字颜色</span>
                <span className="tabular-nums uppercase">{settings.miniTextColor}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {TEXT_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    title={preset.label}
                    aria-label={`文字颜色 ${preset.label}`}
                    onClick={() => updateSettings({ miniTextColor: preset.value })}
                    className={`size-6 rounded-md border border-white/15 transition ${
                      settings.miniTextColor === preset.value
                        ? "ring-2 ring-white/70 ring-offset-2 ring-offset-[#1c1d20]"
                        : ""
                    }`}
                    style={{ backgroundColor: preset.value }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="自定义文字颜色"
                  className="color-swatch size-6 cursor-pointer"
                  style={{ borderColor: "rgba(255,255,255,0.25)" }}
                  value={settings.miniTextColor}
                  onChange={(event) => updateSettings({ miniTextColor: event.target.value })}
                />
              </div>
            </div>

            <p className="mt-3 text-[10px] leading-relaxed text-white/35">
              拖动顶部空白区域可移动小窗，窗口默认始终置顶。
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function MiniSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mb-3.5">
      <div className="mb-1 flex items-center justify-between text-[11px] text-white/60">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <Slider
        value={value}
        minValue={min}
        maxValue={max}
        step={0.01}
        onChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? value) : next)}
        className="w-full"
      >
        <Label className="sr-only">{label}</Label>
        <Slider.Track>
          <Slider.Fill />
          <Slider.Thumb />
        </Slider.Track>
      </Slider>
    </div>
  );
}
