const COVER_PALETTES: [string, string][] = [
  ["#8c7a6b", "#5d4f45"],
  ["#6b7f8c", "#3f5160"],
  ["#8c6b78", "#5a3f4a"],
  ["#7f8c6b", "#4f5a3f"],
  ["#6b6f8c", "#41445e"],
  ["#9a866d", "#64553f"],
  ["#6b8c86", "#3f5a55"],
  ["#8c6f6b", "#5a4540"],
];

function hash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) % 2147483647;
  }
  return value;
}

export function coverGradient(id: string): { from: string; to: string } {
  const palette = COVER_PALETTES[hash(id) % COVER_PALETTES.length] ?? COVER_PALETTES[0]!;
  return { from: palette[0], to: palette[1] };
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day}`;
}

export function splitParagraphs(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
