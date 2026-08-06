import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles, TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
  Brain, FileText, Users, BarChart2, Calendar, ArrowUp, ArrowDown, Minus, Globe,
} from "lucide-react";
import { Streamdown } from "streamdown";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
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
function SubscribersTab({ month }: { month?: string }) {
  const { data: channels } = trpc.channels.list.useQuery();
  const [selectedChannelId, setSelectedChannelId] = useState<string>("all");

  const visibleChannels = useMemo(() => channels?.filter((c) => c.isVisible !== false) ?? [], [channels]);
  const channelIds = useMemo(() => {
    if (!visibleChannels.length) return [];
    if (selectedChannelId === "all") return visibleChannels.map((c) => c.id);
    const id = Number(selectedChannelId);
    return isNaN(id) ? [] : [id];
  }, [visibleChannels, selectedChannelId]);

  const { data: cpfData, isLoading: cpfLoading, isError: cpfError } = trpc.snapshots.cpfAnalytics.useQuery(
    { channelIds, month },
    { enabled: channelIds.length > 0, refetchOnWindowFocus: false }
  );

  const { data: effData, isLoading: effLoading, isError: effError } = trpc.snapshots.sourceEfficiency.useQuery(
    { month },
    { refetchOnWindowFocus: false }
  );

  // Aggregate CPF chart data: group by weekLabel, sum growth and cost, compute cpf
  const cpfChartData = useMemo(() => {
    if (!cpfData || cpfData.length === 0) return [];
    const map = new Map<string, { weekStart: string; growth: number; cost: number; directSubs: number }>();
    for (const row of cpfData) {
      const existing = map.get(row.weekLabel);
      if (existing) {
        existing.growth += row.growth;
        existing.cost += row.purchaseCost;
        existing.directSubs += (row.directSubscribersGained ?? 0);
      } else {
        map.set(row.weekLabel, {
          weekStart: row.weekStart,
          growth: row.growth,
          cost: row.purchaseCost,
          directSubs: row.directSubscribersGained ?? 0,
        });
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[1].weekStart.localeCompare(b[1].weekStart))
      .map(([weekLabel, d]) => {
        // Prefer direct subscribersGained (from purchase records) over snapshot diff
        const effectiveSubs = d.directSubs > 0 ? d.directSubs : d.growth;
        return {
          week: weekLabel.replace(/^\d{4}-/, ""), // e.g. "W20"
          growth: d.growth,
          directSubs: d.directSubs,
          cost: Math.round(d.cost),
          // CPF uses direct data when available (higher confidence)
          cpf: effectiveSubs > 0 ? Math.round((d.cost / effectiveSubs) * 100) / 100 : null,
          cpfSnapshot: d.growth > 0 ? Math.round((d.cost / d.growth) * 100) / 100 : null,
        };
      });
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

  // Weighted CPF: prefer direct subscribersGained data, fallback to snapshot growth
  const avgCpf = useMemo(() => {
    if (!cpfChartData.length) return null;
    const totalCost = cpfChartData.reduce((s, d) => s + d.cost, 0);
    const totalDirectSubs = cpfChartData.reduce((s, d) => s + d.directSubs, 0);
    const totalGrowth = cpfChartData.reduce((s, d) => s + d.growth, 0);
    // Use direct data if available (higher confidence), else snapshot diff
    const effectiveSubs = totalDirectSubs > 0 ? totalDirectSubs : totalGrowth;
    return effectiveSubs > 0 ? Math.round((totalCost / effectiveSubs) * 100) / 100 : null;
  }, [cpfChartData]);

  const totalGrowth = useMemo(() => {
    if (!cpfChartData.length) return 0;
    return cpfChartData.reduce((s, d) => s + d.growth, 0);
  }, [cpfChartData]);

  // ER24 and views24h from latest snapshots
  const avgEr24 = useMemo(() => {
    if (!allSnapshots || allSnapshots.length === 0) return null;
    const latestByChannel = new Map<number, typeof allSnapshots[0]>();
    for (const snap of allSnapshots) {
      const ex = latestByChannel.get(snap.channelId);
      if (!ex || new Date(snap.snapshotDate) > new Date(ex.snapshotDate)) {
        latestByChannel.set(snap.channelId, snap);
      }
    }
    const erValues = Array.from(latestByChannel.values())
      .filter((s) => s.er24 != null)
      .map((s) => parseFloat(String(s.er24)));
    return erValues.length > 0 ? erValues.reduce((a, b) => a + b, 0) / erValues.length : null;
  }, [allSnapshots]);

  const totalViews24h = useMemo(() => {
    if (!allSnapshots || allSnapshots.length === 0) return null;
    const latestByChannel = new Map<number, typeof allSnapshots[0]>();
    for (const snap of allSnapshots) {
      const ex = latestByChannel.get(snap.channelId);
      if (!ex || new Date(snap.snapshotDate) > new Date(ex.snapshotDate)) {
        latestByChannel.set(snap.channelId, snap);
      }
    }
    const vals = Array.from(latestByChannel.values()).filter((s) => s.views24h != null);
    return vals.length > 0 ? vals.reduce((s, v) => s + (v.views24h ?? 0), 0) : null;
  }, [allSnapshots]);

  const totalViews48h = useMemo(() => {
    if (!allSnapshots || allSnapshots.length === 0) return null;
    const latestByChannel = new Map<number, typeof allSnapshots[0]>();
    for (const snap of allSnapshots) {
      const ex = latestByChannel.get(snap.channelId);
      if (!ex || new Date(snap.snapshotDate) > new Date(ex.snapshotDate)) {
        latestByChannel.set(snap.channelId, snap);
      }
    }
    const vals = Array.from(latestByChannel.values()).filter((s) => s.views48h != null);
    return vals.length > 0 ? vals.reduce((s, v) => s + (v.views48h ?? 0), 0) : null;
  }, [allSnapshots]);

  const totalViews72h = useMemo(() => {
    if (!allSnapshots || allSnapshots.length === 0) return null;
    const latestByChannel = new Map<number, typeof allSnapshots[0]>();
    for (const snap of allSnapshots) {
      const ex = latestByChannel.get(snap.channelId);
      if (!ex || new Date(snap.snapshotDate) > new Date(ex.snapshotDate)) {
        latestByChannel.set(snap.channelId, snap);
      }
    }
    const vals = Array.from(latestByChannel.values()).filter((s) => s.views72h != null);
    return vals.length > 0 ? vals.reduce((s, v) => s + (v.views72h ?? 0), 0) : null;
  }, [allSnapshots]);

  // ER24 trend data for chart
  const er24ChartData = useMemo(() => {
    if (!allSnapshots || allSnapshots.length === 0) return [];
    const map = new Map<string, { total: number; count: number }>();
    for (const snap of allSnapshots) {
      if (snap.er24 == null) continue;
      const dateStr = new Date(snap.snapshotDate).toISOString().slice(0, 10);
      const existing = map.get(dateStr);
      const er = parseFloat(String(snap.er24));
      if (existing) {
        existing.total += er;
        existing.count += 1;
      } else {
        map.set(dateStr, { total: er, count: 1 });
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({
        date: date.slice(5),
        er24: Math.round((d.total / d.count) * 100) / 100,
      }));
  }, [allSnapshots]);

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
            {visibleChannels.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Аналитика роста подписчиков и стоимости привлечения</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
        <div className="glass rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Ср. ER24</p>
          <p className="text-lg font-bold text-cyan-400">
            {avgEr24 !== null ? `${avgEr24.toFixed(2)}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">вовлечённость 24ч</p>
        </div>
        <div className="glass rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Охваты 24ч</p>
          <p className="text-lg font-bold text-amber-400">
            {totalViews24h !== null ? formatK(totalViews24h) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">последние снимки</p>
        </div>
        <div className="glass rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Охваты 48ч</p>
          <p className="text-lg font-bold text-amber-300">
            {totalViews48h !== null ? formatK(totalViews48h) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">последние снимки</p>
        </div>
        <div className="glass rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Охваты 72ч</p>
          <p className="text-lg font-bold text-amber-200">
            {totalViews72h !== null ? formatK(totalViews72h) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">последние снимки</p>
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

      {/* ER24 trend chart */}
      {er24ChartData.length > 0 ? (
        <div className="glass rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-400" />
            Динамика ER24 (вовлечённость)
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={er24ChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#888" }} width={44} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                labelStyle={{ color: "#ccc", fontSize: 12 }}
                formatter={(v: number) => [`${v}%`, "ER24"]}
              />
              <Line
                type="monotone"
                dataKey="er24"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 3, fill: "#8b5cf6" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground text-center">Хороший ER24: ≥ 15% | Средний: 8–15% | Низкий: &lt; 8%</p>
        </div>
      ) : null}
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
      {/* Channel grid table - Trustat style */}
      {allSnapshots && allSnapshots.length > 0 && (
        <div className="glass rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400" />
            Сетка каналов
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border/40">
                  <th className="text-left py-2 pr-3 font-medium">Канал</th>
                  <th className="text-right py-2 px-2 font-medium">Подписчики</th>
                  <th className="text-right py-2 px-2 font-medium">Прирост</th>
                  <th className="text-right py-2 px-2 font-medium">Пришло</th>
                  <th className="text-right py-2 px-2 font-medium">Расход</th>
                  <th className="text-right py-2 px-2 font-medium">CPF</th>
                  <th className="text-right py-2 px-2 font-medium">Охваты 24ч</th>
                  <th className="text-right py-2 pl-2 font-medium">ER24</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {(() => {
                  const latestByChannel = new Map<number, typeof allSnapshots[0]>();
                  for (const snap of allSnapshots) {
                    const ex = latestByChannel.get(snap.channelId);
                    if (!ex || new Date(snap.snapshotDate) > new Date(ex.snapshotDate)) {
                      latestByChannel.set(snap.channelId, snap);
                    }
                  }
                  const prevByChannel = new Map<number, typeof allSnapshots[0]>();
                  for (const snap of allSnapshots) {
                    const latest = latestByChannel.get(snap.channelId);
                    if (!latest || snap.id === latest.id) continue;
                    const ex = prevByChannel.get(snap.channelId);
                    if (!ex || new Date(snap.snapshotDate) > new Date(ex.snapshotDate)) {
                      prevByChannel.set(snap.channelId, snap);
                    }
                  }
                  const rows = Array.from(latestByChannel.entries())
                    .sort((a, b) => b[1].subscriberCount - a[1].subscriberCount);
                  return rows.map(([chId, snap]) => {
                    const ch = channels?.find((c) => c.id === chId);
                    const prev = prevByChannel.get(chId);
                    const growth = prev ? snap.subscriberCount - prev.subscriberCount : null;
                    const er24 = snap.er24 != null ? parseFloat(String(snap.er24)) : null;
                    // CPF data for this channel from cpfData
                    const chCpfRows = cpfData?.filter((r) => r.channelId === chId) ?? [];
                    const chTotalCost = chCpfRows.reduce((s, r) => s + r.purchaseCost, 0);
                    const chDirectSubs = chCpfRows.reduce((s, r) => s + (r.directSubscribersGained ?? 0), 0);
                    const chSnapshotGrowth = chCpfRows.reduce((s, r) => s + r.growth, 0);
                    const chEffSubs = chDirectSubs > 0 ? chDirectSubs : chSnapshotGrowth;
                    const chCpf = chEffSubs > 0 && chTotalCost > 0 ? Math.round((chTotalCost / chEffSubs) * 100) / 100 : null;
                    return (
                      <tr key={chId} className="hover:bg-muted/20 transition-colors">
                        <td className="py-2 pr-3 font-medium text-foreground">{ch?.name ?? `Канал ${chId}`}</td>
                        <td className="text-right py-2 px-2 text-foreground font-semibold">{snap.subscriberCount.toLocaleString("ru-RU")}</td>
                        <td className="text-right py-2 px-2">
                          {growth !== null ? (
                            <span className={growth >= 0 ? "text-emerald-400" : "text-red-400"}>
                              {growth >= 0 ? "+" : ""}{growth.toLocaleString("ru-RU")}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right py-2 px-2">
                          {chDirectSubs > 0 ? (
                            <span className="text-emerald-400">+{chDirectSubs.toLocaleString("ru-RU")}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right py-2 px-2 text-red-400">
                          {chTotalCost > 0 ? `${Math.round(chTotalCost).toLocaleString("ru-RU")} ₽` : "—"}
                        </td>
                        <td className="text-right py-2 px-2">
                          {chCpf !== null ? (
                            <span className={chCpf <= 30 ? "text-emerald-400 font-semibold" : chCpf <= 50 ? "text-amber-400 font-semibold" : "text-red-400 font-semibold"}>
                              {chCpf} ₽
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right py-2 px-2 text-cyan-400">{snap.views24h != null ? snap.views24h.toLocaleString("ru-RU") : "—"}</td>
                        <td className="text-right py-2 pl-2 font-semibold">
                          {er24 !== null ? (
                            <span className={er24 >= 15 ? "text-emerald-400" : er24 >= 8 ? "text-amber-400" : "text-red-400"}>
                              {er24.toFixed(2)}%
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Batch Fetch Analytics Button ───────────────────────────────────────────
function FetchAllAnalyticsButton() {
  const utils = trpc.useUtils();
  const [result, setResult] = useState<{ fetched: number; skipped: number } | null>(null);
  const mutation = trpc.postAnalytics.fetchAllMissing.useMutation({
    onSuccess: (data) => {
      setResult(data);
      utils.postAnalytics.getByRecord.invalidate();
      utils.postAnalytics.list.invalidate();
    },
  });
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setResult(null); mutation.mutate(); }}
        disabled={mutation.isPending}
        className="gap-2 text-xs"
      >
        {mutation.isPending ? (
          <RefreshCw className="w-3 h-3 animate-spin" />
        ) : (
          <BarChart2 className="w-3 h-3" />
        )}
        {mutation.isPending ? "Загружаю..." : "Загрузить аналитику постов"}
      </Button>
      {result && (
        <span className="text-xs text-muted-foreground">
          {result.fetched > 0 ? `✓ ${result.fetched} загружено` : "Всё уже загружено"}
          {result.skipped > 0 ? `, ${result.skipped} пропущено` : ""}
        </span>
      )}
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
          <TabsTrigger value="weekly" className="gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Неделя
          </TabsTrigger>
          <TabsTrigger value="external" className="gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            Внешка
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
          <SubscribersTab month={monthParam} />
        </TabsContent>

          {/* AI Analysis Tab */}
        <TabsContent value="analysis" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
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
            <FetchAllAnalyticsButton />
            <span className="text-xs text-muted-foreground">
              Анализ CPF, ER24, охватов, ниш, тарифов, взаимок и платформ
            </span>
          </div>

          {/* Structured data preview */}
          {analyzeMutation.data?.data && (() => {
            const ctx = analyzeMutation.data.data as any;
            const chans: any[] = ctx.channels ?? [];
            const mutual = ctx.mutual;
            const allDirections = chans.flatMap((c: any) => c.topDirections ?? []);
            const dirCount = allDirections.reduce((acc: Record<string,number>, d: string) => { acc[d] = (acc[d] ?? 0) + 1; return acc; }, {} as Record<string,number>);
            const topDirs = Object.entries(dirCount).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6);
            const allTariffs = chans.flatMap((c: any) => c.topTariffs ?? []);
            const tariffCount = allTariffs.reduce((acc: Record<string,number>, t: string) => { acc[t] = (acc[t] ?? 0) + 1; return acc; }, {} as Record<string,number>);
            const topTariffs = Object.entries(tariffCount).sort((a: any, b: any) => b[1] - a[1]).slice(0, 6);
            const allPlatforms = chans.flatMap((c: any) => c.platforms ?? []);
            const platformCount = allPlatforms.reduce((acc: Record<string,number>, p: string) => { acc[p] = (acc[p] ?? 0) + 1; return acc; }, {} as Record<string,number>);
            return (
              <div className="space-y-3">
                {chans.map((c: any) => (
                  <div key={c.channelId} className="glass rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{c.channelName}</span>
                      <span className={`text-sm font-bold ${roiColor(c.roi)}`}>
                        ROI: {c.roi === Infinity ? "∞" : `${(c.roi as number).toFixed(0)}%`}
                      </span>
                    </div>
                    {(c.currentSubscribers !== null || c.er24 !== null) && (
                      <div className="flex flex-wrap gap-3 text-xs">
                        {c.currentSubscribers !== null && (
                          <span className="text-muted-foreground">
                            👥 <span className="text-foreground font-medium">{(c.currentSubscribers as number).toLocaleString('ru-RU')}</span> подп.
                            {c.weeklyGrowth != null && (
                              <span className={c.weeklyGrowth >= 0 ? " text-emerald-400" : " text-red-400"}>
                                {" "}{c.weeklyGrowth >= 0 ? "+" : ""}{c.weeklyGrowth}/нед.
                              </span>
                            )}
                          </span>
                        )}
                        {c.er24 !== null && (
                          <span className={`font-medium ${(c.er24 as number) >= 15 ? "text-emerald-400" : (c.er24 as number) >= 8 ? "text-yellow-400" : "text-red-400"}`}>
                            ER24: {(c.er24 as number).toFixed(1)}%
                          </span>
                        )}
                        {c.views24h !== null && (
                          <span className="text-muted-foreground">
                            👁️ 24ч: <span className="text-foreground">{(c.views24h as number).toLocaleString('ru-RU')}</span>
                            {c.views48h !== null && <> / 48ч: <span className="text-foreground">{(c.views48h as number).toLocaleString('ru-RU')}</span></>}
                          </span>
                        )}
                      </div>
                    )}
                    {(c.avgCpf !== null || c.subscribersGained > 0) && (
                      <div className="flex flex-wrap gap-3 text-xs">
                        {c.subscribersGained > 0 && (
                          <span className="text-muted-foreground">🎯 Привлечено: <span className="text-emerald-400 font-medium">+{(c.subscribersGained as number).toLocaleString('ru-RU')}</span></span>
                        )}
                        {c.avgCpf !== null && (
                          <span className="text-muted-foreground">CPF: <span className={`font-medium ${(c.avgCpf as number) <= 30 ? "text-emerald-400" : (c.avgCpf as number) <= 50 ? "text-yellow-400" : "text-red-400"}`}>{c.avgCpf}₽</span></span>
                        )}
                        {c.avgPurchaseReach !== null && (
                          <span className="text-muted-foreground">Ср. охват закупа: <span className="text-foreground">{(c.avgPurchaseReach as number).toLocaleString('ru-RU')}</span></span>
                        )}
                        {c.avgSpm !== null && (
                          <span className="text-muted-foreground">Ср. СПМ: <span className="text-foreground">{c.avgSpm}₽</span></span>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-emerald-500/10 p-1.5">
                        <p className="text-[10px] text-muted-foreground">Доход</p>
                        <p className="text-xs font-semibold text-emerald-400">{formatCurrency(c.salesTotal)}</p>
                        <p className="text-[10px] text-muted-foreground">{c.salesCount} прод.</p>
                      </div>
                      <div className="rounded-lg bg-red-500/10 p-1.5">
                        <p className="text-[10px] text-muted-foreground">Расход</p>
                        <p className="text-xs font-semibold text-red-400">{formatCurrency((c as any).realPurchasesTotal ?? c.purchasesTotal)}</p>
                        <p className="text-[10px] text-muted-foreground">{c.purchasesCount} закуп.</p>
                      </div>
                      <div className={`rounded-lg p-1.5 ${c.profit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                        <p className="text-[10px] text-muted-foreground">Прибыль</p>
                        <p className={`text-xs font-semibold ${c.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(c.profit)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(c.topDirections as string[]).slice(0, 4).map((d: string) => (
                        <span key={d} className="text-[10px] bg-violet-500/15 text-violet-300 rounded-full px-2 py-0.5">{d}</span>
                      ))}
                      {(c.topTariffs as string[]).slice(0, 3).map((t: string) => (
                        <span key={t} className="text-[10px] bg-cyan-500/15 text-cyan-300 rounded-full px-2 py-0.5">{t}</span>
                      ))}
                      {(c.platforms as string[]).slice(0, 3).map((p: string) => (
                        <span key={p} className="text-[10px] bg-amber-500/15 text-amber-300 rounded-full px-2 py-0.5">{p}</span>
                      ))}
                      {c.mutualSalesCount > 0 && (
                        <span className="text-[10px] bg-pink-500/15 text-pink-300 rounded-full px-2 py-0.5">🤝 ВП-прод: {c.mutualSalesCount}</span>
                      )}
                      {(c as any).mutualPurchasesCount > 0 && (
                        <span className="text-[10px] bg-purple-500/15 text-purple-300 rounded-full px-2 py-0.5">🤝 ВП-зак: {(c as any).mutualPurchasesCount}</span>
                      )}
                      {(c as any).savedByVp > 0 && (
                        <span className="text-[10px] bg-green-500/15 text-green-300 rounded-full px-2 py-0.5">🎁 Сэкон.: {formatCurrency((c as any).savedByVp)}</span>
                      )}
                    </div>
                    {(c.unpaidSalesTotal > 0 || c.unpaidPurchasesTotal > 0) && (
                      <div className="flex items-center gap-2 text-xs text-orange-400 bg-orange-500/10 rounded-lg px-3 py-1.5">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>
                          {c.unpaidSalesTotal > 0 && `Неоплач. продажи: ${formatCurrency(c.unpaidSalesTotal)}`}
                          {c.unpaidSalesTotal > 0 && c.unpaidPurchasesTotal > 0 && " · "}
                          {c.unpaidPurchasesTotal > 0 && `Неоплач. закупки: ${formatCurrency(c.unpaidPurchasesTotal)}`}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {topDirs.length > 0 && (
                    <div className="glass rounded-xl p-3 space-y-2">
                      <p className="text-xs font-medium text-foreground">🏷️ Топ ниши закупа</p>
                      <div className="flex flex-wrap gap-1">
                        {topDirs.map(([d, n]) => (
                          <span key={d} className="text-[10px] bg-violet-500/15 text-violet-300 rounded-full px-2 py-0.5">{d} ×{n as number}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {topTariffs.length > 0 && (
                    <div className="glass rounded-xl p-3 space-y-2">
                      <p className="text-xs font-medium text-foreground">⏱️ Топ тарифы</p>
                      <div className="flex flex-wrap gap-1">
                        {topTariffs.map(([t, n]) => (
                          <span key={t} className="text-[10px] bg-cyan-500/15 text-cyan-300 rounded-full px-2 py-0.5">{t} ×{n as number}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {mutual && mutual.total > 0 && (
                    <div className="glass rounded-xl p-3 space-y-1.5">
                      <p className="text-xs font-medium text-foreground">🤝 Взаимки (ВП)</p>
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        <p>Всего: <span className="text-foreground">{mutual.total}</span> · Завершено: <span className="text-foreground">{mutual.completed}</span></p>
                        {mutual.totalDopReceived > 0 && <p>Получили: <span className="text-emerald-400">{formatCurrency(mutual.totalDopReceived)}</span></p>}
                        {mutual.totalDopPaid > 0 && <p>Заплатили: <span className="text-red-400">{formatCurrency(mutual.totalDopPaid)}</span></p>}
                        {mutual.avgOurReach !== null && <p>Ср. охват: <span className="text-foreground">{(mutual.avgOurReach as number).toLocaleString('ru-RU')}</span></p>}
                      </div>
                    </div>
                  )}
                  {(() => {
                    const totalVpPurchases = (ctx?.channels ?? []).reduce((s: number, c: any) => s + (c.mutualPurchasesCount ?? 0), 0);
                    const totalVpPurchasesAmt = (ctx?.channels ?? []).reduce((s: number, c: any) => s + (c.mutualPurchasesTotal ?? 0), 0);
                    if (totalVpPurchases === 0) return null;
                    return (
                      <div className="glass rounded-xl p-3 space-y-1.5">
                        <p className="text-xs font-medium text-foreground">🤝 ВП-закупки</p>
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          <p>Закупок: <span className="text-foreground">{totalVpPurchases}</span></p>
                          {totalVpPurchasesAmt > 0 && <p>Доплата: <span className="text-red-400">{formatCurrency(totalVpPurchasesAmt)}</span></p>}
                          {totalVpPurchasesAmt === 0 && <p className="text-emerald-400">Без доплаты</p>}
                        </div>
                      </div>
                    );
                  })()}
                  {Object.keys(platformCount).length > 0 && (
                    <div className="glass rounded-xl p-3 space-y-2">
                      <p className="text-xs font-medium text-foreground">📱 Платформы продаж</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(platformCount).map(([p, n]) => (
                          <span key={p} className="text-[10px] bg-amber-500/15 text-amber-300 rounded-full px-2 py-0.5">{p} ×{n as number}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

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

        {/* Weekly Analysis Tab */}
        <TabsContent value="weekly" className="mt-4">
          <WeeklyAnalysisTab />
        </TabsContent>
        {/* External Advertisers Tab */}
        <TabsContent value="external" className="mt-4">
          <ExternalAnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TrendBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">нет данных</span>;
  if (pct > 0) return <span className="flex items-center gap-0.5 text-xs text-emerald-400"><ArrowUp className="w-3 h-3" />+{pct}%</span>;
  if (pct < 0) return <span className="flex items-center gap-0.5 text-xs text-red-400"><ArrowDown className="w-3 h-3" />{pct}%</span>;
  return <span className="flex items-center gap-0.5 text-xs text-muted-foreground"><Minus className="w-3 h-3" />0%</span>;
}

function WeeklyAnalysisTab() {
  const weeklyStats = trpc.ai.weeklyStats.useQuery({});
  const weeklyAnalysisMutation = trpc.ai.weeklyAnalysis.useMutation();

  const stats = weeklyStats.data;
  const cur = stats?.currentWeek;
  const prev = stats?.previousWeek;
  const trends = stats?.trends;

  const profitPositive = cur ? cur.profit >= 0 : true;
  const hasAnalysis = !!weeklyAnalysisMutation.data?.analysis;

  // Motivational header message based on performance
  const motivationalMessage = cur
    ? cur.profit > 0
      ? { emoji: "🔥", text: `Отличная неделя! Чистая прибыль ${formatCurrency(cur.profit)} — ты на верном пути.`, color: "text-emerald-400" }
      : cur.profit === 0
      ? { emoji: "⚡", text: "Нулевой результат — есть куда расти. Разберём вместе.", color: "text-yellow-400" }
      : { emoji: "💪", text: `Неделя в минусе ${formatCurrency(cur.profit)} — это временно. Все исправим.`, color: "text-orange-400" }
    : null;

  return (
    <div className="space-y-4">
      {/* Motivational header */}
      {motivationalMessage && (
        <div className={`glass rounded-xl p-4 border border-white/5 flex items-center gap-3`}>
          <span className="text-2xl">{motivationalMessage.emoji}</span>
          <div>
            <p className={`font-semibold ${motivationalMessage.color}`}>{motivationalMessage.text}</p>
            {cur && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Неделя {cur.start} – {cur.end}
                {prev && <span className="ml-2 opacity-60">· прошлая: {prev.start} – {prev.end}</span>}
              </p>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {weeklyStats.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass rounded-xl p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : cur ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass rounded-xl p-4 space-y-1 border border-emerald-500/10">
            <div className="text-xs text-muted-foreground">💰 Продажи</div>
            <div className="text-lg font-bold text-emerald-400">{formatCurrency(cur.sales)}</div>
            <div className="text-xs text-muted-foreground">{cur.salesCount} сделок</div>
            <TrendBadge pct={trends?.salesPct} />
          </div>
          <div className="glass rounded-xl p-4 space-y-1 border border-blue-500/10">
            <div className="text-xs text-muted-foreground">📦 Закуп</div>
            <div className="text-lg font-bold text-blue-400">{formatCurrency(cur.purchases)}</div>
            <div className="text-xs text-muted-foreground">{cur.purchasesCount} сделок</div>
            <TrendBadge pct={trends?.purchasesPct} />
          </div>
          <div className="glass rounded-xl p-4 space-y-1 border border-orange-500/10">
            <div className="text-xs text-muted-foreground">💸 Расходы (≈)</div>
            <div className="text-lg font-bold text-orange-400">{formatCurrency(cur.expenses)}</div>
            <div className="text-xs text-muted-foreground">прорация за неделю</div>
          </div>
          <div className={`glass rounded-xl p-4 space-y-1 border ${profitPositive ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
            <div className="text-xs text-muted-foreground">✨ Чистая прибыль</div>
            <div className={`text-lg font-bold ${profitPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(cur.profit)}
            </div>
            <TrendBadge pct={trends?.profitPct} />
          </div>
        </div>
      ) : null}

      {/* Comparison bars */}
      {cur && prev && (
        <div className="glass rounded-xl p-4">
          <div className="text-sm font-semibold mb-3">📊 Сравнение с прошлой неделей</div>
          <div className="space-y-3 text-sm">
            {([
              { label: 'Продажи', cur: cur.sales, prev: prev.sales, color: 'bg-emerald-500' },
              { label: 'Закуп', cur: cur.purchases, prev: prev.purchases, color: 'bg-blue-500' },
              { label: 'Прибыль', cur: cur.profit, prev: prev.profit, color: cur.profit >= 0 ? 'bg-emerald-500' : 'bg-red-500' },
            ] as const).map(row => {
              const maxVal = Math.max(Math.abs(row.cur), Math.abs(row.prev), 1);
              const curW = Math.abs(row.cur) / maxVal * 100;
              const prevW = Math.abs(row.prev) / maxVal * 100;
              return (
                <div key={row.label} className="flex items-center gap-3">
                  <div className="w-20 text-muted-foreground shrink-0 text-xs">{row.label}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 rounded-full ${row.color} transition-all duration-500`} style={{ width: `${curW}%`, minWidth: 2 }} />
                      <span className="text-xs font-medium">{formatCurrency(row.cur)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 rounded-full bg-muted" style={{ width: `${prevW}%`, minWidth: 2 }} />
                      <span className="text-xs text-muted-foreground">{formatCurrency(row.prev)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-emerald-500 inline-block" />Текущая</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-full bg-muted inline-block" />Прошлая</span>
          </div>
        </div>
      )}

      {/* AI Analysis button */}
      <div className="glass rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {hasAnalysis ? "🔄 Обновить AI-разбор" : "🤖 Получи личный AI-разбор недели"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {!profitPositive
              ? "Наставник разберёт цифры, найдёт позитив и даст план выхода в плюс"
              : "Похвала, честный разбор и конкретные шаги на следующую неделю"}
          </p>
        </div>
        <Button
          onClick={() => weeklyAnalysisMutation.mutate({})}
          disabled={weeklyAnalysisMutation.isPending}
          className="gap-2 shrink-0"
          variant={hasAnalysis ? "outline" : "default"}
        >
          {weeklyAnalysisMutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {weeklyAnalysisMutation.isPending ? "Анализирую..." : hasAnalysis ? "Обновить" : "Получить анализ"}
        </Button>
      </div>

      {weeklyAnalysisMutation.data?.analysis && (
        <div className="glass rounded-xl p-5 border border-violet-500/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-violet-300">AI-разбор недели</span>
          </div>
          <div className="prose prose-invert prose-sm max-w-none">
            <Streamdown>{weeklyAnalysisMutation.data.analysis}</Streamdown>
          </div>
        </div>
      )}
      {weeklyAnalysisMutation.isError && (
        <div className="glass rounded-xl p-4 border border-red-500/30 text-red-400 text-sm">
          Ошибка: {weeklyAnalysisMutation.error.message}
        </div>
      )}
    </div>
  );
}

function ExternalAnalyticsTab() {
  const [months, setMonths] = useState<string>("3");
  const { data, isLoading } = trpc.ai.externalAnalytics.useQuery(
    { months: Number(months) },
    { refetchOnWindowFocus: false }
  );

  const monthChartData = data?.byMonth.map((m) => ({
    month: m.month.slice(5), // MM
    revenue: m.revenue,
    count: m.count,
  })) ?? [];

  return (
    <div className="space-y-5">
      {/* Period filter */}
      <div className="flex items-center gap-3">
        <Select value={months} onValueChange={setMonths}>
          <SelectTrigger className="w-[160px] bg-input border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="1">1 месяц</SelectItem>
            <SelectItem value="3">3 месяца</SelectItem>
            <SelectItem value="6">6 месяцев</SelectItem>
            <SelectItem value="12">12 месяцев</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Аналитика продаж внешним рекламодателям</span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="glass rounded-xl p-4 animate-pulse h-24" />)}
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="glass rounded-xl p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Выручка (внешка)</p>
              <p className="text-lg font-bold text-orange-400">{formatCurrency(data.totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">{data.totalCount} сделок</p>
            </div>
            <div className="glass rounded-xl p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Доля в общей выручке</p>
              <p className="text-lg font-bold text-foreground">{data.externalShare}%</p>
              <p className="text-xs text-muted-foreground">от всех продаж</p>
            </div>
            <div className="glass rounded-xl p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Ср. чек (внешка)</p>
              <p className="text-lg font-bold text-orange-300">{formatCurrency(data.avgExternalCost ?? 0)}</p>
              {data.costPremium != null && (
                <p className={`text-xs font-medium ${(data.costPremium ?? 0) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {(data.costPremium ?? 0) > 0 ? "+" : ""}{data.costPremium}% к внутренней
                </p>
              )}
            </div>
            <div className="glass rounded-xl p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Последняя сделка</p>
              <p className="text-lg font-bold text-foreground">
                {data.lastPurchaseDate ? new Date(data.lastPurchaseDate).toLocaleDateString("ru-RU") : "—"}
              </p>
              <p className="text-xs text-muted-foreground">дата продажи</p>
            </div>
          </div>

          {/* Cost comparison */}
          {(data.avgInternalCost ?? 0) > 0 && (data.avgExternalCost ?? 0) > 0 && (
            <div className="glass rounded-xl p-4">
              <div className="text-sm font-medium mb-3">Сравнение среднего чека: внешка vs внутренняя</div>
              <div className="space-y-3">
                {[
                  { label: "🌐 Внешняя", val: data.avgExternalCost ?? 0, color: "bg-orange-500" },
                  { label: "🏠 Внутренняя", val: data.avgInternalCost ?? 0, color: "bg-blue-500" },
                ].map((row) => {
                  const maxVal = Math.max(data.avgExternalCost ?? 0, data.avgInternalCost ?? 0, 1);
                  const w = (row.val / maxVal) * 100;
                  return (
                    <div key={row.label} className="flex items-center gap-3">
                      <div className="w-28 text-xs text-muted-foreground shrink-0">{row.label}</div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className={`h-3 rounded-full ${row.color}`} style={{ width: `${w}%`, minWidth: 4 }} />
                        <span className="text-xs font-medium">{formatCurrency(row.val)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {data.costPremium != null && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Внешняя реклама дороже внутренней на{", "}
                  <span className={`font-bold ${(data.costPremium ?? 0) > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                    {Math.abs(data.costPremium ?? 0)}%
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Monthly revenue chart */}
          {monthChartData.length > 1 && (
            <div className="glass rounded-xl p-4">
              <div className="text-sm font-medium mb-3">Динамика выручки от внешки по месяцам</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={monthChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    formatter={(v: number) => [formatCurrency(v), "Выручка"]}
                  />
                  <Bar dataKey="revenue" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* By channel breakdown */}
          {data.byChannel.length > 0 && (
            <div className="glass rounded-xl p-4">
              <div className="text-sm font-medium mb-3">Внешка по каналам</div>
              <div className="space-y-2">
                {data.byChannel.map((ch) => (
                  <div key={ch.channelId} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div>
                      <div className="text-sm font-medium">{ch.channelName}</div>
                      <div className="text-xs text-muted-foreground">{ch.count} сделок</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-orange-400">{formatCurrency(ch.revenue)}</div>
                      <div className="text-xs text-muted-foreground">ср. {formatCurrency(ch.avgCost)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {data.totalCount === 0 && (
            <div className="glass rounded-xl p-8 text-center">
              <Globe className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">Нет продаж внешним рекламодателям за выбранный период</p>
              <p className="text-xs text-muted-foreground mt-1">Отметьте галочку «Внешка» при создании продажи</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
