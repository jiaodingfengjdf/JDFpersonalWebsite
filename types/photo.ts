export interface Photo {
  id: string;
  url: string;
  caption: string;
  orientation: "landscape" | "portrait";
  width?: number | null;
  height?: number | null;
  format?: string | null;
}
