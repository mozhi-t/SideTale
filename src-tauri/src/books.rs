use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use regex::Regex;
use serde::{Deserialize, Serialize};

/// 书库中的一本书的元信息（体积小，单独存一个文件，便于快速列出）
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookMeta {
    pub id: String,
    pub title: String,
    pub author: String,
    pub chapter_count: usize,
    pub imported_at: u64,
    pub last_read_chapter: usize,
    pub last_read_progress: f64,
    pub size_bytes: u64,
    pub format: String,
    pub source_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookDetail {
    pub meta: BookMeta,
    pub chapter_titles: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterPayload {
    pub index: usize,
    pub title: String,
    pub content: String,
    pub chapter_count: usize,
}

/// 前端解析好 EPUB 之后提交给后端保存
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBook {
    pub title: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub source_path: String,
    #[serde(default = "default_format")]
    pub format: String,
    #[serde(default)]
    pub size_bytes: u64,
    pub chapters: Vec<NewChapter>,
}

#[derive(Deserialize)]
pub struct NewChapter {
    pub title: String,
    pub content: String,
}

fn default_format() -> String {
    "epub".to_string()
}

pub struct Store {
    root: PathBuf,
    cache: Mutex<HashMap<String, Arc<Vec<Chapter>>>>,
}

impl Store {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(root.join("library")).map_err(|e| format!("无法创建书库目录: {e}"))?;
        fs::create_dir_all(root.join("books")).map_err(|e| format!("无法创建书库目录: {e}"))?;
        Ok(Self {
            root,
            cache: Mutex::new(HashMap::new()),
        })
    }

    fn meta_path(&self, id: &str) -> PathBuf {
        self.root.join("library").join(format!("{id}.json"))
    }

    fn chapters_path(&self, id: &str) -> PathBuf {
        self.root.join("books").join(format!("{id}.json"))
    }

    pub fn list_books(&self) -> Result<Vec<BookMeta>, String> {
        let dir = self.root.join("library");
        let mut books = Vec::new();
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => return Ok(books),
        };
        for entry in entries {
            let entry = entry.map_err(|e| format!("读取书库失败: {e}"))?;
            if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Ok(raw) = fs::read(entry.path()) {
                if let Ok(meta) = serde_json::from_slice::<BookMeta>(&raw) {
                    books.push(meta);
                }
            }
        }
        books.sort_by(|a, b| b.imported_at.cmp(&a.imported_at));
        Ok(books)
    }

    pub fn get_meta(&self, id: &str) -> Result<BookMeta, String> {
        let raw = fs::read(self.meta_path(id)).map_err(|_| "书籍不存在".to_string())?;
        serde_json::from_slice(&raw).map_err(|e| format!("书籍信息损坏: {e}"))
    }

    pub fn get_detail(&self, id: &str) -> Result<BookDetail, String> {
        let meta = self.get_meta(id)?;
        let chapters = self.load_chapters(id)?;
        Ok(BookDetail {
            meta,
            chapter_titles: chapters.iter().map(|chapter| chapter.title.clone()).collect(),
        })
    }

    pub fn get_chapter(&self, id: &str, index: usize) -> Result<ChapterPayload, String> {
        let chapters = self.load_chapters(id)?;
        let chapter = chapters
            .get(index)
            .ok_or_else(|| "该章节不存在，可能已被移除".to_string())?;
        Ok(ChapterPayload {
            index,
            title: chapter.title.clone(),
            content: chapter.content.clone(),
            chapter_count: chapters.len(),
        })
    }

    fn load_chapters(&self, id: &str) -> Result<Arc<Vec<Chapter>>, String> {
        let cached = self
            .cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .get(id)
            .cloned();
        if let Some(chapters) = cached {
            return Ok(chapters);
        }

        let raw = fs::read(self.chapters_path(id)).map_err(|_| "书籍正文不存在".to_string())?;
        let chapters: Vec<Chapter> =
            serde_json::from_slice(&raw).map_err(|e| format!("书籍正文损坏: {e}"))?;
        let chapters = Arc::new(chapters);

        let mut cache = self
            .cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if cache.len() >= 2 {
            cache.clear();
        }
        cache.insert(id.to_string(), chapters.clone());
        Ok(chapters)
    }

    pub fn save_chapters(
        &self,
        meta: &BookMeta,
        chapters: &[Chapter],
    ) -> Result<(), String> {
        write_json(&self.chapters_path(&meta.id), &chapters)?;
        write_json(&self.meta_path(&meta.id), meta)?;
        self.cache
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .insert(meta.id.clone(), Arc::new(chapters.to_vec()));
        Ok(())
    }

    pub fn delete_book(&self, id: &str) -> Result<(), String> {
        let _ = fs::remove_file(self.meta_path(id));
        let _ = fs::remove_file(self.chapters_path(id));
        if let Ok(mut cache) = self.cache.lock() {
            cache.remove(id);
        }
        Ok(())
    }

    pub fn update_progress(&self, id: &str, chapter: usize, progress: f64) -> Result<(), String> {
        let mut meta = self.get_meta(id)?;
        meta.last_read_chapter = chapter.min(meta.chapter_count.saturating_sub(1));
        meta.last_read_progress = progress.clamp(0.0, 1.0);
        write_json(&self.meta_path(id), &meta)
    }

    /// 导入 TXT / Markdown 文件（自动识别 UTF-8 / UTF-16 / GBK(GB18030) 编码）
    pub fn import_text(&self, path: &str) -> Result<BookMeta, String> {
        let file_path = Path::new(path);
        let bytes = fs::read(file_path).map_err(|e| format!("无法读取文件: {e}"))?;
        if bytes.len() > 256 * 1024 * 1024 {
            return Err("文件过大（超过 256MB）".to_string());
        }
        let extension = file_path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("txt")
            .to_lowercase();
        if extension != "txt" && extension != "md" && extension != "markdown" {
            return Err("目前仅支持 TXT / Markdown / EPUB 文件".to_string());
        }

        let text = decode_text(&bytes);
        let chapters = split_chapters(&text, &extension);
        if chapters.is_empty() {
            return Err("没有解析到可阅读的正文内容".to_string());
        }

        let title = file_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("未命名小说")
            .trim()
            .to_string();
        let author = extract_author(&text);
        let meta = BookMeta {
            id: uuid::Uuid::new_v4().to_string(),
            title: if title.is_empty() { "未命名小说".to_string() } else { title },
            author,
            chapter_count: chapters.len(),
            imported_at: now_millis(),
            last_read_chapter: 0,
            last_read_progress: 0.0,
            size_bytes: bytes.len() as u64,
            format: extension,
            source_path: path.to_string(),
        };
        self.save_chapters(&meta, &chapters)?;
        Ok(meta)
    }

    /// 保存前端解析好的书籍（EPUB）
    pub fn save_new_book(&self, payload: NewBook) -> Result<BookMeta, String> {
        let chapters: Vec<Chapter> = payload
            .chapters
            .into_iter()
            .filter(|chapter| !chapter.content.trim().is_empty())
            .map(|chapter| Chapter {
                title: if chapter.title.trim().is_empty() {
                    "未命名章节".to_string()
                } else {
                    truncate(chapter.title.trim(), 80)
                },
                content: chapter.content.trim().to_string(),
            })
            .collect();
        if chapters.is_empty() {
            return Err("没有解析到可阅读的正文内容".to_string());
        }

        let meta = BookMeta {
            id: uuid::Uuid::new_v4().to_string(),
            title: if payload.title.trim().is_empty() {
                "未命名小说".to_string()
            } else {
                truncate(payload.title.trim(), 120)
            },
            author: payload.author.trim().to_string(),
            chapter_count: chapters.len(),
            imported_at: now_millis(),
            last_read_chapter: 0,
            last_read_progress: 0.0,
            size_bytes: payload.size_bytes,
            format: if payload.format.trim().is_empty() { "epub".to_string() } else { payload.format },
            source_path: payload.source_path,
        };
        self.save_chapters(&meta, &chapters)?;
        Ok(meta)
    }
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建目录: {e}"))?;
    }
    let data = serde_json::to_vec(value).map_err(|e| format!("数据序列化失败: {e}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, data).map_err(|e| format!("写入失败: {e}"))?;
    fs::rename(&temp, path).map_err(|e| format!("保存失败: {e}"))?;
    Ok(())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn decode_text(bytes: &[u8]) -> String {
    // UTF-8 BOM
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return normalize(&String::from_utf8_lossy(&bytes[3..]));
    }
    // UTF-16 LE / BE
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (text, _, _) = encoding_rs::UTF_16LE.decode(&bytes[2..]);
        return normalize(&text);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (text, _, _) = encoding_rs::UTF_16BE.decode(&bytes[2..]);
        return normalize(&text);
    }
    // 先尝试 UTF-8，失败后按 GB18030（兼容 GBK / GB2312）解码
    match std::str::from_utf8(bytes) {
        Ok(text) => normalize(text),
        Err(_) => {
            let (text, _, _) = encoding_rs::GB18030.decode(bytes);
            normalize(&text)
        }
    }
}

