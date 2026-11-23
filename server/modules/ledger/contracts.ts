import { z } from "zod";

export const ledgerKind = z.enum(["income", "expense"]);
export type LedgerKind = z.infer<typeof ledgerKind>;

const trimText = (max: number) => z.string().trim().max(max).default("");
export const ledgerMonth = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);

export const transactionInput = z.object({
  account_id: z.coerce.number().int().positive(),
  category_id: z.coerce.number().int().positive().nullable().default(null),
  kind: ledgerKind,
  amount: z.coerce.number().min(0.01, "金额至少为 0.01").max(100_000_000),
  occurred_at: z.coerce.number().int().positive(),
  merchant: trimText(120),
  note: trimText(500),
  tags: z.array(z.string().trim().min(1).max(20)).max(10).default([]),
  external_id: trimText(120).optional().nullable(),
});

export type TransactionInput = z.infer<typeof transactionInput>;

export const transactionQuery = z.object({
  month: ledgerMonth.optional(),
  account: z.coerce.number().int().positive().optional(),
  category: z.coerce.number().int().positive().optional(),
  kind: ledgerKind.optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const accountInput = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(["cash", "wechat", "alipay", "bank", "fund", "other"]).default("cash"),
  initial_balance: z.coerce.number().min(-1_000_000_000).max(1_000_000_000).default(0),
  sort: z.coerce.number().int().min(0).max(9999).default(0),
});

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(30),
  kind: ledgerKind,
  icon: trimText(8),
  sort: z.coerce.number().int().min(0).max(9999).default(0),
});

export const budgetInput = z.object({
  category_id: z.coerce.number().int().positive(),
  month: ledgerMonth,
  amount: z.coerce.number().min(0).max(100_000_000),
});

export const importInput = z.object({
  rows: z.array(transactionInput).min(1).max(2000),
});

export interface LedgerAccount {
  id: number;
  name: string;
  kind: string;
  initial_balance: number;
  balance: number;
  sort: number;
}

export interface LedgerCategory {
  id: number;
  name: string;
  kind: LedgerKind;
  icon: string;
  sort: number;
}

export interface LedgerTransaction {
  id: number;
  account_id: number;
  account_name: string;
  category_id: number | null;
  category_name: string;
  kind: LedgerKind;
  amount: number;
  occurred_at: number;
  merchant: string;
  note: string;
  tags: string[];
  external_id: string | null;
}

export interface LedgerSummary {
  month: string;
  income: number;
  expense: number;
  balance: number;
  by_category: Array<{
    category_id: number | null;
    category_name: string;
    kind: LedgerKind;
    total: number;
  }>;
  daily: Array<{ date: string; income: number; expense: number }>;
  budgets: Array<{
    category_id: number;
    category_name: string;
    amount: number;
    spent: number;
  }>;
  accounts: LedgerAccount[];
}
