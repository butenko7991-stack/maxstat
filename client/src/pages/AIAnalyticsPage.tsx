import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles, TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
  Brain, FileText, Users, BarChart2,
} from "lucide-react";
import { Streamdown } from "streamdown";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₽`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K ₽`;
  return `${n.toFixed(0)} ₽`;
}

function roiColor(roi: number): string {
  if (roi === Infinity || roi > 100) return "text-emerald-400";
  if (roi > 50) return "text-green-400";
  if (roi > 0) return "text-yellow-400";
  if (roi === 0) return "text-muted-foreground";
  return "text-red-400";
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ─── Subscribers Tab ──────────────────────────────────────────────────────────
function SubscribersTab() {
  const { data: channels } = trpc.channels.list.useQuery();
  const [selectedChannelId, setSelectedChannelId] = useState<string>("all");

  const channelIds = useMemo(() => {
    if (!channels) return [];
    if (selectedChannelId === "all") return channels.map((c) => c.id);
    const id = Number(selectedChannelId);
    return isNaN(id) ? [] : [id];
  }, [channels, selectedChannelId]);

  const { data: cpfData, isLoading: cpfLoading, isError: cpfError } = trpc.snapshots.cpfAnalytics.useQuery(
    { channelIds },
    { enabled: channelIds.length > 0, refetchOnWindowFocus: false }
  );

  const { data: effData, isLoading: effLoading, isError: effError } = trpc.snapshots.sourceEfficiency.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  // Aggregate CPF chart data: group by weekLabel, sum growth and cost, compute cpf
  const cpfChartData = useMemo(() => {
    if (!cpfData || cpfData.length === 0) return [];
    const map = new Map<string, { weekStart: string; growth: number; cost: number }>();
    for (const row of cpfData) {
      const existing = map.get(row.weekLabel);
      if (existing) {
        existing.growth += row.growth;
        existing.cost += row.purchaseCost;
      } else {
        map.set(row.weekLabel, { weekStart: row.weekStart, growth: row.growth, cost: row.purchaseCost });
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[1].weekStart.localeCompare(b[1].weekStart))
      .map(([weekLabel, d]) => ({
        week: weekLabel.replace(/^\d{4}-/, ""), // e.g. "W20"
        growth: d.growth,
        cost: Math.round(d.cost),
        cpf: d.growth > 0 ? Math.round((d.cost / d.growth) * 100) / 100 : null,
      }));
  }, [cpfData]);

  // Subscriber growth chart: per-channel snapshots
  const { data: allSnapshots } = trpc.snapshots.list.useQuery(
    { channelId: selectedChannelId !== "all" ? Number(selectedChannelId) : undefined },
    { enabled: true, refetchOnWindowFocus: false }
  );

  const growthChartData = useMemo(() => {
    if (!allSnapshots || allSnapshots.length === 0) return [];
    // Group by date, sum subscriber counts
    const map = new Map<string, number>();
    for (const snap of allSnapshots) {
      const dateStr = new Date(snap.snapshotDate).toISOString().slice(0, 10);
      map.set(dateStr, (map.get(dateStr) ?? 0) + snap.subscriberCount);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({
        date: date.slice(5), // MM-DD
        count,
      }));
  }, [allSnapshots]);

  // KPI summary
  const latestTotal = useMemo(() => {
    if (!allSnapshots || allSnapshots.length === 0) return null;
    // Get latest snapshot per channel
    const latestByChannel = new Map<number, typeof allSnapshots[0]>();
    for (const snap of allSnapshots) {
      const existing = latestByChannel.get(snap.channelId);
      if (!existing || new Date(snap.snapshotDate) > new Date(existing.snapshotDate)) {
        latestByChannel.set(snap.channelId, snap);
      }
    }
    return Array.from(latestByChannel.values()).reduce((s, v) => s + v.subscriberCount, 0);
  }, [allSnapshots]);

  const avgCpf = useMemo(() => {
    if (!cpfChartData.length) return null;
    const valid = cpfChartData.filter((d) => d.cpf !== null);
    if (!valid.length) return null;
    return valid.reduce((s, d) => s + (d.cpf ?? 0), 0) / valid.length;
  }, [cpfChartData]);

  const totalGrowth = useMemo(() => {
    if (!cpfChartData.length) return 0;
    return cpfChartData.reduce((s, d) => s + d.growth, 0);
  }, [cpfChartData]);

  const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];

  return (
    <div className="space-y-5">
      {/* Channel filter */}
      <div className="flex items-center gap-3">
        <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
          <SelectTrigger className="w-[200px] bg-input border-border">
            <SelectValue placeholder="Канал" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">Все каналы</SelectItem>
            {channels?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Аналитика роста подписчиков и стоимости привлечения</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Подписчиков сейчас</p>
          <p className="text-lg font-bold text-foreground">
            {latestTotal !== null ? formatK(latestTotal) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">по последним снимкам</p>
        </div>
        <div className="glass rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Прирост (период)</p>
          <p className={`text-lg font-bold ${totalGrowth >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totalGrowth >= 0 ? "+" : ""}{formatK(totalGrowth)}
          </p>
          <p className="text-xs text-muted-foreground">по неделям</p>
        </div>
        <div className="glass rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Ср. CPF</p>
          <p className="text-lg font-bold text-violet-400">
            {avgCpf !== null ? `${avgCpf.toFixed(2)} ₽` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">стоимость подписчика</p>
        </div>
      </div>

      {/* Subscriber growth chart */}
      {growthChartData.length > 0 ? (
        <div className="glass rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-400" />
            Динамика подписчиков
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={growthChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} />
              <YAxis tickFormatter={formatK} tick={{ fontSize: 11, fill: "#888" }} width={48} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                labelStyle={{ color: "#ccc", fontSize: 12 }}
                formatter={(v: number) => [v.toLocaleString("ru-RU"), "Подписчиков"]}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 3, fill: "#8b5cf6" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="glass rounded-xl p-8 text-center text-muted-foreground text-sm">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Нет снимков подписчиков.</p>
          <p className="text-xs mt-1">Добавьте снимки в разделе «Каналы».</p>
        </div>
      )}

      {/* CPF per week chart */}
      {cpfLoading ? (
        <div className="glass rounded-xl p-8 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : cpfError ? (
        <div className="glass rounded-xl p-6 text-center text-red-400 text-sm">
          Ошибка загрузки CPF. Попробуйте позже.
        </div>
      ) : cpfChartData.length > 0 ? (
        <div className="glass rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-cyan-400" />
            CPF по неделям (₽ / подписчик)
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cpfChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#888" }} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} width={48} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                labelStyle={{ color: "#ccc", fontSize: 12 }}
                formatter={(v: number, name: string) => {
                  if (name === "cpf") return [`${v} ₽`, "CPF"];
                  if (name === "growth") return [v.toLocaleString("ru-RU"), "Прирост"];
                  if (name === "cost") return [formatCurrency(v), "Расход"];
                  return [v, name];
                }}
              />
              <Legend formatter={(v) => v === "cpf" ? "CPF (₽)" : v === "growth" ? "Прирост" : "Расход"} />
              <Bar dataKey="cpf" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="growth" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="glass rounded-xl p-6 text-center text-muted-foreground text-sm">
          Нет данных CPF. Добавьте снимки подписчиков и записи о закупках.
        </div>
      )}

      {/* Source efficiency table */}
      <div className="glass rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          Эффективность по размеру канала-источника
        </p>
        {effLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : effError ? (
          <p className="text-xs text-red-400 text-center py-4">Ошибка загрузки данных. Попробуйте позже.</p>
        ) : !effData || effData.every((r) => r.totalPurchases === 0) ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Нет данных. Укажите «Подписчики канала-источника» при добавлении закупок.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/40">
                  <th className="text-left py-2 pr-3 font-medium">Размер канала</th>
                  <th className="text-right py-2 px-2 font-medium">Закупок</th>
                  <th className="text-right py-2 px-2 font-medium">Расход</th>
                  <th className="text-right py-2 px-2 font-medium">Пришло</th>
                  <th className="text-right py-2 pl-2 font-medium">Ср. CPF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {effData.map((row, i) => (
                  <tr key={row.sizeCategory} className="hover:bg-muted/20 transition-colors">
                    <td className="py-2 pr-3 font-medium text-foreground">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      {row.sizeCategory}
                    </td>
                    <td className="text-right py-2 px-2 text-muted-foreground">{row.totalPurchases}</td>
                    <td className="text-right py-2 px-2 text-red-400">{formatCurrency(row.totalCost)}</td>
                    <td className="text-right py-2 px-2 text-emerald-400">
                      {row.totalSubscribersGained > 0 ? `+${row.totalSubscribersGained.toLocaleString("ru-RU")}` : "—"}
                    </td>
                    <td className="text-right py-2 pl-2 font-semibold text-violet-400">
                      {row.avgCpf !== null ? `${row.avgCpf.toFixed(2)} ₽` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AIAnalyticsPage() {
  const { data: months } = trpc.summary.months.useQuery();
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("profitability");

  const monthParam = selectedMonth === "all" ? undefined : selectedMonth;

  // Profitability data (always loaded)
  const { data: profitData, isLoading: profitLoading } = trpc.ai.profitability.useQuery(
    { month: monthParam },
    { refetchOnWindowFocus: false }
  );

  // AI Analysis mutation
  const analyzeMutation = trpc.ai.analyzeChannels.useMutation();

  // AI Digest mutation
  const digestMutation = trpc.ai.generateDigest.useMutation();

  const sortedMonths = useMemo(() => {
    if (!months) return [];
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [months]);

  const formatMonth = (m: string) => {
    const [y, mo] = m.split("-");
    const names = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
    return `${names[parseInt(mo) - 1]} ${y}`;
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">AI Аналитика</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Анализ экономики и рентабельности каналов</p>
          </div>
        </div>

        {activeTab !== "subscribers" && (
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[160px] bg-input border-border">
              <SelectValue placeholder="Период" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">Всё время</SelectItem>
              {sortedMonths.map((m) => (
                <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Summary cards — only on profitability tab */}
      {activeTab !== "subscribers" && profitData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="glass rounded-xl p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Доход</p>
            <p className="text-lg font-bold text-emerald-400">{formatCurrency(profitData.totalSales)}</p>
            <p className="text-xs text-muted-foreground">{profitData.salesCount} продаж</p>
          </div>
          <div className="glass rounded-xl p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Расход</p>
            <p className="text-lg font-bold text-red-400">{formatCurrency(profitData.totalPurchases)}</p>
            <p className="text-xs text-muted-foreground">{profitData.purchasesCount} закупок</p>
          </div>
          <div className="glass rounded-xl p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Прибыль</p>
            <p className={`text-lg font-bold ${profitData.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatCurrency(profitData.totalProfit)}
            </p>
          </div>
          <div className="glass rounded-xl p-4 space-y-1">
            <p className="text-xs text-muted-foreground">ROI</p>
            <p className={`text-lg font-bold ${roiColor(profitData.overallROI)}`}>
              {profitData.overallROI.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">{profitData.channelCount} каналов</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="profitability" className="gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            Рентабельность
          </TabsTrigger>
          <TabsTrigger value="subscribers" className="gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Подписчики
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-1.5">
            <Brain className="w-3.5 h-3.5" />
            AI Анализ
          </TabsTrigger>
          <TabsTrigger value="digest" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Дайджест
          </TabsTrigger>
        </TabsList>

        {/* Profitability Tab */}
        <TabsContent value="profitability" className="mt-4 space-y-3">
          {profitLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : profitData && profitData.channels.length > 0 ? (
            <div className="space-y-3">
              {profitData.channels.map((ch) => (
                <div key={ch.channelId} className="glass rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {ch.profit > 0 ? (
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                      ) : ch.profit < 0 ? (
                        <TrendingDown className="w-4 h-4 text-red-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                      )}
                      <span className="font-medium text-foreground">{ch.channelName}</span>
                    </div>
                    <span className={`text-sm font-bold ${roiColor(ch.roi)}`}>
                      ROI: {ch.roi === Infinity ? "∞" : `${ch.roi.toFixed(0)}%`}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-emerald-500/10 p-2">
                      <p className="text-xs text-muted-foreground">Доход</p>
                      <p className="text-sm font-semibold text-emerald-400">{formatCurrency(ch.salesTotal)}</p>
                      <p className="text-[10px] text-muted-foreground">{ch.salesCount} продаж</p>
                    </div>
                    <div className="rounded-lg bg-red-500/10 p-2">
                      <p className="text-xs text-muted-foreground">Расход</p>
                      <p className="text-sm font-semibold text-red-400">{formatCurrency(ch.purchasesTotal)}</p>
                      <p className="text-[10px] text-muted-foreground">{ch.purchasesCount} закупок</p>
                    </div>
                    <div className={`rounded-lg p-2 ${ch.profit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                      <p className="text-xs text-muted-foreground">Прибыль</p>
                      <p className={`text-sm font-semibold ${ch.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {formatCurrency(ch.profit)}
                      </p>
                    </div>
                  </div>

                  {/* Unpaid warnings */}
                  {(ch.unpaidSalesTotal > 0 || ch.unpaidPurchasesTotal > 0) && (
                    <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 rounded-lg px-3 py-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>
                        {ch.unpaidSalesTotal > 0 && `Неоплач. продажи: ${formatCurrency(ch.unpaidSalesTotal)}`}
                        {ch.unpaidSalesTotal > 0 && ch.unpaidPurchasesTotal > 0 && " · "}
                        {ch.unpaidPurchasesTotal > 0 && `Неоплач. закупки: ${formatCurrency(ch.unpaidPurchasesTotal)}`}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>Нет данных за выбранный период</p>
              <p className="text-sm mt-1">Добавьте записи о продажах и закупках</p>
            </div>
          )}
        </TabsContent>

        {/* Subscribers Tab */}
        <TabsContent value="subscribers" className="mt-4">
          <SubscribersTab />
        </TabsContent>

        {/* AI Analysis Tab */}
        <TabsContent value="analysis" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => analyzeMutation.mutate({ month: monthParam })}
              disabled={analyzeMutation.isPending}
              className="gap-2"
            >
              {analyzeMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Brain className="w-4 h-4" />
              )}
              {analyzeMutation.isPending ? "Анализирую..." : "Запустить AI анализ"}
            </Button>
            <span className="text-xs text-muted-foreground">
              AI проанализирует рентабельность каналов и даст рекомендации
            </span>
          </div>

          {analyzeMutation.data?.analysis && (
            <div className="glass rounded-xl p-5 prose prose-invert prose-sm max-w-none">
              <Streamdown>{analyzeMutation.data.analysis}</Streamdown>
            </div>
          )}

          {analyzeMutation.isError && (
            <div className="glass rounded-xl p-4 border border-red-500/30 text-red-400 text-sm">
              Ошибка анализа: {analyzeMutation.error.message}
            </div>
          )}
        </TabsContent>

        {/* Digest Tab */}
        <TabsContent value="digest" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => digestMutation.mutate({ month: monthParam })}
              disabled={digestMutation.isPending}
              className="gap-2"
            >
              {digestMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              {digestMutation.isPending ? "Генерирую..." : "Сгенерировать дайджест"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Краткая сводка по бизнесу за {selectedMonth === "all" ? "всё время" : formatMonth(selectedMonth)}
            </span>
          </div>

          {digestMutation.data?.digest && (
            <div className="glass rounded-xl p-5 prose prose-invert prose-sm max-w-none">
              <Streamdown>{digestMutation.data.digest}</Streamdown>
            </div>
          )}

          {digestMutation.isError && (
            <div className="glass rounded-xl p-4 border border-red-500/30 text-red-400 text-sm">
              Ошибка генерации: {digestMutation.error.message}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
