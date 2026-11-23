export function splitChapters(text: string): string[] {
  const input = text.replace(/^\uFEFF/, "");
  const headings = input.matchAll(/^[ \t]*(?:第[0-9零〇一二三四五六七八九十百千两]+[章节回]|#{1,2}[ \t]+\S)[^\r\n]*/gm);
  const chapters: string[] = [];
  let start = 0;
  for (const heading of headings) {
    const prefix = input.slice(start, heading.index).trim();
    if (prefix) chapters.push(prefix);
    start = heading.index;
  }
  const last = input.slice(start).trim();
  if (last) chapters.push(last);
  return chapters;
}
