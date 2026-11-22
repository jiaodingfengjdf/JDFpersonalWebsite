import "server-only";
import { XMLParser } from "fast-xml-parser";

export interface FeedEntry {
  guid: string;
  title: string;
  link: string;
  summary: string;
  cover: string;
  publishedAt: number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "__cdata",
  trimValues: true,
  parseTagValue: false,
});

type Node = Record<string, unknown> | string | undefined;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: Node): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  const record = node as Record<string, unknown>;
  const direct = record["#text"] ?? record.__cdata;
  if (typeof direct === "string") return direct;
  if (typeof direct === "number") return String(direct);
  return "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function firstImage(raw: string): string {
  const match = raw.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? "";
}

function pickLink(link: Node | Node[]): string {
  for (const item of asArray(link)) {
    if (typeof item === "string") return item;
    const record = item as Record<string, unknown>;
    const href = record["@_href"];
    const rel = record["@_rel"];
    if (typeof href === "string" && (rel === undefined || rel === "alternate")) return href;
  }
  const first = asArray(link)[0];
  return typeof first === "string" ? first : "";
}

function entryFromRss(item: Record<string, unknown>, fallbackLink: string): FeedEntry {
  const rawContent =
    textOf(item["content:encoded"] as Node) ||
    textOf(item.description as Node) ||
    textOf(item.summary as Node);
  const link = textOf(item.link as Node) || fallbackLink;
  const published = textOf(item.pubDate as Node) || textOf(item["dc:date"] as Node);
  const time = Date.parse(published);
  const enclosure = asArray(item.enclosure as Node)[0] as Record<string, unknown> | undefined;
  const media = asArray((item["media:content"] ?? item["media:thumbnail"]) as Node)[0] as
    | Record<string, unknown>
    | undefined;

  return {
    guid: textOf(item.guid as Node) || link || textOf(item.title as Node),
    title: stripHtml(textOf(item.title as Node)) || "(无标题)",
    link,
    summary: stripHtml(rawContent).slice(0, 300),
    cover:
      (typeof media?.["@_url"] === "string" ? media["@_url"] : "") ||
      (typeof enclosure?.["@_url"] === "string" ? enclosure["@_url"] : "") ||
      firstImage(rawContent),
    publishedAt: Number.isFinite(time) ? time : Date.now(),
  };
}

function entryFromAtom(entry: Record<string, unknown>): FeedEntry {
  const rawContent =
    textOf(entry.content as Node) || textOf(entry.summary as Node) || "";
  const link = pickLink(entry.link as Node);
  const published = textOf(entry.published as Node) || textOf(entry.updated as Node);
  const time = Date.parse(published);
  return {
    guid: textOf(entry.id as Node) || link,
    title: stripHtml(textOf(entry.title as Node)) || "(无标题)",
    link,
    summary: stripHtml(rawContent).slice(0, 300),
    cover: firstImage(rawContent),
    publishedAt: Number.isFinite(time) ? time : Date.now(),
  };
}

export async function fetchFeed(url: string): Promise<FeedEntry[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; JDFFeedReader/1.0)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xml = await response.text();
    const doc = parser.parse(xml) as Record<string, unknown>;

    if (doc.rss) {
      const channel = (doc.rss as Record<string, unknown>).channel as Record<string, unknown> | undefined;
      const items = asArray(channel?.item as Node) as Array<Record<string, unknown>>;
      return items.map((item) => entryFromRss(item, ""));
    }
    if (doc.feed) {
      const entries = asArray((doc.feed as Record<string, unknown>).entry as Node) as Array<
        Record<string, unknown>
      >;
      return entries.map(entryFromAtom);
    }
    if (doc["rdf:RDF"]) {
      const items = asArray((doc["rdf:RDF"] as Record<string, unknown>).item as Node) as Array<
        Record<string, unknown>
      >;
      return items.map((item) => entryFromRss(item, ""));
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}
