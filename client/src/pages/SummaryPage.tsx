import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { BarChart3, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMonthLabel, formatCost } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function SummaryPage() {
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const { data: months } = trpc.summary.months.useQuery();
  const { data: summaries, isLoading } = trpc.summary.financial.useQuery({
    month: selectedMonth !== "all" ? selectedMonth : undefined,
  });

  const totals = (summaries ?? []).reduce(
    (acc, s) => ({
      spend: acc.spend + s.totalPurchaseCost,
      income: acc.income + s.totalSaleRevenue,
      profit: acc.profit + s.profit,
    }),
    { spend: 0, income: 0, profit: 0 }
  );

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Итоги</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Финансовая сводка по каналам</p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44 bg-card border-border text-sm h-9">
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

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-card animate-pulse" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Overall summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              label="Закуп"
              value={totals.spend}
              icon={TrendingDown}
              variant="loss"
            />
            <MetricCard
              label="Продажа"
              value={totals.income}
              icon={TrendingUp}
              variant="profit"
            />
            <MetricCard
              label="Прибыль"
              value={totals.profit}
              icon={Wallet}
              variant={totals.profit >= 0 ? "profit" : "loss"}
            />
          </div>

          {/* Per-channel breakdown */}
          {!(summaries ?? []).length ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                <BarChart3 className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">
                Нет данных. Добавьте каналы и записи закупа/продажи.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                По каналам
              </h2>
              {(summaries ?? []).map((s) => (
                <ChannelCard key={s.channelId} summary={s} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant: "profit" | "loss" | "neutral";
}

function MetricCard({ label, value, icon: Icon, variant }: MetricCardProps) {
  const colorClass =
    variant === "profit"
      ? "text-profit"
      : variant === "loss"
        ? "text-loss"
        : "text-foreground";

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
        {formatCost(Math.abs(value))} ₽
      </p>
    </div>
  );
}

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
          {roi && (
            <p className="text-xs text-muted-foreground">ROI {roi}%</p>
          )}
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
                width: `${Math.min(100, s.totalPurchaseCost > 0 ? 100 : 0)}%`,
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
