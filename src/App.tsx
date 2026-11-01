import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { Sidebar, type Page } from "./components/Sidebar";
import { LibraryPage } from "./pages/LibraryPage";
import { ReaderPage } from "./pages/ReaderPage";
import { SettingsPage } from "./pages/SettingsPage";
import { api, errorMessage, type BookMeta } from "./lib/api";
import { parseEpub } from "./lib/epub";
import { clearPosition } from "./lib/progress";
import { setReaderState, useReaderState } from "./lib/reader";
import { useSettings } from "./lib/settings";

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default function App() {
  const [page, setPage] = useState<Page>("library");
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const settings = useSettings();
  const reader = useReaderState();

  const reloadBooks = async () => {
    try {
      const list = await api.listBooks();
      setBooks(list);
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (page !== "library") return;
    void reloadBooks();
  }, [page]);

  useEffect(() => {
    let active = true;
    api
      .setPrivacyProtection(settings.privacyProtection)
      .then(() => {
        if (active) setPrivacyError(null);
      })
      .catch((reason: unknown) => {
        if (active) setPrivacyError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [settings.privacyProtection]);

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const selection = await open({
        multiple: true,
        directory: false,
        title: "选择小说文件",
        filters: [
          { name: "小说文件", extensions: ["txt", "md", "markdown", "epub"] },
        ],
      });
      if (!selection) return;

      const paths = Array.isArray(selection) ? selection : [selection];
      const failures: string[] = [];

      for (const path of paths) {
        try {
          if (/\.epub$/i.test(path)) {
            const base64 = await api.readFileBase64(path);
            await api.saveParsedBook(await parseEpub(base64, path));
          } else {
            await api.importTextBook(path);
          }
        } catch (reason) {
          failures.push(`${baseName(path)}：${errorMessage(reason)}`);
        }
      }

      await reloadBooks();
      if (failures.length > 0) {
        setError(`部分文件导入失败：${failures.join("；")}`);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setImporting(false);
    }
  };

  const handleOpenBook = (book: BookMeta) => {
    setReaderState({ bookId: book.id, chapterIndex: book.lastReadChapter });
    setPage("reader");
  };

  const handleDeleteBook = async (book: BookMeta) => {
    if (!window.confirm(`确定要把《${book.title}》从书库移除吗？`)) return;
    try {
      await api.deleteBook(book.id);
      clearPosition(book.id);
      if (reader.bookId === book.id) {
        setReaderState({ bookId: null, chapterIndex: 0 });
      }
      await reloadBooks();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const handleOpenMini = async () => {
    try {
      await api.showMiniWindow();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar
        page={page}
        onNavigate={setPage}
        onOpenMini={() => void handleOpenMini()}
        privacyEnabled={settings.privacyProtection}
        hasBook={reader.bookId !== null}
      />

      <main className="min-w-0 flex-1 bg-[#f8f6f2]">
        {page === "library" && (
          <LibraryPage
            books={books}
            loading={loading}
            importing={importing}
            error={error}
            onImport={() => void handleImport()}
            onOpenBook={handleOpenBook}
            onDeleteBook={(book) => void handleDeleteBook(book)}
          />
        )}
        {page === "reader" && (
          <ReaderPage
            onBack={() => setPage("library")}
            onOpenMini={() => void handleOpenMini()}
          />
        )}
        {page === "settings" && <SettingsPage privacyError={privacyError} />}
      </main>
    </div>
  );
}
