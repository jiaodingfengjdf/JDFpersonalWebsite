import { createHash } from "node:crypto";
import { ledgerDate, parseLedgerDate } from "@/lib/ledger-date";
import { errors } from "@/server/http/errors";
import {
  transactionInput,
  type LedgerKind,
  type LedgerTransaction,
  type TransactionInput,
} from "./contracts";

function readRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
        closed = true;
      }
      continue;
    }
    if (char === "," || char === "\r" || char === "\n") {
      row.push(cell);
      cell = "";
      closed = false;
      if (char === ",") continue;
      if (char === "\r" && csv[index + 1] === "\n") index += 1;
      rows.push(row);
      row = [];
    } else if (char === '"' && cell === "" && !closed) {
      quoted = true;
    } else {
      if (closed || char === '"') throw errors.validation("CSV 字段引号格式有误");
      cell += char;
    }
  }
  if (quoted) throw errors.validation("CSV 存在未闭合的引号");
  if (cell || row.length || closed) rows.push([...row, cell]);
  return rows;
}

/** 用于把导出 CSV 中的「账户 / 分类」名称还原成当前库里的 id。 */
export interface CsvNameIndex {
  accounts?: Array<{ id: number; name: string }>;
  categories?: Array<{ id: number; name: string; kind: LedgerKind }>;
}

const normalizeName = (value: string | undefined): string =>
  (value ?? "").trim().toLowerCase();

export function parseLedgerCsv(
  csv: string,
  accountId: number,
  names: CsvNameIndex = {},
): TransactionInput[] {
  const [header, ...data] = readRows(csv.replace(/^\uFEFF/, "")).filter((row) => row.some((cell) => cell.trim()));
  const columns = header?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const dateIndex = columns.findIndex((name) => name === "日期" || name === "date");
  const amountIndex = columns.findIndex((name) => name === "金额" || name === "amount");
  const merchantIndex = columns.findIndex((name) => name === "商家" || name === "merchant");
  const noteIndex = columns.findIndex((name) => name === "备注" || name === "note");
  const accountIndex = columns.findIndex((name) => name === "账户" || name === "account");
  const categoryIndex = columns.findIndex((name) => name === "分类" || name === "category");
  if (dateIndex < 0 || amountIndex < 0) throw errors.validation("CSV 首行需要包含日期和金额列");
  if (data.length === 0 || data.length > 2000) throw errors.validation("每次可导入 1 至 2000 条流水");

  const accountIds = new Map<string, number>();
  for (const account of names.accounts ?? []) {
    const key = normalizeName(account.name);
    if (key) accountIds.set(key, account.id);
  }
  const categories = new Map<string, { id: number; kind: LedgerKind }>();
  for (const category of names.categories ?? []) {
    const key = normalizeName(category.name);
    if (key) categories.set(key, { id: category.id, kind: category.kind });
  }

  const occurrences = new Map<string, number>();
  return data.map((row, index) => {
    const date = row[dateIndex]?.trim() ?? "";
    const amountText = row[amountIndex]?.trim() ?? "";
    const amount = Number(amountText);
    const kind: LedgerKind = amount >= 0 ? "income" : "expense";
    const rowAccountId =
      accountIndex >= 0 ? accountIds.get(normalizeName(row[accountIndex])) : undefined;
    const resolvedAccountId = rowAccountId ?? accountId;
    const categoryMatch =
      categoryIndex >= 0 ? categories.get(normalizeName(row[categoryIndex])) : undefined;
    const categoryId = categoryMatch?.kind === kind ? categoryMatch.id : null;
    const parsed = transactionInput.safeParse({
      account_id: resolvedAccountId,
      category_id: categoryId,
      kind,
      occurred_at: parseLedgerDate(date),
      amount: /^[+-]?\d+(?:\.\d{1,2})?$/.test(amountText) ? Math.abs(amount) : NaN,
      merchant: row[merchantIndex],
      note: row[noteIndex],
    });
    if (!parsed.success) throw errors.validation(`CSV 第 ${index + 1} 条流水的日期、金额或文本有误`);
    const item = parsed.data;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([resolvedAccountId, date, amount, item.merchant, item.note]))
      .digest("hex");
    const occurrence = (occurrences.get(fingerprint) ?? 0) + 1;
    occurrences.set(fingerprint, occurrence);
    return { ...item, external_id: `csv:${fingerprint}:${occurrence}` };
  });
}

function csvText(value: string): string {
  const safe = /^[\t\r\n]|^\s*[=+@-]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function exportLedgerCsv(items: LedgerTransaction[]): string {
  const lines = items.map((item) => [
    ledgerDate(item.occurred_at),
    (item.kind === "expense" ? -item.amount : item.amount).toFixed(2),
    csvText(item.merchant),
    csvText(item.note),
    csvText(item.account_name),
    csvText(item.category_name),
  ].join(","));
  return "\uFEFF" + ["日期,金额,商家,备注,账户,分类", ...lines].join("\r\n") + "\r\n";
}
