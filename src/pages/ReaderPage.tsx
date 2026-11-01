import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@heroui/react";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ListTree,
  PictureInPicture2,
} from "lucide-react";

import { api, errorMessage, type BookDetail, type ChapterPayload } from "../lib/api";
import { splitParagraphs } from "../lib/format";
import { setReaderState, useReaderState } from "../lib/reader";
import { useSettings } from "../lib/settings";

const POSITION_PREFIX = "sidetale:position";

interface SavedPosition {
  chapter: number;
  ratio: number;
}

function readPosition(bookId: string): SavedPosition | null {
  try {
    const raw = localStorage.getItem(`${POSITION_PREFIX}:${bookId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedPosition>;
    if (!Number.isFinite(parsed.chapter) || !Number.isFinite(parsed.ratio)) return null;
    return { chapter: Number(parsed.chapter), ratio: Math.min(1, Math.max(0, Number(parsed.ratio))) };
  } catch {
    return null;
  }
}

function writePosition(bookId: string, position: SavedPosition): void {
  try {
    localStorage.setItem(`${POSITION_PREFIX}:${bookId}`, JSON.stringify(position));
  } catch {
    // 忽略存储失败
  }
}

interface ReaderPageProps {
  onBack: () => void;
  onOpenMini: () => void;
}

export function ReaderPage({ onBack, onOpenMini }: ReaderPageProps) {
  const { bookId, chapterIndex } = useReaderState();
  const settings = useSettings();
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [chapter, setChapter] = useState<ChapterPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!bookId) {
      setDetail(null);
      setChapter(null);
      setError(null);
      return;
    }
    let active = true;
    setError(null);
    api
      .getBookDetail(bookId)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((reason: unknown) => {
        if (active) {
          setDetail(null);
          setChapter(null);
          setError(errorMessage(reason));
        }
      });
    return () => {
      active = false;
    };
  }, [bookId]);

  useEffect(() => {
    if (!bookId) return;
    let active = true;
    setLoading(true);
    api
      .getChapter(bookId, chapterIndex)
      .then((value) => {
        if (!active) return;
        setChapter(value);
        setError(null);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setChapter(null);
        setError(errorMessage(reason));
        setLoading(false);
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
    const max = node.scrollHeight - node.clientHeight;
    node.scrollTop =
      saved && saved.chapter === chapter.index ? saved.ratio * Math.max(0, max) : 0;
  }, [chapter, bookId]);

  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, []);

  const total = chapter?.chapterCount ?? detail?.meta.chapterCount ?? 0;

  const goToChapter = (index: number) => {
    if (index < 0 || index >= total) return;
    setReaderState({ chapterIndex: index });
  };

  const handleScroll = () => {
    if (!bookId || !chapter) return;
    const node = scrollRef.current;
    if (!node) return;
    const max = node.scrollHeight - node.clientHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, node.scrollTop / max)) : 0;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      writePosition(bookId, { chapter: chapter.index, ratio });
      void api.saveReadProgress(bookId, chapter.index, ratio).catch(() => undefined);
    }, 600);
  };

  if (!bookId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="grid size-14 place-items-center rounded-2xl bg-black/[0.05] text-[#5f5b51]">
          <BookOpen className="size-6" strokeWidth={1.6} />
        </div>
        <div className="text-center">
          <h2 className="font-serif text-[18px] text-[#2b2a24]">还没有打开任何一本书</h2>
          <p className="mt-1 text-[12px] text-[#8a867c]">先去书库挑一本，再回来继续读。</p>
        </div>
        <Button variant="secondary" onPress={onBack}>
          前往书库
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fbfaf7]">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-black/[0.06] px-6">
        <Button variant="ghost" size="sm" onPress={onBack}>
          <ArrowLeft className="size-4" strokeWidth={1.8} />
          书库
        </Button>

        <div className="min-w-0 flex-1 px-2">
          <div className="truncate text-[11px] text-[#9c978b]">
            {detail ? `${detail.meta.title}${detail.meta.author ? ` · ${detail.meta.author}` : ""}` : "正在加载…"}
          </div>
          <div className="truncate font-serif text-[15px] text-[#2b2a24]">
            {chapter?.title ?? " "}
          </div>
        </div>

        <Modal>
          <Button variant="secondary" size="sm">
            <ListTree className="size-4" strokeWidth={1.8} />
            目录
          </Button>
          <Modal.Backdrop>
            <Modal.Container>
              <Modal.Dialog className="sm:max-w-[460px]">
                <Modal.CloseTrigger />
                <Modal.Header>
                  <Modal.Heading>目录</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="thin-scroll max-h-[60vh] overflow-y-auto">
                  <div className="flex flex-col">
                    {(detail?.chapterTitles ?? []).map((title, index) => (
                      <Button
                        key={`${index}-${title}`}
                        slot="close"
                        variant="ghost"
                        size="sm"
                        onPress={() => goToChapter(index)}
                        className={`h-auto w-full justify-start gap-3 rounded-lg px-3 py-1.5 text-left text-[13px] font-normal ${
                          index === chapterIndex ? "bg-black/[0.05] text-[#2b2a24]" : "text-[#6f6b61]"
                        }`}
                      >
                        <span className="w-8 shrink-0 text-[10.5px] tabular-nums text-[#a09b8f]">
                          {index + 1}
                        </span>
                        <span className="line-clamp-1 flex-1">{title}</span>
                      </Button>
                    ))}
                  </div>
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>

        <Button variant="secondary" size="sm" onPress={onOpenMini}>
          <PictureInPicture2 className="size-4" strokeWidth={1.8} />
          小窗
        </Button>
      </header>

      {error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[13px] text-red-700">{error}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onPress={onBack}>
              返回书库
            </Button>
            <Button size="sm" onPress={() => void api.showMiniWindow()}>
              打开小窗
            </Button>
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="thin-scroll min-h-0 flex-1 overflow-y-auto"
        >
          <article
            className="mx-auto w-full max-w-[720px] px-10 py-11 font-serif text-[#2f2d27]"
            style={{ fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }}
          >
            {loading || !chapter ? (
              <div className="py-24 text-center text-[12px] text-[#9c978b]">正在加载章节…</div>
            ) : (
              <>
                <h1 className="mb-8 text-center font-serif text-[1.45em] font-medium tracking-wide text-[#2b2a24]">
                  {chapter.title}
                </h1>
                <div className="space-y-[0.85em]">
                  {splitParagraphs(chapter.content).map((paragraph, index) => (
                    <p key={index} style={{ textIndent: "2em" }}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </>
            )}
          </article>
        </div>
      )}

      <footer className="flex h-14 shrink-0 items-center justify-between border-t border-black/[0.06] bg-[#fbfaf7] px-6">
        <Button
          variant="ghost"
          size="sm"
          isDisabled={chapterIndex <= 0}
          onPress={() => goToChapter(chapterIndex - 1)}
        >
          <ChevronLeft className="size-4" strokeWidth={1.8} />
          上一章
        </Button>
        <div className="text-[11px] tabular-nums text-[#9c978b]">
          {total > 0 ? `${chapterIndex + 1} / ${total}` : "—"}
        </div>
        <Button
          variant="ghost"
          size="sm"
          isDisabled={total === 0 || chapterIndex >= total - 1}
          onPress={() => goToChapter(chapterIndex + 1)}
        >
          下一章
          <ChevronRight className="size-4" strokeWidth={1.8} />
        </Button>
      </footer>
    </div>
  );
}
