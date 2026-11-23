import { z } from "zod";

export const bookStatus = z.enum(["unread", "reading", "done", "dropped"]);
export type BookStatus = z.infer<typeof bookStatus>;

export const bookInput = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(100).default(""),
  status: bookStatus.default("reading"),
  rating: z.coerce.number().int().min(0).max(5).default(0),
  note: z.string().trim().max(2000).default(""),
  cover: z.string().trim().max(1000).default(""),
});

export const progressInput = z.object({
  unit: z.coerce.number().int().min(0).max(100000),
  offset: z.coerce.number().min(0).max(1).default(0),
  percent: z.coerce.number().min(0).max(100).default(0),
  location: z.string().max(1024).refine((value) => value === "" || /^epubcfi\(.+\)$/.test(value)).default(""),
});

export interface LibraryBookView {
  id: number;
  title: string;
  author: string;
  format: "epub" | "txt" | "cbz";
  cover: string;
  file_url: string;
  bytes: number;
  total_units: number;
  status: BookStatus;
  rating: number;
  note: string;
  updated_at: string;
  progress: { unit: number; offset: number; percent: number; location: string } | null;
}