fn normalize(text: &str) -> String {
    text.replace("\r\n", "\n")
        .replace('\r', "\n")
        .replace('\u{feff}', "")
        .trim()
        .to_string()
}

fn chapter_heading_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"^\s*(?:第[0-9０-９〇零一二三四五六七八九十百千万两]{1,12}[章回节卷篇集]|(?:序章|楔子|引子|前言|序言|后记|尾声|终章|番外(?:篇)?(?:[0-9一二三四五六七八九十]*)|Chapter\s+[0-9IVXLC]+))",
        )
        .expect("章节标题正则表达式非法")
    })
}

fn is_heading(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 60 {
        return false;
    }
    if !chapter_heading_regex().is_match(trimmed) {
        return false;
    }
    // 标题通常不以句号、逗号等行文标点结尾
    !matches!(
        trimmed.chars().last(),
        Some('。') | Some('！') | Some('？') | Some('，') | Some('、') | Some('；') | Some('”') | Some('"')
    )
}

fn is_markdown_heading(line: &str) -> bool {
    let trimmed = line.trim();
    trimmed.starts_with('#') && trimmed.chars().count() <= 60
}

fn split_chapters(text: &str, extension: &str) -> Vec<Chapter> {
    if text.trim().is_empty() {
        return Vec::new();
    }
    let lines: Vec<&str> = text.split('\n').collect();
    let heading_match: fn(&str) -> bool = if extension == "md" || extension == "markdown" {
        |line: &str| is_heading(line) || is_markdown_heading(line)
    } else {
        is_heading
    };

    let mut heads: Vec<usize> = lines
        .iter()
        .enumerate()
        .filter(|(_, line)| heading_match(*line))
        .map(|(index, _)| index)
        .collect();

    if heads.is_empty() {
        return vec![Chapter {
            title: "全文".to_string(),
            content: text.trim().to_string(),
        }];
    }

    // 第一个标题之前的短序言并入正文，较长的单独成为「前言」
    heads.sort_unstable();
    let mut chapters: Vec<Chapter> = Vec::new();
    let preamble = lines[..heads[0]].join("\n");
    if preamble.trim().chars().count() >= 40 {
        chapters.push(Chapter {
            title: "前言".to_string(),
            content: preamble.trim().to_string(),
        });
    }

    for (position, &start) in heads.iter().enumerate() {
        let end = heads.get(position + 1).copied().unwrap_or(lines.len());
        let title = normalize_heading(lines[start]);
        if title.is_empty() {
            continue;
        }
        let content = lines[start + 1..end].join("\n").trim().to_string();
        if content.is_empty() {
            continue;
        }
        chapters.push(Chapter { title, content });
    }

    if chapters.is_empty() {
        chapters.push(Chapter {
            title: "全文".to_string(),
            content: text.trim().to_string(),
        });
    }
    chapters
}

