import "server-only";
import { XMLParser } from "fast-xml-parser";

export interface ParsedShow {
  title: string;
  author: string;
  cover: string;
  description: string;
  episodes: ParsedEpisode[];
}

export interface ParsedEpisode {
  guid: string;
  title: string;
  audioUrl: string;
  duration: number;
  publishedAt: number;
  description: string;
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
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/** itunes:duration 可能是秒数，也可能是 HH:MM:SS。 */
function parseDuration(raw: string): number {
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const parts = raw.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export async function fetchPodcast(feedUrl: string): Promise<ParsedShow> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; JDFPodcast/1.0)",
        accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const xml = await response.text();
    const doc = parser.parse(xml) as Record<string, unknown>;
    const channel = (doc.rss as Record<string, unknown> | undefined)?.channel as
      | Record<string, unknown>
      | undefined;
    if (!channel) throw new Error("不是有效的播客 RSS");

    const imageNode = asArray(channel["itunes:image"] as Node)[0] as
      | Record<string, unknown>
      | undefined;
    const cover =
      (typeof imageNode?.["@_href"] === "string" ? imageNode["@_href"] : "") ||
      textOf(channel.image as Node);

    const items = asArray(channel.item as Node) as Array<Record<string, unknown>>;
    const episodes: ParsedEpisode[] = [];
    for (const item of items) {
      const enclosure = asArray(item.enclosure as Node)[0] as Record<string, unknown> | undefined;
      const audioUrl = typeof enclosure?.["@_url"] === "string" ? enclosure["@_url"] : "";
      if (!audioUrl) continue;
      const published = textOf(item.pubDate as Node);
      const time = Date.parse(published);
      episodes.push({
        guid: textOf(item.guid as Node) || audioUrl,
        title: stripHtml(textOf(item.title as Node)) || "(无标题)",
        audioUrl,
        duration: parseDuration(textOf(item["itunes:duration"] as Node)),
        publishedAt: Number.isFinite(time) ? time : Date.now(),
        description: stripHtml(textOf(item["itunes:summary"] as Node) || textOf(item.description as Node)).slice(0, 500),
      });
    }

    episodes.sort((a, b) => b.publishedAt - a.publishedAt);
    return {
      title: stripHtml(textOf(channel.title as Node)) || feedUrl,
      author: stripHtml(textOf(channel["itunes:author"] as Node)),
      cover,
      description: stripHtml(textOf(channel.description as Node)).slice(0, 500),
      episodes,
    };
  } finally {
    clearTimeout(timer);
  }
}
