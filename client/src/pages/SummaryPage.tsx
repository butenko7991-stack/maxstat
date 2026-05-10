import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMonthLabel, formatCost } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ─── Short month label ────────────────────────────────────────────────────────
function shortMonth(month: string) {
  const map: Record<string, string> = {
    "01": "Янв", "02": "Фев", "03": "Мар", "04": "Апр",
    "05": "Май", "06": "Июн", "07": "Июл", "08": "Авг",
    "09": "Сен", "10": "Окт", "11": "Ноя", "12": "Дек",
  };
  const mm = month.split("-")[1] ?? "";
  return map[mm] ?? month;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl text-sm space-y-1.5">
      <p className="font-semibold text-foreground">{formatMonthLabel(label ?? "")}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-foreground">{formatCost(p.value)} ₽</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SummaryPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("all");

  const { data: months } = trpc.summary.months.useQuery();
  const { data: channels } = trpc.channels.list.useQuery();
  const { data: summaries, isLoading } = trpc.summary.financial.useQuery({
    month: selectedMonth !== "all" ? selectedMonth : undefined,
  });
  const { data: unpaidDebts } = trpc.summary.unpaidDebts.useQuery({
    channelId: selectedChannelId !== "all" ? Number(selectedChannelId) : undefined,
    month: selectedMonth !== "all" ? selectedMonth : undefined,
  });

  const { data: chartData, isLoading: chartLoading } = trpc.summary.monthlyStats.useQuery({
    channelId: selectedChannelId !== "all" ? Number(selectedChannelId) : undefined,
  });

  // Filter summaries by channel
  const filteredSummaries = useMemo(() => {
    if (selectedChannelId === "all") return summaries ?? [];
    return (summaries ?? []).filter((s) => String(s.channelId) === selectedChannelId);
  }, [summaries, selectedChannelId]);

  const totals = useMemo(
    () =>
      filteredSummaries.reduce(
        (acc, s) => ({
          spend: acc.spend + s.totalPurchaseCost,
          income: acc.income + s.totalSaleRevenue,
          profit: acc.profit + s.profit,
        }),
        { spend: 0, income: 0, profit: 0 }
      ),
    [filteredSummaries]
  );

  const hasChartData = (chartData ?? []).length > 0;

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Итоги</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Финансовая сводка по каналам</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
            <SelectTrigger className="w-40 bg-card border-border text-sm h-9">
              <SelectValue placeholder="Все каналы" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">Все каналы</SelectItem>
              {(channels ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-40 bg-card border-border text-sm h-9">
              <SelectValue placeholder="Все месяцы" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">Все месяцы</SelectItem>
              {(months ?? []).map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
          <div className="h-56 rounded-xl bg-card animate-pulse" />
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Overall summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Закуп" value={totals.spend} icon={TrendingDown} variant="loss" />
            <MetricCard label="Продажа" value={totals.income} icon={TrendingUp} variant="profit" />
            <MetricCard
              label="Прибыль"
              value={totals.profit}
              icon={Wallet}
              variant={totals.profit >= 0 ? "profit" : "loss"}
              signed
            />
          </div>

          {/* Unpaid debts widget */}
          {unpaidDebts && (unpaidDebts.unpaidPurchases > 0 || unpaidDebts.unpaidSales > 0) && (
            <div className="glass rounded-xl p-4 space-y-3 border border-amber-500/20">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-foreground">Неоплаченные долги</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {unpaidDebts.unpaidPurchases > 0 && (
                  <div className="bg-loss/10 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Закуп не оплачен</p>
                    <p className="text-sm font-bold text-loss">{formatCost(unpaidDebts.unpaidPurchases)} ₽</p>
                    <p className="text-xs text-muted-foreground">{unpaidDebts.unpaidPurchaseCount} записей</p>
                  </div>
                )}
                {unpaidDebts.unpaidSales > 0 && (
                  <div className="bg-amber-500/10 rounded-lg p-3 space-y-1">
                    <p className="text-xs text-muted-foreground">Продажа не оплачена</p>
                    <p className="text-sm font-bold text-amber-400">{formatCost(unpaidDebts.unpaidSales)} ₽</p>
                    <p className="text-xs text-muted-foreground">{unpaidDebts.unpaidSaleCount} записей</p>
                  </div>
                )}
              </div>
              {unpaidDebts.byChannel && unpaidDebts.byChannel.length > 1 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">По каналам</p>
                  {unpaidDebts.byChannel.map((ch) => (
                    <div key={ch.channelId} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[140px]">{ch.channelName}</span>
                      <div className="flex items-center gap-3">
                        {ch.unpaidPurchases > 0 && (
                          <span className="text-loss">−{formatCost(ch.unpaidPurchases)} ₽</span>
                        )}
                        {ch.unpaidSales > 0 && (
                          <span className="text-amber-400">+{formatCost(ch.unpaidSales)} ₽</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Charts ─────────────────────────────────────────────────────── */}
          {chartLoading ? (
            <div className="space-y-4">
              <div className="h-56 rounded-xl bg-card animate-pulse" />
              <div className="h-44 rounded-xl bg-card animate-pulse" />
            </div>
          ) : hasChartData ? (
            <div className="space-y-4">
              {/* Bar chart: purchases vs sales per month */}
              <div className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Закуп и продажа по месяцам</h2>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    barCategoryGap="28%"
                    barGap={4}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={shortMonth}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}к` : String(v)
                      }
                      width={38}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                    <Legend
                      formatter={(value) => (
                        <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}>
                          {value}
                        </span>
                      )}
                    />
                    <Bar dataKey="purchases" name="Закуп" fill="oklch(0.65 0.22 25)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sales" name="Продажа" fill="oklch(0.62 0.18 155)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Line chart: profit per month */}
              <div className="glass rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">Динамика прибыли по месяцам</h2>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={shortMonth}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}к` : String(v)
                      }
                      width={38}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      name="Прибыль"
                      stroke="oklch(0.72 0.19 290)"
                      strokeWidth={2.5}
                      dot={{ fill: "oklch(0.72 0.19 290)", r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="glass rounded-xl p-8 flex flex-col items-center gap-3 text-center">
              <BarChart3 className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Добавьте записи закупа или продажи, чтобы увидеть графики динамики
              </p>
            </div>
          )}

          {/* Per-channel breakdown */}
          {filteredSummaries.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                По каналам
              </h2>
              {filteredSummaries.map((s) => (
                <ChannelCard key={s.channelId} summary={s} />
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl border border-dashed border-border p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                <BarChart3 className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                Нет данных. Добавьте каналы и записи закупа/продажи.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────
interface MetricCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant: "profit" | "loss" | "neutral";
  signed?: boolean;
}

function MetricCard({ label, value, icon: Icon, variant, signed }: MetricCardProps) {
  const colorClass =
    variant === "profit" ? "text-profit" : variant === "loss" ? "text-loss" : "text-foreground";
  const bgClass =
    variant === "profit"
      ? "bg-[oklch(0.62_0.18_155/0.1)]"
      : variant === "loss"
        ? "bg-[oklch(0.55_0.22_25/0.1)]"
        : "bg-muted";

  return (
    <div className="glass rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", bgClass)}>
          <Icon className={cn("w-3.5 h-3.5", colorClass)} />
        </div>
      </div>
      <p className={cn("text-base font-bold leading-tight", colorClass)}>
        {signed && value > 0 ? "+" : ""}
        {formatCost(Math.abs(value))} ₽
      </p>
    </div>
  );
}

// ─── ChannelCard ──────────────────────────────────────────────────────────────
interface ChannelCardProps {
  summary: {
    channelId: number;
    channelName: string;
    totalPurchaseCost: number;
    totalSaleRevenue: number;
    profit: number;
    purchaseCount: number;
    saleCount: number;
  };
}

function ChannelCard({ summary: s }: ChannelCardProps) {
  const isProfit = s.profit >= 0;
  const roi =
    s.totalPurchaseCost > 0
      ? ((s.totalSaleRevenue / s.totalPurchaseCost) * 100).toFixed(0)
      : null;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-sm font-semibold text-primary">
              {s.channelName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-foreground text-sm">{s.channelName}</p>
            <p className="text-xs text-muted-foreground">
              {s.purchaseCount} закупов · {s.saleCount} продаж
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={cn("text-sm font-bold", isProfit ? "text-profit" : "text-loss")}>
            {isProfit ? "+" : ""}
            {formatCost(s.profit)} ₽
          </p>
          {roi && <p className="text-xs text-muted-foreground">ROI {roi}%</p>}
        </div>
      </div>

      {/* Progress bars */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 w-20 shrink-0">
            <ArrowDownRight className="w-3 h-3 text-loss shrink-0" />
            <span className="text-xs text-muted-foreground">Закуп</span>
          </div>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${s.totalPurchaseCost > 0 ? 100 : 0}%`,
                background: "oklch(0.65 0.22 25)",
              }}
            />
          </div>
          <span className="text-xs font-medium text-loss w-24 text-right shrink-0">
            {formatCost(s.totalPurchaseCost)} ₽
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 w-20 shrink-0">
            <ArrowUpRight className="w-3 h-3 text-profit shrink-0" />
            <span className="text-xs text-muted-foreground">Продажа</span>
          </div>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${
                  s.totalPurchaseCost > 0
                    ? Math.min(100, (s.totalSaleRevenue / s.totalPurchaseCost) * 100)
                    : s.totalSaleRevenue > 0
                      ? 100
                      : 0
                }%`,
                background: "oklch(0.62 0.18 155)",
              }}
            />
          </div>
          <span className="text-xs font-medium text-profit w-24 text-right shrink-0">
            {formatCost(s.totalSaleRevenue)} ₽
          </span>
        </div>
      </div>
    </div>
  );
}