fn normalize_heading(line: &str) -> String {
    let trimmed = line.trim().trim_start_matches('#').trim();
    truncate(trimmed, 80)
}

fn truncate(text: &str, limit: usize) -> String {
    let mut result: String = text.chars().take(limit).collect();
    if text.chars().count() > limit {
        result.push('…');
    }
    result
}

fn extract_author(text: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let regex = RE.get_or_init(|| {
        Regex::new(r"(?:作者|作\s*者|Author)\s*[：:]\s*([^\n\r]{1,40})").expect("作者正则非法")
    });
    let head: String = text.chars().take(4000).collect();
    regex
        .captures(&head)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_text() -> String {
        let mut text = String::from("测试小说\n作者：墨知\n\n");
        for index in 1..=3 {
            text.push_str(&format!("第{index}章 章节标题\n"));
            text.push_str("这是正文第一段。\n这是正文第二段。\n\n");
        }
        text
    }

    #[test]
    fn split_chapters_works() {
        let chapters = split_chapters(&sample_text(), "txt");
        assert_eq!(chapters.len(), 3);
        assert_eq!(chapters[0].title, "第1章 章节标题");
        assert!(chapters[0].content.contains("正文第一段"));
    }

    #[test]
    fn import_gbk_text() {
        let dir = std::env::temp_dir().join("sidetale-test-store");
        let _ = fs::remove_dir_all(&dir);
        let store = Store::new(dir.clone()).unwrap();
        let text = sample_text();
        let (encoded, _, had_errors) = encoding_rs::GB18030.encode(&text);
        assert!(!had_errors);
        let file = dir.join("测试.txt");
        fs::write(&file, encoded).unwrap();
        let meta = store.import_text(file.to_str().unwrap()).unwrap();
        assert_eq!(meta.chapter_count, 3);
        assert_eq!(meta.author, "墨知");
        assert_eq!(meta.title, "测试");
        let detail = store.get_detail(&meta.id).unwrap();
        assert_eq!(detail.chapter_titles.len(), 3);
    }
}
