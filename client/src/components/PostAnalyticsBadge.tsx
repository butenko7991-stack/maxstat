import { trpc } from "@/lib/trpc";
import { Eye, Users, TrendingUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface PostAnalyticsBadgeProps {
  recordType: "sale" | "purchase";
  recordId: number;
  link: string | null | undefined;
  paymentStatus: string;
}

/**
 * Inline analytics badge shown on sale/purchase record cards.
 * Auto-fetches when record is paid and has a link.
 * Shows: total views, views 24h, ERR 24h, subscribers.
 */
export function PostAnalyticsBadge({ recordType, recordId, link, paymentStatus }: PostAnalyticsBadgeProps) {
  const utils = trpc.useUtils();

  const { data: analytics, isLoading } = trpc.postAnalytics.getByRecord.useQuery(
    { recordType, recordId },
    {
      enabled: paymentStatus === "paid" && !!link,
      staleTime: 1000 * 60 * 5, // 5 min cache
    }
  );

  const fetchMutation = trpc.postAnalytics.fetch.useMutation({
    onSuccess: () => {
      utils.postAnalytics.getByRecord.invalidate({ recordType, recordId });
      toast.success("Аналитика обновлена");
    },
    onError: () => toast.error("Не удалось получить аналитику"),
  });

  // Don't show anything if not paid or no link
  if (paymentStatus !== "paid" || !link) return null;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
        <Eye className="w-3 h-3" />
        <span>загрузка...</span>
      </div>
    );
  }

  // No analytics yet — show fetch button
  if (!analytics) {
    return (
      <button
        onClick={() => {
          if (!link) return;
          fetchMutation.mutate({ recordType, recordId, url: link });
        }}
        disabled={fetchMutation.isPending}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        title="Загрузить аналитику"
      >
        <RefreshCw className={`w-3 h-3 ${fetchMutation.isPending ? "animate-spin" : ""}`} />
        <span>загрузить аналитику</span>
      </button>
    );
  }

  // Parse channels JSON
  let channels: Array<{
    channelTitle: string;
    channelSubs: number;
    currentViews: number;
    views24h: number | null;
    err24h: number | null;
    status: string;
  }> = [];
  try {
    channels = JSON.parse(analytics.channelsJson ?? "[]");
  } catch {}

  const err24h = analytics.err24h != null ? parseFloat(String(analytics.err24h)) : null;
  const fetchedDate = new Date(analytics.fetchedAt).toLocaleDateString("ru-RU");

  return (
    <div className="mt-1.5 space-y-1">
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-2">
        {analytics.totalViews != null && (
          <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">
            <Eye className="w-3 h-3" />
            {analytics.totalViews.toLocaleString("ru-RU")} просм.
          </span>
        )}
        {analytics.views24h != null && (
          <span className="inline-flex items-center gap-1 text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20">
            24ч: {analytics.views24h.toLocaleString("ru-RU")}
          </span>
        )}
        {err24h != null && (
          <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <TrendingUp className="w-3 h-3" />
            ERR: {err24h.toFixed(1)}%
          </span>
        )}
        {analytics.totalSubscribers != null && (
          <span className="inline-flex items-center gap-1 text-xs bg-violet-500/10 text-violet-400 px-2 py-0.5 rounded-full border border-violet-500/20">
            <Users className="w-3 h-3" />
            {analytics.totalSubscribers.toLocaleString("ru-RU")} подп.
          </span>
        )}
        <button
          onClick={() => {
            if (!link) return;
            fetchMutation.mutate({ recordType, recordId, url: link });
          }}
          disabled={fetchMutation.isPending}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          title={`Обновить (загружено ${fetchedDate})`}
        >
          <RefreshCw className={`w-3 h-3 ${fetchMutation.isPending ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Per-channel breakdown (if multiple channels) */}
      {channels.length > 1 && (
        <div className="flex flex-col gap-0.5 pl-1 border-l border-border">
          {channels.map((ch, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate max-w-[120px]">{ch.channelTitle}</span>
              <span>{ch.currentViews.toLocaleString("ru-RU")} просм.</span>
              {ch.err24h != null && <span>ERR: {ch.err24h.toFixed(1)}%</span>}
              {ch.status === "deleted" && <span className="text-red-400/70">удалён</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
