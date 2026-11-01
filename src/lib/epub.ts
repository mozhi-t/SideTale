import JSZip from "jszip";

import type { SaveBookPayload } from "./api";

function firstText(doc: Document, tag: string): string {
  const nodes = doc.getElementsByTagNameNS("*", tag);
  if (nodes.length > 0) {
    return (nodes[0]?.textContent ?? "").trim();
  }
  const fallback = doc.getElementsByTagName(tag)[0];
  return (fallback?.textContent ?? "").trim();
}

function resolvePath(basePath: string, href: string): string {
  const cleanHref = decodeURIComponent(href.split("#")[0] ?? "");
  const baseDir = basePath.includes("/")
    ? basePath.slice(0, basePath.lastIndexOf("/"))
    : "";
  const segments = [...(baseDir ? baseDir.split("/") : []), ...cleanHref.split("/")];
  const output: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      output.pop();
      continue;
    }
    output.push(segment);
  }
  return output.join("/");
}

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const direct = zip.file(path);
  if (direct) return direct.async("string");

  const decoded = decodeURIComponent(path);
  const decodedFile = zip.file(decoded);
  if (decodedFile) return decodedFile.async("string");

  const lower = decoded.toLowerCase();
  const key = Object.keys(zip.files).find(
    (name) => name.toLowerCase() === lower || name.toLowerCase().replace(/^\.\//, "") === lower,
  );
  if (!key) throw new Error(`EPUB 内缺少文件：${path}`);
  const file = zip.file(key);
  if (!file) throw new Error(`EPUB 内缺少文件：${path}`);
  return file.async("string");
}

function htmlToText(html: string): { title: string; content: string } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return { title: "", content: "" };

  body.querySelectorAll("script, style, nav, head, title").forEach((node) => node.remove());

  const heading = body.querySelector("h1, h2, h3");
  const title = (heading?.textContent ?? "").replace(/\s+/g, " ").trim();

  const blocks = Array.from(
    body.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td"),
  )
    .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0);

  const content =
    blocks.length > 0
      ? blocks.join("\n")
      : (body.textContent ?? "").replace(/\s+/g, " ").trim();

  return { title, content };
}

export async function parseEpub(base64: string, sourcePath: string): Promise<SaveBookPayload> {
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const containerXml = await readZipText(zip, "META-INF/container.xml");
  const container = new DOMParser().parseFromString(containerXml, "application/xml");
  const rootfile = container.getElementsByTagName("rootfile")[0];
  const opfPath = rootfile?.getAttribute("full-path");
  if (!opfPath) throw new Error("EPUB 结构异常：找不到内容清单");

  const opfXml = await readZipText(zip, opfPath);
  const opf = new DOMParser().parseFromString(opfXml, "application/xml");

  const title = firstText(opf, "title") || sourcePath.split(/[\\/]/).pop()?.replace(/\.epub$/i, "") || "未命名小说";
  const author = firstText(opf, "creator");

  const items = new Map<string, { href: string; type: string }>();
  Array.from(opf.getElementsByTagName("item")).forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) return;
    items.set(id, { href, type: item.getAttribute("media-type") ?? "" });
  });

  const spine = Array.from(opf.getElementsByTagName("itemref"))
    .map((item) => item.getAttribute("idref"))
    .filter((id): id is string => Boolean(id));

  const chapters: { title: string; content: string }[] = [];
  for (const idref of spine) {
    const item = items.get(idref);
    if (!item) continue;
    if (item.type && item.type !== "application/xhtml+xml" && item.type !== "text/html") continue;
    try {
      const filePath = resolvePath(opfPath, item.href);
      const html = await readZipText(zip, filePath);
      const parsed = htmlToText(html);
      if (!parsed.content) continue;
      chapters.push({
        title: parsed.title || `第 ${chapters.length + 1} 节`,
        content: parsed.content,
      });
    } catch {
      // 单个章节读取失败时跳过，不阻断整本书导入
    }
  }

  if (chapters.length === 0) throw new Error("EPUB 中没有解析到可阅读的正文");

  return {
    title,
    author,
    sourcePath,
    format: "epub",
    sizeBytes: 0,
    chapters,
  };
}
