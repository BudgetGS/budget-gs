export const brl = (n: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(n ?? 0),
  );

export const pct = (num: number, den: number) => {
  if (!den || den === 0) return null;
  return num / den;
};

export const fmtPct = (v: number | null) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
};

export const monthLabel = (isoDate: string) => {
  const [y, m] = isoDate.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const monthFirstDay = (key: string) => `${key}-01`;

export const addMonths = (key: string, delta: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
};

export const currentMonthKey = () => monthKey(new Date());

export const saldoColor = (pctVal: number | null) => {
  if (pctVal === null) return "text-muted-foreground";
  if (pctVal >= 1) return "text-destructive";
  if (pctVal >= 0.85) return "text-amber-600";
  return "text-[color:var(--color-secondary-foreground)]";
};

export const saldoBadgeBg = (pctVal: number | null) => {
  if (pctVal === null) return "bg-muted";
  if (pctVal >= 1) return "bg-destructive/15 text-destructive";
  if (pctVal >= 0.85) return "bg-amber-100 text-amber-700";
  return "bg-[color:var(--secondary)]/25 text-[color:var(--secondary-foreground)]";
};