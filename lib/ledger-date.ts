const shanghaiDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function ledgerDate(value: number | Date = new Date()): string {
  return shanghaiDate.format(value);
}

export function parseLedgerDate(value: string): number {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00+08:00`);
  return Number.isFinite(time) && ledgerDate(time) === value ? time : NaN;
}
