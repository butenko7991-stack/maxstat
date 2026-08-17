import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, Play, RefreshCw, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { decideHistoricalReach, shouldIncludeHistoricalReachDecision } from "@/lib/reachExtraction";

type Candidate = {
  recordType: "purchase" | "sale";
  id: number;
  channelId: number;
  channelName: string;
  link: string;
  currentReach: number | null;
  date: Date;
};

type ReviewStatus = "ready" | "same" | "ambiguous" | "no24h" | "error" | "updated";
type Review = Candidate & {
  status: ReviewStatus;
  proposedReach: number | null;
  message: string;
};

const statusMeta: Record<ReviewStatus, { label: string; className: string }> = {
  ready: { label: "Готово к обновлению", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
  same: { label: "Уже верно", className: "bg-sky-500/15 text-sky-300 border-sky-500/25" },
  ambiguous: { label: "Нужна проверка", className: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  no24h: { label: "Нет данных 24ч", className: "bg-slate-500/15 text-slate-300 border-slate-500/25" },
  error: { label: "Ошибка ссылки", className: "bg-red-500/15 text-red-300 border-red-500/25" },
  updated: { label: "Обновлено", className: "bg-violet-500/15 text-violet-300 border-violet-500/25" },
};

function formatReach(value: number | null) {
  return value === null ? "—" : value.toLocaleString("ru-RU");
}

export default function ReachCorrectionPage() {
  const utils = trpc.useUtils();
  const candidatesQuery = trpc.reachCorrection.candidates.useQuery({ recordType: "all" });
  const analyzeLink = trpc.ocr.analyzeLink.useMutation();
  const updatePurchase = trpc.purchases.update.useMutation();
  const updateSale = trpc.sales.update.useMutation();
  const confirmVerified = trpc.reachCorrection.confirmVerified.useMutation();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasReviewed, setHasReviewed] = useState(false);

  const summary = useMemo(() => {
    const count = (status: ReviewStatus) => reviews.filter((review) => review.status === status).length;
    return {
      ready: count("ready"),
      same: count("same"),
      ambiguous: count("ambiguous"),
      no24h: count("no24h"),
      error: count("error"),
      updated: count("updated"),
    };
  }, [reviews]);

  async function reviewCandidates() {
    const candidates = (candidatesQuery.data ?? []) as Candidate[];
    if (candidates.length === 0) {
      toast.info("Подходящих оплаченных записей со ссылками нет");
      return;
    }

    setIsReviewing(true);
    setReviews([]);
    setProgress(0);
    setHasReviewed(false);
    const next: Review[] = [];
    const verified: Array<{ recordType: "purchase" | "sale"; id: number; reach: number; link: string }> = [];
    let skippedSame = 0;

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      try {
        const data = await analyzeLink.mutateAsync({ url: candidate.link, recordType: candidate.recordType });
        const decision = decideHistoricalReach(data.posts, candidate.channelName, candidate.currentReach, candidate.channelId);
        if (shouldIncludeHistoricalReachDecision(decision)) {
          next.push({ ...candidate, ...decision });
        } else {
          skippedSame += 1;
          if (decision.proposedReach !== null) {
            verified.push({
              recordType: candidate.recordType,
              id: candidate.id,
              reach: decision.proposedReach,
              link: candidate.link,
            });
          }
        }
      } catch (error) {
        next.push({
          ...candidate,
          status: "error",
          proposedReach: null,
          message: error instanceof Error ? error.message : "Не удалось проверить ссылку",
        });
      }
      setReviews([...next]);
      setProgress(index + 1);
    }
    if (verified.length > 0) {
      try {
        await confirmVerified.mutateAsync({ records: verified });
        await utils.reachCorrection.candidates.invalidate();
      } catch {
        toast.warning("Не удалось сохранить отметки проверки", { description: "Эти ссылки могут попасть в следующий запуск повторно." });
      }
    }
    setIsReviewing(false);
    setHasReviewed(true);
    toast.success("Предпросмотр готов", {
      description: `Проверено: ${candidates.length}${skippedSame ? ` · Уже верно исключено: ${skippedSame}` : ""}`,
    });
  }

  async function applyReadyReviews() {
    const ready = reviews.filter((review) => review.status === "ready" && review.proposedReach !== null);
    if (ready.length === 0) {
      toast.info("Нет записей для автоматического обновления");
      return;
    }

    setIsApplying(true);
    let updated = 0;
    let failed = 0;
    const updatedIds = new Set<string>();
    const verified: Array<{ recordType: "purchase" | "sale"; id: number; reach: number; link: string }> = [];

    for (const review of ready) {
      try {
        if (review.recordType === "purchase") {
          await updatePurchase.mutateAsync({ id: review.id, reach: review.proposedReach! });
        } else {
          await updateSale.mutateAsync({ id: review.id, reach: review.proposedReach! });
        }
        updated += 1;
        updatedIds.add(`${review.recordType}:${review.id}`);
        verified.push({ recordType: review.recordType, id: review.id, reach: review.proposedReach!, link: review.link });
      } catch {
        failed += 1;
      }
    }

    if (verified.length > 0) {
      try {
        await confirmVerified.mutateAsync({ records: verified });
      } catch {
        toast.warning("Охваты обновлены, но отметки проверки не сохранены", { description: "Эти ссылки могут быть показаны при следующем запуске." });
      }
    }

    setReviews((current) => current.map((review) =>
      updatedIds.has(`${review.recordType}:${review.id}`)
        ? { ...review, status: "updated", currentReach: review.proposedReach, message: "Охват за 24 часа сохранён" }
        : review
    ));
    await Promise.all([
      utils.purchases.list.invalidate(),
      utils.sales.list.invalidate(),
      utils.reachCorrection.candidates.invalidate(),
    ]);
    setIsApplying(false);
    toast.success("Обновление завершено", { description: `Обновлено: ${updated}${failed ? ` · Ошибки: ${failed}` : ""}` });
  }

  const candidateCount = candidatesQuery.data?.length ?? 0;
  const checkedAll = hasReviewed && candidateCount > 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <section className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/15 via-card to-card p-5 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-violet-300 text-sm font-medium mb-3">
              <ShieldCheck className="w-4 h-4" /> Контролируемая корректировка истории
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">Проверка старых охватов</h1>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
              Система анализирует только оплаченные записи со ссылками. Автоматически обновляются лишь записи с однозначно найденным каналом и значением ровно за 24 часа. Неоднозначные ссылки не изменяются.
            </p>
          </div>
          <Button onClick={reviewCandidates} disabled={isReviewing || candidatesQuery.isLoading || isApplying} className="gap-2 shrink-0">
            {isReviewing ? <CircleDashed className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isReviewing ? `Проверка ${progress}/${candidateCount}` : `Проверить ${candidateCount} записей`}
          </Button>
        </div>
        <div className="mt-5 grid sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl bg-background/50 border border-border p-3"><CheckCircle2 className="w-4 h-4 text-emerald-400 mb-1.5" />Меняем только совпавшие 24ч-значения.</div>
          <div className="rounded-xl bg-background/50 border border-border p-3"><AlertTriangle className="w-4 h-4 text-amber-400 mb-1.5" />Общие ссылки остаются на ручную проверку.</div>
          <div className="rounded-xl bg-background/50 border border-border p-3"><XCircle className="w-4 h-4 text-slate-400 mb-1.5" />48ч и 72ч никогда не используются вместо 24ч.</div>
        </div>
      </section>

      {candidatesQuery.isError && (
        <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm">
          Не удалось загрузить записи: {candidatesQuery.error.message}
        </section>
      )}

      {checkedAll && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="font-semibold text-foreground">Результат предпросмотра</h2>
              <p className="text-sm text-muted-foreground mt-1">Нажатие кнопки применит изменения только к зелёным строкам.</p>
            </div>
            <Button onClick={applyReadyReviews} disabled={isApplying || summary.ready === 0} className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white">
              {isApplying ? <CircleDashed className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isApplying ? "Сохраняем…" : `Обновить ${summary.ready} записей`}
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
            {([
              ["Готово", summary.ready, "text-emerald-300"],
              ["Проверить", summary.ambiguous, "text-amber-300"],
              ["Нет 24ч", summary.no24h, "text-slate-300"],
              ["Ошибки", summary.error, "text-red-300"],
              ["Обновлено", summary.updated, "text-violet-300"],
            ] as const).map(([label, count, color]) => (
              <div key={label} className="rounded-xl border border-border bg-background/40 p-3">
                <div className={`text-xl font-semibold ${color}`}>{count}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-foreground">Записи в предпросмотре</h2>
              <p className="text-xs text-muted-foreground mt-1">Жёлтые, серые и красные строки не будут изменены автоматически.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => candidatesQuery.refetch()} className="gap-2"><RefreshCw className="w-3.5 h-3.5" /> Обновить список</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Запись</th>
                  <th className="text-left font-medium px-4 py-3">Канал</th>
                  <th className="text-right font-medium px-4 py-3">Было</th>
                  <th className="text-right font-medium px-4 py-3">24ч</th>
                  <th className="text-left font-medium px-4 py-3">Статус</th>
                  <th className="text-left font-medium px-4 py-3">Причина</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => {
                  const meta = statusMeta[review.status];
                  return (
                    <tr key={`${review.recordType}:${review.id}`} className="border-t border-border/70">
                      <td className="px-4 py-3 text-foreground"><span className="text-muted-foreground">{review.recordType === "purchase" ? "Закуп" : "Продажа"}</span> #{review.id}</td>
                      <td className="px-4 py-3 text-foreground">{review.channelName}<div className="text-xs text-muted-foreground mt-0.5">{new Date(review.date).toLocaleDateString("ru-RU")}</div></td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatReach(review.currentReach)}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatReach(review.proposedReach)}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs whitespace-nowrap ${meta.className}`}>{meta.label}</span></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">{review.message}</td>
                      <td className="px-4 py-3"><a href={review.link} target="_blank" rel="noreferrer" className="inline-flex text-primary hover:text-primary/80" title="Открыть ссылку"><ExternalLink className="w-4 h-4" /></a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
