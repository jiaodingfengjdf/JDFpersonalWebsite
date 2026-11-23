import { expect, it } from "vitest";
import { splitChapters } from "./library-chapters";

it("keeps front matter and chapter titles in a TXT book", () => {
  expect(splitChapters("\uFEFF序言\r\n第一章 开始\r\n正文\r\n## 尾声\r\n完"))
    .toEqual(["序言", "第一章 开始\r\n正文", "## 尾声\r\n完"]);
  expect(splitChapters("   ")).toEqual([]);
});
