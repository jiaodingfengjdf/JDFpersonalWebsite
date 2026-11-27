import { and, asc, desc, eq, gte, like, lt, or, sql } from "drizzle-orm";
import { runTransaction } from "@/server/db/tx";
import type { AppDatabase } from "@/server/db/types";
import { ledgerAccount, ledgerBudget, ledgerCategory, ledgerTxn } from "@/server/db/schema";
import { errors } from "@/server/http/errors";
import { ledgerDate, parseLedgerDate } from "@/lib/ledger-date";
import type {
  AccountInput,
  LedgerAccount,
  LedgerCategory,
  LedgerSummary,
  LedgerTransaction,
  TransactionInput,
} from "./contracts";

const round2 = (value: number) => Math.round(value * 100) / 100;

/** [start, end) 按 Asia/Shanghai 划分自然月。 */
export function monthRange(month: string): { start: number; end: number } {
  const [year, mon] = month.split("-").map(Number);
  return {
    start: parseLedgerDate(`${month}-01`),
    end: Date.UTC(year, mon, 1) - 8 * 60 * 60 * 1000,
  };
}

export function currentMonth(): string {
  return ledgerDate().slice(0, 7);
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

interface TransactionRow {
  id: number;
  accountId: number;
  accountName: string;
  categoryId: number | null;
  categoryName: string | null;
  kind: string;
  amount: number;
  occurredAt: number;
  merchant: string;
  note: string;
  tags: string | null;
  externalId: string | null;
}

function toTransaction(row: TransactionRow): LedgerTransaction {
  return {
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
  };
}

export function createLedgerService(db: AppDatabase) {
  /** 按主键回查流水，带账户名与分类名；不依赖发生时间排序。 */
  /** 创建与编辑共用：账户必须存在，分类必须与收支类型一致，否则返回 422 而不是外键 500。 */
  async function assertTransactionRefs(input: TransactionInput): Promise<void> {
    const [account] = await db
      .select({ id: ledgerAccount.id })
      .from(ledgerAccount)
      .where(eq(ledgerAccount.id, input.account_id))
      .limit(1);
    if (!account) throw errors.validation("账户不存在");
    if (input.category_id !== null) {
      const [category] = await db
        .select({ kind: ledgerCategory.kind })
        .from(ledgerCategory)
        .where(eq(ledgerCategory.id, input.category_id))
        .limit(1);
      if (!category || category.kind !== input.kind) {
        throw errors.validation("分类不存在或与收支类型不匹配");
      }
    }
  }

  async function findTransaction(id: number): Promise<LedgerTransaction | null> {
    const [row] = await db
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
      .where(eq(ledgerTxn.id, id))
      .limit(1);
    return row ? toTransaction(row) : null;
  }

  return {
    async accounts(options: { includeArchived?: boolean } = {}): Promise<LedgerAccount[]> {
      const rows = await db
        .select()
        .from(ledgerAccount)
        .where(options.includeArchived ? undefined : eq(ledgerAccount.archived, 0))
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
        currency: row.currency as LedgerAccount["currency"],
        balance: round2(row.initialBalance + (delta.get(row.id) ?? 0)),
        archived: row.archived,
        sort: row.sort,
      }));
    },

    async createAccount(input: AccountInput): Promise<LedgerAccount> {
      const now = new Date();
      const [row] = await db
        .insert(ledgerAccount)
        .values({
          name: input.name,
          kind: input.kind,
          initialBalance: input.initial_balance,
          currency: input.currency,
          sort: input.sort,
          archived: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: ledgerAccount.id });
      if (!row) throw errors.internal("创建账户失败");
      const all = await this.accounts({ includeArchived: true });
      const created = all.find((item) => item.id === row.id);
      if (!created) throw errors.internal("创建账户失败");
      return created;
    },

    async updateAccount(id: number, input: AccountInput): Promise<LedgerAccount> {
      const existing = await db
        .select({ id: ledgerAccount.id })
        .from(ledgerAccount)
        .where(eq(ledgerAccount.id, id))
        .limit(1);
      if (existing.length === 0) throw errors.notFound("账户不存在");
      await db
        .update(ledgerAccount)
        .set({
          name: input.name,
          kind: input.kind,
          initialBalance: input.initial_balance,
          currency: input.currency,
          sort: input.sort,
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccount.id, id));
      const updated = (await this.accounts({ includeArchived: true })).find(
        (item) => item.id === id,
      );
      if (!updated) throw errors.internal("更新账户失败");
      return updated;
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
        items: rows.map(toTransaction),
        total: countRow?.value ?? rows.length,
      };
    },

    async createTransaction(input: TransactionInput): Promise<LedgerTransaction> {
      await assertTransactionRefs(input);
      const now = new Date();
      let row: { id: number } | undefined;
      try {
        [row] = await db
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
      } catch (err) {
        // external_id 有唯一索引：同一张账单重复入账时报 409，而不是 500。
        const code =
          typeof err === "object" && err !== null && "code" in err
            ? String((err as { code?: unknown }).code ?? "")
            : "";
        if (code.startsWith("SQLITE_CONSTRAINT")) {
          throw errors.conflict("该编号的流水已存在，可能是重复入账");
        }
        throw err;
      }
      if (!row) throw errors.internal("保存流水失败");
      const created = await findTransaction(row.id);
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

    async updateTransaction(id: number, input: TransactionInput): Promise<LedgerTransaction> {
      if (!(await findTransaction(id))) throw errors.notFound("流水不存在");
      await assertTransactionRefs(input);
      await db
        .update(ledgerTxn)
        .set({
          accountId: input.account_id,
          categoryId: input.category_id,
          kind: input.kind,
          amount: round2(input.amount),
          occurredAt: input.occurred_at,
          merchant: input.merchant,
          note: input.note,
          updatedAt: new Date(),
        })
        .where(eq(ledgerTxn.id, id));
      const updated = await findTransaction(id);
      if (!updated) throw errors.internal("更新流水失败");
      return updated;
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
      await runTransaction(db, async (tx) => {
        const accountRows = await tx.select({ id: ledgerAccount.id }).from(ledgerAccount);
        const categoryRows = await tx.select({ id: ledgerCategory.id, kind: ledgerCategory.kind }).from(ledgerCategory);
        const accounts = new Set(accountRows.map(({ id }) => id));
        const categories = new Map(categoryRows.map(({ id, kind }) => [id, kind]));
        for (const input of rows) {
          if (!accounts.has(input.account_id)) throw errors.validation("导入账户不存在");
          if (input.category_id !== null && categories.get(input.category_id) !== input.kind) {
            throw errors.validation("导入分类不存在或与收支类型不匹配");
          }
          const insertedRows = await tx
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
            .onConflictDoNothing({ target: ledgerTxn.externalId })
            .returning({ id: ledgerTxn.id });
          inserted += insertedRows.length;
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

        const day = ledgerDate(row.occurredAt);
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
