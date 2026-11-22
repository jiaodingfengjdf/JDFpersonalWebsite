import { and, asc, desc, eq, gte, like, lt, or, sql } from "drizzle-orm";
import type { AppDatabase } from "@/server/db/types";
import { ledgerAccount, ledgerBudget, ledgerCategory, ledgerTxn } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import type {
  LedgerAccount,
  LedgerCategory,
  LedgerSummary,
  LedgerTransaction,
  TransactionInput,
} from "./contracts";

const round2 = (value: number) => Math.round(value * 100) / 100;

/** "2026-11" → [start, end) 毫秒时间戳（本地时区自然月） */
export function monthRange(month: string): { start: number; end: number } {
  const [year, mon] = month.split("-").map(Number);
  return {
    start: new Date(year, mon - 1, 1).getTime(),
    end: new Date(year, mon, 1).getTime(),
  };
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function createLedgerService(db: AppDatabase) {
  return {
    async accounts(): Promise<LedgerAccount[]> {
      const rows = await db
        .select()
        .from(ledgerAccount)
        .orderBy(asc(ledgerAccount.sort), asc(ledgerAccount.id));

      const sums = await db
        .select({
          accountId: ledgerTxn.accountId,
          kind: ledgerTxn.kind,
          total: sql<number>`sum(${ledgerTxn.amount})`,
        })
        .from(ledgerTxn)
        .groupBy(ledgerTxn.accountId, ledgerTxn.kind);

      const delta = new Map<number, number>();
      for (const row of sums) {
        const signed = row.kind === "income" ? row.total : -row.total;
        delta.set(row.accountId, (delta.get(row.accountId) ?? 0) + signed);
      }

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        initial_balance: row.initialBalance,
        balance: round2(row.initialBalance + (delta.get(row.id) ?? 0)),
        sort: row.sort,
      }));
    },

    async createAccount(input: {
      name: string;
      kind: string;
      initial_balance: number;
      sort: number;
    }): Promise<LedgerAccount> {
      const now = new Date();
      const [row] = await db
        .insert(ledgerAccount)
        .values({
          name: input.name,
          kind: input.kind,
          initialBalance: input.initial_balance,
          sort: input.sort,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: ledgerAccount.id });
      if (!row) throw errors.internal("创建账户失败");
      const all = await this.accounts();
      const created = all.find((item) => item.id === row.id);
      if (!created) throw errors.internal("创建账户失败");
      return created;
    },

    async categories(): Promise<LedgerCategory[]> {
      const rows = await db
        .select()
        .from(ledgerCategory)
        .orderBy(asc(ledgerCategory.kind), asc(ledgerCategory.sort), asc(ledgerCategory.id));
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind as LedgerCategory["kind"],
        icon: row.icon,
        sort: row.sort,
      }));
    },

    async createCategory(input: {
      name: string;
      kind: "income" | "expense";
      icon: string;
      sort: number;
    }): Promise<LedgerCategory> {
      const now = new Date();
      const [row] = await db
        .insert(ledgerCategory)
        .values({ ...input, createdAt: now, updatedAt: now })
        .returning({ id: ledgerCategory.id });
      if (!row) throw errors.internal("创建分类失败");
      return {
        id: row.id,
        name: input.name,
        kind: input.kind,
        icon: input.icon,
        sort: input.sort,
      };
    },

    async transactions(params: {
      month?: string;
      account?: number;
      category?: number;
      kind?: "income" | "expense";
      q?: string;
      limit: number;
      offset: number;
    }): Promise<{ items: LedgerTransaction[]; total: number }> {
      const conditions = [];
      if (params.month) {
        const { start, end } = monthRange(params.month);
        conditions.push(gte(ledgerTxn.occurredAt, start), lt(ledgerTxn.occurredAt, end));
      }
      if (params.account) conditions.push(eq(ledgerTxn.accountId, params.account));
      if (params.category) conditions.push(eq(ledgerTxn.categoryId, params.category));
      if (params.kind) conditions.push(eq(ledgerTxn.kind, params.kind));
      if (params.q) {
        conditions.push(
          or(like(ledgerTxn.merchant, `%${params.q}%`), like(ledgerTxn.note, `%${params.q}%`)),
        );
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({
          id: ledgerTxn.id,
          accountId: ledgerTxn.accountId,
          accountName: ledgerAccount.name,
          categoryId: ledgerTxn.categoryId,
          categoryName: ledgerCategory.name,
          kind: ledgerTxn.kind,
          amount: ledgerTxn.amount,
          occurredAt: ledgerTxn.occurredAt,
          merchant: ledgerTxn.merchant,
          note: ledgerTxn.note,
          tags: ledgerTxn.tags,
          externalId: ledgerTxn.externalId,
        })
        .from(ledgerTxn)
        .innerJoin(ledgerAccount, eq(ledgerAccount.id, ledgerTxn.accountId))
        .leftJoin(ledgerCategory, eq(ledgerCategory.id, ledgerTxn.categoryId))
        .where(where)
        .orderBy(desc(ledgerTxn.occurredAt), desc(ledgerTxn.id))
        .limit(params.limit)
        .offset(params.offset);

      const [countRow] = await db
        .select({ value: sql<number>`count(*)` })
        .from(ledgerTxn)
        .where(where);

      return {
        items: rows.map((row) => ({
          id: row.id,
          account_id: row.accountId,
          account_name: row.accountName,
          category_id: row.categoryId,
          category_name: row.categoryName ?? "",
          kind: row.kind as LedgerTransaction["kind"],
          amount: row.amount,
          occurred_at: row.occurredAt,
          merchant: row.merchant,
          note: row.note,
          tags: parseTags(row.tags),
          external_id: row.externalId,
        })),
        total: countRow?.value ?? rows.length,
      };
    },

    async createTransaction(input: TransactionInput): Promise<LedgerTransaction> {
      const now = new Date();
      const [row] = await db
        .insert(ledgerTxn)
        .values({
          accountId: input.account_id,
          categoryId: input.category_id,
          kind: input.kind,
          amount: round2(input.amount),
          occurredAt: input.occurred_at,
          merchant: input.merchant,
          note: input.note,
          tags: JSON.stringify(input.tags),
          externalId: input.external_id || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: ledgerTxn.id });
      if (!row) throw errors.internal("保存流水失败");
      const { items } = await this.transactions({ limit: 1, offset: 0, q: undefined });
      const created = items.find((item) => item.id === row.id);
      return (
        created ?? {
          id: row.id,
          account_id: input.account_id,
          account_name: "",
          category_id: input.category_id,
          category_name: "",
          kind: input.kind,
          amount: round2(input.amount),
          occurred_at: input.occurred_at,
          merchant: input.merchant,
          note: input.note,
          tags: input.tags,
          external_id: input.external_id ?? null,
        }
      );
    },

    async removeTransaction(id: number): Promise<void> {
      await db.delete(ledgerTxn).where(eq(ledgerTxn.id, id));
    },

    async importTransactions(
      rows: TransactionInput[],
    ): Promise<{ inserted: number; skipped: number }> {
      if (rows.length === 0) return { inserted: 0, skipped: 0 };
      const now = new Date();
      let inserted = 0;
      await db.transaction(async (tx) => {
        for (const input of rows) {
          const result = await tx
            .insert(ledgerTxn)
            .values({
              accountId: input.account_id,
              categoryId: input.category_id,
              kind: input.kind,
              amount: round2(input.amount),
              occurredAt: input.occurred_at,
              merchant: input.merchant,
              note: input.note,
              tags: JSON.stringify(input.tags),
              externalId: input.external_id || null,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning({ id: ledgerTxn.id });
          if (result.length > 0) inserted += 1;
        }
      });
      return { inserted, skipped: rows.length - inserted };
    },

    async upsertBudget(input: {
      category_id: number;
      month: string;
      amount: number;
    }): Promise<void> {
      const now = new Date();
      await db
        .insert(ledgerBudget)
        .values({
          categoryId: input.category_id,
          month: input.month,
          amount: round2(input.amount),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [ledgerBudget.categoryId, ledgerBudget.month],
          set: { amount: round2(input.amount), updatedAt: now },
        });
    },

    async summary(month: string): Promise<LedgerSummary> {
      const { start, end } = monthRange(month);

      const rows = await db
        .select({
          kind: ledgerTxn.kind,
          amount: ledgerTxn.amount,
          occurredAt: ledgerTxn.occurredAt,
          categoryId: ledgerTxn.categoryId,
          categoryName: ledgerCategory.name,
        })
        .from(ledgerTxn)
        .leftJoin(ledgerCategory, eq(ledgerCategory.id, ledgerTxn.categoryId))
        .where(and(gte(ledgerTxn.occurredAt, start), lt(ledgerTxn.occurredAt, end)));

      let income = 0;
      let expense = 0;
      const byCategory = new Map<string, { category_id: number | null; category_name: string; kind: "income" | "expense"; total: number }>();
      const daily = new Map<string, { income: number; expense: number }>();

      for (const row of rows) {
        const kind = row.kind as "income" | "expense";
        if (kind === "income") income += row.amount;
        else expense += row.amount;

        const key = `${kind}:${row.categoryId ?? 0}`;
        const current = byCategory.get(key) ?? {
          category_id: row.categoryId,
          category_name: row.categoryName ?? "未分类",
          kind,
          total: 0,
        };
        current.total += row.amount;
        byCategory.set(key, current);

        const date = new Date(row.occurredAt);
        const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        const bucket = daily.get(day) ?? { income: 0, expense: 0 };
        bucket[kind] += row.amount;
        daily.set(day, bucket);
      }

      const budgetRows = await db
        .select({
          categoryId: ledgerBudget.categoryId,
          categoryName: ledgerCategory.name,
          amount: ledgerBudget.amount,
        })
        .from(ledgerBudget)
        .innerJoin(ledgerCategory, eq(ledgerCategory.id, ledgerBudget.categoryId))
        .where(eq(ledgerBudget.month, month));

      const budgets = budgetRows.map((row) => {
        const spent = [...byCategory.values()]
          .filter((item) => item.kind === "expense" && item.category_id === row.categoryId)
          .reduce((sum, item) => sum + item.total, 0);
        return {
          category_id: row.categoryId,
          category_name: row.categoryName,
          amount: row.amount,
          spent: round2(spent),
        };
      });

      return {
        month,
        income: round2(income),
        expense: round2(expense),
        balance: round2(income - expense),
        by_category: [...byCategory.values()]
          .map((item) => ({ ...item, total: round2(item.total) }))
          .sort((a, b) => b.total - a.total),
        daily: [...daily.entries()]
          .map(([date, value]) => ({
            date,
            income: round2(value.income),
            expense: round2(value.expense),
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        budgets,
        accounts: await this.accounts(),
      };
    },
  };
}

export type LedgerService = ReturnType<typeof createLedgerService>;
