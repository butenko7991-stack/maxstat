import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Brain, FileText } from "lucide-react";
import { Streamdown } from "streamdown";

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

      {/* Summary cards */}
      {profitData && (
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
