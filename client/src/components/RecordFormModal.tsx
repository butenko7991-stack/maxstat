import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Calculator, Camera, CheckCircle2, Loader2, Sparkles, XCircle, Zap } from "lucide-react";
import { AutocompleteInput } from "./AutocompleteInput";
import { trpc } from "@/lib/trpc";
import { getViews24h, selectPostForChannel } from "@/lib/reachExtraction";
import { toast } from "sonner";

export type PaymentStatus = "paid" | "unpaid" | "partial";
export type TimeSlot = string;
export const DEFAULT_PLACEMENT_DURATION = "1/48";
const PLACEMENT_DURATION_OPTIONS = ["1/24", "1/48"] as const;

export interface PurchaseFormData {
  channelId: string;
  date: string;
  admin: string;
  link: string;
  targetChannels: string;
  direction: string;
  tariff: string;
  buyer: string;
  spm: string;
  reach: string;
  cost: string;
  paymentStatus: PaymentStatus;
  subscribersGained: string;
  month: string;
  notes: string;
  timeSlot: string;
  bookingSlot: "утро" | "обед" | "вечер" | "ночной топ" | "";
  sourceSubscribers: string; // approx size of source channel (optional)
  // ВП fields
  isMutual: boolean;
  partnerChannel: string;
  ourReach: string;
  partnerReach: string;
  dopDirection: "we_pay" | "they_pay" | "none";
  dopAmount: string;
}

export interface SaleFormData {
  channelId: string;
  date: string;
  admin: string;
  link: string;
  timeSlot: string;
  bookingSlot: "утро" | "обед" | "вечер" | "ночной топ" | "";
  tariff: string;
  platform: string;
  spm: string;
  reach: string;
  cost: string;
  paymentStatus: PaymentStatus;
  month: string;
  postNotNeeded: boolean;
  isExternal: boolean;
  buyerSubscribers: string; // approx size of buyer channel (optional)
  // ВП fields
  isMutual: boolean;
  partnerChannel: string;
  ourReach: string;
  partnerReach: string;
  dopDirection: "we_pay" | "they_pay" | "none";
  dopAmount: string;
  notes: string;
}

export interface AutocompleteSuggestions {
  admins: string[];
  directions: string[];
  buyers: string[];
  platforms: string[];
}

interface Channel {
  id: number;
  name: string;
}

/**
 * Calculates cost from reach and SPM value.
 * Formula: cost = (reach × spmValue) / 1000
 */
function calcCostFromSpm(reach: string, spm: string): string {
  const reachNum = parseFloat(reach);
  const spmMatch = spm.match(/[\d.,]+/);
  if (!spmMatch) return "";
  const spmNum = parseFloat(spmMatch[0].replace(",", "."));
  if (!isFinite(reachNum) || !isFinite(spmNum) || reachNum <= 0 || spmNum <= 0) return "";
  return String(Math.round((reachNum * spmNum) / 1000));
}

function PlacementDurationField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const isLegacyValue = Boolean(value) && !PLACEMENT_DURATION_OPTIONS.includes(value as (typeof PLACEMENT_DURATION_OPTIONS)[number]);

  return (
    <div className="space-y-1.5">
      <Label>Время размещения</Label>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Время размещения">
        {PLACEMENT_DURATION_OPTIONS.map((duration) => {
          const selected = value === duration;
          return (
            <button
              key={duration}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(duration)}
              className={cn(
                "min-h-10 rounded-lg border px-3 text-sm font-semibold transition-all active:scale-[0.97]",
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                  : "border-border bg-input text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              {duration}
            </button>
          );
        })}
      </div>
      {isLegacyValue && (
        <p className="text-[11px] text-amber-400">
          Сохранено ранее: {value}. Выберите 1/24 или 1/48, чтобы изменить.
        </p>
      )}
    </div>
  );
}

// ─── Purchase Form Modal ──────────────────────────────────────────────────────
interface PurchaseFormModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  channels: Channel[];
  form: PurchaseFormData;
  setForm: React.Dispatch<React.SetStateAction<PurchaseFormData>>;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  suggestions?: AutocompleteSuggestions;
  /** When provided, hides channel/date/slot fields and shows this summary instead */
  bulkSlotsSummary?: React.ReactNode;
}

export function PurchaseFormModal({
  open,
  onOpenChange,
  title,
  channels,
  form,
  setForm,
  onSubmit,
  isPending,
  suggestions,
  bulkSlotsSummary,
}: PurchaseFormModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const recognizeMutation = trpc.ocr.recognizePurchaseScreenshot.useMutation();

  // ── ВП auto-link by admin name ─────────────────────────────────────────
  const adminForSearch = useMemo(() => form.admin.trim(), [form.admin]);
  const linkedByAdminQuery = trpc.purchases.findLinkedByAdmin.useQuery(
    { admin: adminForSearch },
    { enabled: form.isMutual && adminForSearch.length >= 2 }
  );

  // ── Link analysis state ──────────────────────────────────────────────────
  const [linkAnalyzeStatus, setLinkAnalyzeStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [linkAnalyzeError, setLinkAnalyzeError] = useState("");
  const [linkAnalyzeResult, setLinkAnalyzeResult] = useState<any>(null);

  const analyzeLinkMutation = trpc.ocr.analyzeLink.useMutation({
    onSuccess: (data) => {
      setLinkAnalyzeResult(data);
      setLinkAnalyzeStatus("done");
      if (data.posts && data.posts.length >= 1) {
        const selectedChannelName = (channels.find(c => String(c.id) === form.channelId)?.name ?? "").toLowerCase();
        const selection = selectPostForChannel(data.posts, selectedChannelName, Number(form.channelId));
        const reach = getViews24h(selection.post);
        const sourceSubscribers = selection.post?.channelSubs;
        if (selection.post) setForm((f) => ({
          ...f,
          ...(reach !== null ? { reach: String(reach) } : {}),
          ...(sourceSubscribers != null ? { sourceSubscribers: String(sourceSubscribers) } : {}),
        }));
        const channelCount = data.posts.length;
        if (selection.kind === "ambiguous") {
          toast.info(`Найдено ${channelCount} канала`, {
            description: "Охваты не изменены: выберите нужный канал в панели ниже.",
            duration: 4000,
          });
        } else if (reach === null) {
          toast.info("Охваты за 24 часа не найдены", { description: "Значение не менялось", duration: 3000 });
        } else {
          toast.success("Охват извлечён", {
            description: `Охваты 24ч: ${reach.toLocaleString()}`,
            duration: 3000,
          });
        }
      } else {
        toast.info("Данные не найдены", { description: "Страница загружена, но статистика не обнаружена", duration: 4000 });
      }
    },
    onError: (err) => {
      setLinkAnalyzeStatus("error");
      setLinkAnalyzeError(err.message);
      toast.error("Ошибка анализа", {
        description: err.message,
        duration: 5000,
      });
    },
  });

  function handleAnalyzeLinkPurchase() {
    const url = form.link.trim();
    if (!url.startsWith("http")) return;
    setLinkAnalyzeStatus("loading");
    setLinkAnalyzeError("");
    setLinkAnalyzeResult(null);
    analyzeLinkMutation.mutate({ url, recordType: "purchase" });
  }

  function applyPostDataPurchase(post: any) {
    const reach = getViews24h(post);
    const subs = post.channelSubs;
    setForm((f) => ({
      ...f,
      ...(reach != null ? { reach: String(reach) } : {}),
      ...(subs != null ? { sourceSubscribers: String(subs) } : {}),
    }));
  }

  // ── Auto-extract from link when status changes to paid ─────────────────
  function handlePaymentStatusChangePurchase(v: PaymentStatus) {
    setForm((f) => ({ ...f, paymentStatus: v }));
    // Always re-fetch reach when switching TO paid and link exists
    if (v === "paid" && form.link.trim().startsWith("http")) {
      setLinkAnalyzeStatus("loading");
      setLinkAnalyzeError("");
      setLinkAnalyzeResult(null);
      analyzeLinkMutation.mutate({ url: form.link.trim(), recordType: "purchase" });
    }
  }

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrStatus("loading");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const imageBase64 = (ev.target?.result as string).split(",")[1];
      const mimeType = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
      setOcrPreview(ev.target?.result as string);
      try {
        const response = await recognizeMutation.mutateAsync({ imageBase64, mimeType });
        if (!response.success) { setOcrStatus("error"); return; }
        const d = response.data;
        setForm((f) => ({
          ...f,
          ...(d.date ? { date: d.date, month: d.date.slice(0, 7) } : {}),
          ...(d.subscribersGained != null ? { subscribersGained: String(d.subscribersGained) } : {}),
          ...(d.reach != null ? { reach: String(d.reach) } : {}),
          ...(d.cost != null ? { cost: String(d.cost) } : {}),
          ...(d.cpm != null ? { spm: String(d.cpm) } : {}),
          ...(d.timeSlot ? { timeSlot: d.timeSlot } : {}),
          ...(d.channelName && channels.length > 0 ? (() => {
            const name = d.channelName!.toLowerCase();
            const match = channels.find(c =>
              c.name.toLowerCase().includes(name) || name.includes(c.name.toLowerCase())
            );
            return match ? { channelId: String(match.id) } : {};
          })() : {}),
        }));
        setOcrStatus("done");
      } catch {
        setOcrStatus("error");
      }
    };
    reader.readAsDataURL(file);
  };

  // Auto-calculate cost when reach or spm changes
  useEffect(() => {
    if (!form.reach || !form.spm) return;
    const calculated = calcCostFromSpm(form.reach, form.spm);
    if (calculated) {
      setForm((f) => ({ ...f, cost: calculated }));
    }
  }, [form.reach, form.spm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-2">
          {/* ── Screenshot OCR block ── */}
          <div className="rounded-xl border border-blue-800/40 bg-blue-950/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-blue-400/80 font-medium">
                <Camera className="w-3.5 h-3.5" />
                Загрузить скрин статистики
              </div>
              {ocrStatus === "done" && (
                <div className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Распознано
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleScreenshotUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs border-blue-700/50 text-blue-300 hover:bg-blue-900/30"
                onClick={() => fileInputRef.current?.click()}
                disabled={ocrStatus === "loading"}
              >
                {ocrStatus === "loading" ? (
                  <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Распознаю...</>
                ) : (
                  <><Camera className="w-3.5 h-3.5 mr-1.5" /> Выбрать скрин</>
                )}
              </Button>
              {ocrPreview && (
                <img src={ocrPreview} alt="preview" className="h-10 w-auto rounded border border-border object-cover" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              AI автоматически заполнит поля: дата, подписчики, охваты, стоимость, CPM, время
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {bulkSlotsSummary ? (
              <div className="col-span-2">{bulkSlotsSummary}</div>
            ) : (
              <>
                <div className="space-y-1.5 col-span-2">
                  <Label>Канал *</Label>
                  <Select
                    value={form.channelId}
                    onValueChange={(v) => setForm((f) => ({ ...f, channelId: v }))}
                    required
                  >
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue placeholder="Выберите канал" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {channels.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Дата *</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => {
                      const d = e.target.value;
                      const month = d.slice(0, 7);
                      setForm((f) => ({ ...f, date: d, month }));
                    }}
                    required
                    className="bg-input border-border"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Статус оплаты</Label>
              <Select
                value={form.paymentStatus}
                onValueChange={(v) => handlePaymentStatusChangePurchase(v as PaymentStatus)}
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="unpaid">Не оплачено</SelectItem>
                  <SelectItem value="paid">Оплачено</SelectItem>
                  <SelectItem value="partial">Частично</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Админ</Label>
              <AutocompleteInput
                value={form.admin}
                onChange={(v) => setForm((f) => ({ ...f, admin: v }))}
                suggestions={suggestions?.admins ?? []}
                placeholder="Имя администратора"
                className="bg-input border-border"
              />
            </div>

            <PlacementDurationField
              value={form.tariff}
              onChange={(tariff) => setForm((f) => ({ ...f, tariff }))}
            />

            {/* SPM + Reach + Auto-calculated cost block */}
            <div className="col-span-2 rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <Calculator className="w-3.5 h-3.5" />
                Расчёт по СПМ: Охваты × СПМ / 1000
                {linkAnalyzeStatus === "loading" && (
                  <span className="ml-auto flex items-center gap-1 text-violet-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Получаю охват...</span>
                  </span>
                )}
                {linkAnalyzeStatus === "done" && (
                  <span className="ml-auto flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Охват обновлён</span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Охваты</Label>
                  <Input
                    type="number"
                    value={form.reach}
                    onChange={(e) => setForm((f) => ({ ...f, reach: e.target.value }))}
                    placeholder="500"
                    className={`bg-input border-border ${linkAnalyzeStatus === "loading" ? "opacity-60" : ""}`}
                    min={0}
                    disabled={linkAnalyzeStatus === "loading"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">СПМ</Label>
                  <Input
                    value={form.spm}
                    onChange={(e) => setForm((f) => ({ ...f, spm: e.target.value }))}
                    placeholder="1000"
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Стоимость (₽)</Label>
                  <Input
                    type="number"
                    value={form.cost}
                    onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                    placeholder="авто"
                    className="bg-input border-border"
                  />
                </div>
              </div>
              {form.reach && form.spm && calcCostFromSpm(form.reach, form.spm) && (
                <p className="text-xs text-primary/80">
                  = {form.reach} × {form.spm.match(/[\d.,]+/)?.[0] ?? "?"} / 1000 ={" "}
                  <strong>{calcCostFromSpm(form.reach, form.spm)} ₽</strong>
                </p>
              )}
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Ссылка</Label>
              <div className="flex gap-2">
                <Input
                  value={form.link}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, link: e.target.value }));
                    if (linkAnalyzeStatus !== "idle") { setLinkAnalyzeStatus("idle"); setLinkAnalyzeResult(null); }
                  }}
                  placeholder="https://iimax.ru/..."
                  className="bg-input border-border flex-1"
                />
                {form.link.startsWith("http") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`shrink-0 gap-1.5 transition-all duration-300 ${
                      linkAnalyzeStatus === "loading"
                        ? "bg-violet-500/20 border-violet-400/60 text-violet-300 animate-pulse cursor-wait"
                        : linkAnalyzeStatus === "done"
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20"
                        : linkAnalyzeStatus === "error"
                        ? "bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20"
                        : "bg-transparent border-violet-500/40 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300"
                    }`}
                    onClick={handleAnalyzeLinkPurchase}
                    disabled={linkAnalyzeStatus === "loading"}
                    title="Извлечь данные из ссылки"
                  >
                    {linkAnalyzeStatus === "loading" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : linkAnalyzeStatus === "done" ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : linkAnalyzeStatus === "error" ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span className="text-xs hidden sm:inline">
                      {linkAnalyzeStatus === "loading" ? "Анализ..." : linkAnalyzeStatus === "done" ? "Готово" : linkAnalyzeStatus === "error" ? "Повтор" : "Извлечь"}
                    </span>
                  </Button>
                )}
              </div>
              {/* Loading overlay */}
              {linkAnalyzeStatus === "loading" && (
                <div className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 flex items-center gap-3 animate-in fade-in duration-300">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-400 animate-spin" />
                    <Zap className="w-3.5 h-3.5 text-violet-400 absolute inset-0 m-auto" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-violet-300">Анализирую ссылку...</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Извлекаю статистику поста</p>
                  </div>
                </div>
              )}
              {/* Error */}
              {linkAnalyzeStatus === "error" && (
                <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-2 animate-in fade-in duration-300">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-red-400">Ошибка анализа</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{linkAnalyzeError}</p>
                  </div>
                </div>
              )}
              {/* Result panel */}
              {linkAnalyzeStatus === "done" && linkAnalyzeResult && (
                <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-400">Данные извлечены</span>
                    {linkAnalyzeResult.draftName && (
                      <span className="text-xs text-muted-foreground truncate ml-auto">{linkAnalyzeResult.draftName}</span>
                    )}
                  </div>
                  {linkAnalyzeResult.posts && linkAnalyzeResult.posts.length > 1 ? (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Выберите канал для заполнения:</p>
                      {linkAnalyzeResult.posts.map((post: any, i: number) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { applyPostDataPurchase(post); toast.success(`Канал «${post.channelTitle ?? i + 1}» выбран`); }}
                          className="w-full text-left rounded-md border border-emerald-500/20 bg-card px-3 py-2.5 text-xs hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-200 active:scale-[0.98]"
                        >
                          <div className="font-medium text-foreground">{post.channelTitle ?? `Канал ${i + 1}`}</div>
                          <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                            {post.channelSubs != null && <span>👥 {post.channelSubs.toLocaleString()}</span>}
                            {post.views24h != null && <span>👁 {post.views24h.toLocaleString()}</span>}
                            {post.er24h != null && <span>ER {post.er24h}%</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : linkAnalyzeResult.posts && linkAnalyzeResult.posts.length === 1 ? (
                    <div className="text-xs space-y-1">
                      {linkAnalyzeResult.posts[0].channelTitle && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Канал</span><span className="text-foreground font-medium">{linkAnalyzeResult.posts[0].channelTitle}</span></div>
                      )}
                      {linkAnalyzeResult.posts[0].views24h != null && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Охваты 24ч</span><span className="text-foreground font-medium">{linkAnalyzeResult.posts[0].views24h.toLocaleString()}</span></div>
                      )}
                      {linkAnalyzeResult.posts[0].er24h != null && (
                        <div className="flex justify-between"><span className="text-muted-foreground">ER 24ч</span><span className="text-foreground font-medium">{linkAnalyzeResult.posts[0].er24h}%</span></div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Направление</Label>
              <AutocompleteInput
                value={form.direction}
                onChange={(v) => setForm((f) => ({ ...f, direction: v }))}
                suggestions={suggestions?.directions ?? []}
                placeholder="психология, мода..."
                className="bg-input border-border"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Закупщик</Label>
              <AutocompleteInput
                value={form.buyer}
                onChange={(v) => setForm((f) => ({ ...f, buyer: v }))}
                suggestions={suggestions?.buyers ?? []}
                placeholder="Имя закупщика"
                className="bg-input border-border"
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Целевые каналы</Label>
              <Input
                value={form.targetChannels}
                onChange={(e) => setForm((f) => ({ ...f, targetChannels: e.target.value }))}
                placeholder="Каналы для размещения"
                className="bg-input border-border"
              />
            </div>
            {/* Source channel size */}
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs text-muted-foreground">Подписчики канала-источника (приблизительно)</Label>
              <Input
                type="number"
                value={form.sourceSubscribers}
                onChange={(e) => setForm((f) => ({ ...f, sourceSubscribers: e.target.value }))}
                placeholder="Например: 50000"
                className="bg-input border-border"
                min={0}
              />
            </div>

            {/* Subscribers gained */}
            <div className="col-span-2 rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400/80 font-medium">
                Фактический результат размещения
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Пришло подписчиков</Label>
                  <Input
                    type="number"
                    value={form.subscribersGained}
                    onChange={(e) => setForm((f) => ({ ...f, subscribersGained: e.target.value }))}
                    placeholder="0"
                    className="bg-input border-border"
                    min={0}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Стоимость подписчика</Label>
                  <div className="flex items-center h-10 px-3 rounded-md border border-border bg-muted/30 text-sm">
                    {form.subscribersGained && form.cost && Number(form.subscribersGained) > 0
                      ? <span className="text-emerald-400 font-semibold">{Math.round(Number(form.cost) / Number(form.subscribersGained))} ₽/подп.</span>
                      : <span className="text-muted-foreground text-xs">введите данные</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Слот бронирования</Label>
              <Select
                value={form.bookingSlot || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, bookingSlot: v === "none" ? "" : v as "" | "утро" | "обед" | "вечер" | "ночной топ" }))}
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue placeholder="Выберите слот..." />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="none">Не указан</SelectItem>
                  <SelectItem value="утро">Утро</SelectItem>
                  <SelectItem value="обед">Обед</SelectItem>
                  <SelectItem value="вечер">Вечер</SelectItem>
                  <SelectItem value="ночной топ">Ночной топ</SelectItem>
                </SelectContent>
              </Select>
            </div>

                <div className="space-y-1.5">
                  <Label>Время (свободный формат)</Label>
              <Input
                value={form.timeSlot}
                onChange={(e) => setForm((f) => ({ ...f, timeSlot: e.target.value }))}
                placeholder="утро, 10:00, вечер..."
                className="bg-input border-border"
              />
            </div>

            {/* ВП checkbox */}
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.isMutual}
                  onChange={(e) => setForm((f) => ({ ...f, isMutual: e.target.checked }))}
                  className="h-4 w-4 rounded border-border accent-violet-500"
                />
                <span className="text-sm font-medium text-violet-400">Взаимная подписка (ВП)</span>
              </label>
            </div>

            {/* ВП conditional fields */}
            {form.isMutual && (
              <>
                {/* Auto-link suggestion panel */}
                {adminForSearch.length >= 2 && (
                  <div className="col-span-2 rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 space-y-2">
                    <p className="text-xs font-medium text-violet-400">Связанные записи по админу «{adminForSearch}»</p>
                    {linkedByAdminQuery.isLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />Поиск...
                      </div>
                    )}
                    {linkedByAdminQuery.data && (
                      <div className="space-y-1.5">
                        {linkedByAdminQuery.data.sales.length > 0 && (
                          <div>
                            <p className="text-xs text-emerald-400 font-medium mb-1">Продажи:</p>
                            {linkedByAdminQuery.data.sales.map((s) => (
                              <div key={s.id} className="flex items-center justify-between gap-2 text-xs bg-emerald-950/30 border border-emerald-500/20 rounded px-2 py-1.5">
                                <span className="text-emerald-300 flex-1">
                                  #{s.id} • {s.date ? new Date(s.date).toLocaleDateString("ru-RU") : ""} • {s.cost ? `${s.cost}₽` : "без цены"}{s.isMutual ? " • ВП" : ""}
                                </span>
                                <button type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setForm((f) => ({ ...f, partnerChannel: s.admin ?? "" })); }}
                                  className="shrink-0 cursor-pointer rounded bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-medium px-2 py-0.5 select-none"
                                >Использовать</button>
                              </div>
                            ))}
                          </div>
                        )}
                        {linkedByAdminQuery.data.purchases.length > 0 && (
                          <div>
                            <p className="text-xs text-blue-400 font-medium mb-1">Другие закупы:</p>
                            {linkedByAdminQuery.data.purchases.map((p) => (
                              <div key={p.id} className="flex items-center justify-between gap-2 text-xs bg-blue-950/30 border border-blue-500/20 rounded px-2 py-1.5">
                                <span className="text-blue-300 flex-1">
                                  #{p.id} • {p.date ? new Date(p.date).toLocaleDateString("ru-RU") : ""} • {p.cost ? `${p.cost}₽` : "без цены"}{p.isMutual ? " • ВП" : ""}
                                </span>
                                <button type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setForm((f) => ({ ...f, partnerChannel: p.admin ?? "" })); }}
                                  className="shrink-0 cursor-pointer rounded bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium px-2 py-0.5 select-none"
                                >Использовать</button>
                              </div>
                            ))}
                          </div>
                        )}
                        {linkedByAdminQuery.data.sales.length === 0 && linkedByAdminQuery.data.purchases.length === 0 && (
                          <p className="text-xs text-muted-foreground">Связанных записей не найдено</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5 col-span-2">
                  <Label>Канал-партнёр</Label>
                  <Input
                    value={form.partnerChannel}
                    onChange={(e) => setForm((f) => ({ ...f, partnerChannel: e.target.value }))}
                    placeholder="Название канала партнёра"
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Наши охваты</Label>
                  <Input type="number" value={form.ourReach}
                    onChange={(e) => setForm((f) => ({ ...f, ourReach: e.target.value }))}
                    placeholder="Например: 5000" className="bg-input border-border" />
                </div>
                <div className="space-y-1.5">
                  <Label>Охваты партнёра</Label>
                  <Input type="number" value={form.partnerReach}
                    onChange={(e) => setForm((f) => ({ ...f, partnerReach: e.target.value }))}
                    placeholder="Например: 3000" className="bg-input border-border" />
                </div>
                {form.ourReach && form.partnerReach && (
                  <div className="col-span-2 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2">
                    <p className="text-xs text-violet-300">
                      Разница охватов: {Math.abs(Number(form.ourReach) - Number(form.partnerReach)).toLocaleString("ru-RU")}
                      {Number(form.ourReach) > Number(form.partnerReach) ? " — партнёр должен доплатить"
                        : Number(form.ourReach) < Number(form.partnerReach) ? " — мы доплачиваем" : " — охваты равны"}
                    </p>
                  </div>
                )}
                <div className="space-y-1.5 col-span-2">
                  <Label>Доплата</Label>
                  <Select value={form.dopDirection}
                    onValueChange={(v) => setForm((f) => ({ ...f, dopDirection: v as "we_pay" | "they_pay" | "none" }))}>
                    <SelectTrigger className="bg-input border-border"><SelectValue placeholder="Тип доплаты" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без доплаты</SelectItem>
                      <SelectItem value="we_pay">Мы платим</SelectItem>
                      <SelectItem value="they_pay">Нам платят</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.dopDirection !== "none" && (
                  <div className="space-y-1.5 col-span-2">
                    <Label>Сумма доплаты (₽)</Label>
                    <Input type="number" value={form.dopAmount}
                      onChange={(e) => setForm((f) => ({ ...f, dopAmount: e.target.value }))}
                      placeholder="0" className="bg-input border-border" />
                  </div>
                )}
              </>
            )}

            <div className="space-y-1.5 col-span-2">
              <Label>Заметки</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Дополнительные заметки"
                rows={2}
                className="bg-input border-border resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sale Form Modal ──────────────────────────────────────────────────────────
interface SaleFormModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  channels: Channel[];
  form: SaleFormData;
  setForm: React.Dispatch<React.SetStateAction<SaleFormData>>;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  suggestions?: AutocompleteSuggestions;
  conflictError?: string | null;
  onClearConflict?: () => void;
  /** When provided, hides channel/date/slot fields and shows this summary instead */
  bulkSlotsSummary?: React.ReactNode;
}

export function SaleFormModal({
  open,
  onOpenChange,
  title,
  channels,
  form,
  setForm,
  onSubmit,
  isPending,
  suggestions,
  conflictError,
  onClearConflict,
  bulkSlotsSummary,
}: SaleFormModalProps) {
  // ── ВП auto-link by admin name ─────────────────────────────────────────
  const adminForSearch = useMemo(() => form.admin.trim(), [form.admin]);
  const linkedByAdminQuery = trpc.purchases.findLinkedByAdmin.useQuery(
    { admin: adminForSearch },
    { enabled: form.isMutual && adminForSearch.length >= 2 }
  );

  // ── Link analysis state ──────────────────────────────────────────────────
  const [linkAnalyzeStatus, setLinkAnalyzeStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [linkAnalyzeError, setLinkAnalyzeError] = useState("");
  const [linkAnalyzeResult, setLinkAnalyzeResult] = useState<any>(null);

  const analyzeLinkMutation = trpc.ocr.analyzeLink.useMutation({
    onSuccess: (data) => {
      setLinkAnalyzeResult(data);
      setLinkAnalyzeStatus("done");
      if (data.posts && data.posts.length >= 1) {
        const selectedChannelName = (channels.find(c => String(c.id) === form.channelId)?.name ?? "").toLowerCase();
        const selection = selectPostForChannel(data.posts, selectedChannelName, Number(form.channelId));
        const reach = getViews24h(selection.post);
        const buyerSubscribers = selection.post?.channelSubs;
        if (selection.post) setForm((f) => ({
          ...f,
          ...(reach !== null ? { reach: String(reach) } : {}),
          ...(buyerSubscribers != null ? { buyerSubscribers: String(buyerSubscribers) } : {}),
        }));
        const channelCount = data.posts.length;
        if (selection.kind === "ambiguous") {
          toast.info(`Найдено ${channelCount} канала`, {
            description: "Охваты не изменены: выберите нужный канал в панели ниже.",
            duration: 4000,
          });
        } else if (reach === null) {
          toast.info("Охваты за 24 часа не найдены", { description: "Значение не менялось", duration: 3000 });
        } else {
          toast.success("Охват извлечён", {
            description: `Охваты 24ч: ${reach.toLocaleString()}`,
            duration: 3000,
          });
        }
      } else {
        toast.info("Данные не найдены", { description: "Страница загружена, но статистика не обнаружена", duration: 4000 });
      }
    },
    onError: (err) => {
      setLinkAnalyzeStatus("error");
      setLinkAnalyzeError(err.message);
      toast.error("Ошибка анализа", {
        description: err.message,
        duration: 5000,
      });
    },
  });

  function handleAnalyzeLink() {
    const url = form.link.trim();
    if (!url.startsWith("http")) return;
    setLinkAnalyzeStatus("loading");
    setLinkAnalyzeError("");
    setLinkAnalyzeResult(null);
    analyzeLinkMutation.mutate({ url, recordType: "sale" });
  }

  function applyPostData(post: any) {
    const reach = getViews24h(post);
    const subs = post.channelSubs;
    setForm((f) => ({
      ...f,
      ...(reach != null ? { reach: String(reach) } : {}),
      ...(subs != null ? { buyerSubscribers: String(subs) } : {}),
    }));
  }
  // ── Auto-extract from link when status changes to paid ─────────────────
  function handlePaymentStatusChange(v: PaymentStatus) {
    setForm((f) => ({ ...f, paymentStatus: v }));
    // Always re-fetch reach when switching TO paid and link exists (even if already analyzed)
    if (v === "paid" && form.link.trim().startsWith("http")) {
      setLinkAnalyzeStatus("loading");
      setLinkAnalyzeError("");
      setLinkAnalyzeResult(null);
      analyzeLinkMutation.mutate({ url: form.link.trim(), recordType: "sale" });
    }
  }

  // Auto-calculate cost when reach or spm changes
  useEffect(() => {
    if (!form.reach || !form.spm) return;
    const calculated = calcCostFromSpm(form.reach, form.spm);
    if (calculated) {
      setForm((f) => ({ ...f, cost: calculated }));
    }
  }, [form.reach, form.spm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            {bulkSlotsSummary ? (
              <div className="col-span-2">{bulkSlotsSummary}</div>
            ) : (
              <>
                <div className="space-y-1.5 col-span-2">
                  <Label>Канал *</Label>
                  <Select
                    value={form.channelId}
                    onValueChange={(v) => setForm((f) => ({ ...f, channelId: v }))}
                    required
                  >
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue placeholder="Выберите канал" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {channels.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Дата *</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => {
                      const d = e.target.value;
                      const month = d.slice(0, 7);
                      setForm((f) => ({ ...f, date: d, month }));
                    }}
                    required
                    className="bg-input border-border"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Слот бронирования</Label>
                  <Select
                    value={form.bookingSlot || "none"}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, bookingSlot: (v === "none" ? "" : v) as "утро" | "обед" | "вечер" | "ночной топ" | "" }))
                    }
                  >
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue placeholder="Выберите слот..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="none">Не указан</SelectItem>
                      <SelectItem value="утро">Утро</SelectItem>
                      <SelectItem value="обед">Обед</SelectItem>
                      <SelectItem value="вечер">Вечер</SelectItem>
                      <SelectItem value="ночной топ">Ночной топ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Время (свободный формат)</Label>
                  <Input
                    value={form.timeSlot}
                    onChange={(e) => setForm((f) => ({ ...f, timeSlot: e.target.value }))}
                    placeholder="утро, 10:00, вечер..."
                    className="bg-input border-border"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Статус оплаты</Label>
              <Select
                value={form.paymentStatus}
                onValueChange={(v) => handlePaymentStatusChange(v as PaymentStatus)}
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="unpaid">Не оплачено</SelectItem>
                  <SelectItem value="paid">Оплачено</SelectItem>
                  <SelectItem value="partial">Частично</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Админ</Label>
              <AutocompleteInput
                value={form.admin}
                onChange={(v) => setForm((f) => ({ ...f, admin: v }))}
                suggestions={suggestions?.admins ?? []}
                placeholder="Имя администратора"
                className="bg-input border-border"
              />
            </div>

            <PlacementDurationField
              value={form.tariff}
              onChange={(tariff) => setForm((f) => ({ ...f, tariff }))}
            />

            {/* SPM + Reach + Auto-calculated cost block */}
            <div className="col-span-2 rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <Calculator className="w-3.5 h-3.5" />
                Расчёт по СПМ: Охваты × СПМ / 1000
                {linkAnalyzeStatus === "loading" && (
                  <span className="ml-auto flex items-center gap-1 text-violet-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Получаю охват...</span>
                  </span>
                )}
                {linkAnalyzeStatus === "done" && (
                  <span className="ml-auto flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Охват обновлён</span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Охваты</Label>
                  <Input
                    type="number"
                    value={form.reach}
                    onChange={(e) => setForm((f) => ({ ...f, reach: e.target.value }))}
                    placeholder="500"
                    className={`bg-input border-border ${linkAnalyzeStatus === "loading" ? "opacity-60" : ""}`}
                    min={0}
                    disabled={linkAnalyzeStatus === "loading"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">СПМ</Label>
                  <Input
                    value={form.spm}
                    onChange={(e) => setForm((f) => ({ ...f, spm: e.target.value }))}
                    placeholder="1000"
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Стоимость (₽)</Label>
                  <Input
                    type="number"
                    value={form.cost}
                    onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                    placeholder="авто"
                    className="bg-input border-border"
                  />
                </div>
              </div>
              {form.reach && form.spm && calcCostFromSpm(form.reach, form.spm) && (
                <p className="text-xs text-primary/80">
                  = {form.reach} × {form.spm.match(/[\d.,]+/)?.[0] ?? "?"} / 1000 ={" "}
                  <strong>{calcCostFromSpm(form.reach, form.spm)} ₽</strong>
                </p>
              )}
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Ссылка (MAX/TG)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.link}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, link: e.target.value }));
                    if (linkAnalyzeStatus !== "idle") { setLinkAnalyzeStatus("idle"); setLinkAnalyzeResult(null); }
                  }}
                  placeholder="https://iimax.ru/..."
                  className="bg-input border-border flex-1"
                />
                {form.link.startsWith("http") && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`shrink-0 gap-1.5 transition-all duration-300 ${
                      linkAnalyzeStatus === "loading"
                        ? "bg-violet-500/20 border-violet-400/60 text-violet-300 animate-pulse cursor-wait"
                        : linkAnalyzeStatus === "done"
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20"
                        : linkAnalyzeStatus === "error"
                        ? "bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20"
                        : "bg-transparent border-violet-500/40 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300"
                    }`}
                    onClick={handleAnalyzeLink}
                    disabled={linkAnalyzeStatus === "loading"}
                    title="Извлечь данные из ссылки"
                  >
                    {linkAnalyzeStatus === "loading" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : linkAnalyzeStatus === "done" ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : linkAnalyzeStatus === "error" ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span className="text-xs hidden sm:inline">
                      {linkAnalyzeStatus === "loading" ? "Анализ..." : linkAnalyzeStatus === "done" ? "Готово" : linkAnalyzeStatus === "error" ? "Повтор" : "Извлечь"}
                    </span>
                  </Button>
                )}
              </div>
              {/* Loading overlay */}
              {linkAnalyzeStatus === "loading" && (
                <div className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 flex items-center gap-3 animate-in fade-in duration-300">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full border-2 border-violet-500/20 border-t-violet-400 animate-spin" />
                    <Zap className="w-3.5 h-3.5 text-violet-400 absolute inset-0 m-auto" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-violet-300">Анализирую ссылку...</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Извлекаю статистику поста</p>
                  </div>
                </div>
              )}
              {/* Error */}
              {linkAnalyzeStatus === "error" && (
                <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-2 animate-in fade-in duration-300">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-red-400">Ошибка анализа</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{linkAnalyzeError}</p>
                  </div>
                </div>
              )}
              {/* Result panel */}
              {linkAnalyzeStatus === "done" && linkAnalyzeResult && (
                <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-400">Данные извлечены</span>
                    {linkAnalyzeResult.draftName && (
                      <span className="text-xs text-muted-foreground truncate ml-auto">{linkAnalyzeResult.draftName}</span>
                    )}
                  </div>
                  {linkAnalyzeResult.posts && linkAnalyzeResult.posts.length > 1 ? (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Выберите канал для заполнения:</p>
                      {linkAnalyzeResult.posts.map((post: any, i: number) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { applyPostData(post); toast.success(`Канал «${post.channelTitle ?? i + 1}» выбран`); }}
                          className="w-full text-left rounded-md border border-emerald-500/20 bg-card px-3 py-2.5 text-xs hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-all duration-200 active:scale-[0.98]"
                        >
                          <div className="font-medium text-foreground">{post.channelTitle ?? `Канал ${i + 1}`}</div>
                          <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                            {post.channelSubs != null && <span>👥 {post.channelSubs.toLocaleString()}</span>}
                            {post.views24h != null && <span>👁 {post.views24h.toLocaleString()}</span>}
                            {post.er24h != null && <span>ER {post.er24h}%</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : linkAnalyzeResult.posts && linkAnalyzeResult.posts.length === 1 ? (
                    <div className="text-xs space-y-1">
                      {linkAnalyzeResult.posts[0].channelTitle && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Канал</span><span className="text-foreground font-medium">{linkAnalyzeResult.posts[0].channelTitle}</span></div>
                      )}
                      {linkAnalyzeResult.posts[0].views24h != null && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Охваты 24ч</span><span className="text-foreground font-medium">{linkAnalyzeResult.posts[0].views24h.toLocaleString()}</span></div>
                      )}
                      {linkAnalyzeResult.posts[0].er24h != null && (
                        <div className="flex justify-between"><span className="text-muted-foreground">ER 24ч</span><span className="text-foreground font-medium">{linkAnalyzeResult.posts[0].er24h}%</span></div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Платформа</Label>
              <AutocompleteInput
                value={form.platform}
                onChange={(v) => setForm((f) => ({ ...f, platform: v }))}
                suggestions={suggestions?.platforms ?? []}
                placeholder="Сетка, MAX, TG..."
                className="bg-input border-border"
              />
            </div>

            {/* Buyer channel size */}
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs text-muted-foreground">Подписчики канала-покупателя (приблизительно)</Label>
              <Input
                type="number"
                value={form.buyerSubscribers}
                onChange={(e) => setForm((f) => ({ ...f, buyerSubscribers: e.target.value }))}
                placeholder="Например: 30000"
                className="bg-input border-border"
                min={0}
              />
            </div>

            {/* Post not needed checkbox */}
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.postNotNeeded}
                  onChange={(e) => setForm((f) => ({ ...f, postNotNeeded: e.target.checked }))}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm text-muted-foreground">Пост не нужен (автобот)</span>
              </label>
            </div>
            {/* External advertiser toggle: use a large explicit tap target on mobile. */}
            <div className="col-span-2">
              <button
                type="button"
                role="switch"
                aria-checked={form.isExternal}
                onClick={() => setForm((f) => ({ ...f, isExternal: !f.isExternal }))}
                className={`flex w-full min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors active:scale-[0.98] ${
                  form.isExternal
                    ? "border-orange-300 bg-orange-500 text-slate-950 shadow-[0_0_0_2px_rgba(249,115,22,0.35)]"
                    : "border-border bg-slate-900 text-muted-foreground hover:bg-accent"
                }}`}
                style={{
                  backgroundColor: form.isExternal ? "#f97316" : "#0f172a",
                  color: form.isExternal ? "#0f172a" : "#cbd5e1",
                  borderColor: form.isExternal ? "#fdba74" : "#475569",
                }}
              >
                <span className="text-sm font-medium">Внешка (внешний рекламодатель)</span>
                <span className="text-xs font-bold uppercase tracking-wide">{form.isExternal ? "Включена" : "Выключена"}</span>
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.isExternal ? "bg-orange-500" : "bg-muted"}`}
                  style={{ backgroundColor: form.isExternal ? "#9a3412" : "#475569" }}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${form.isExternal ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </span>
              </button>
            </div>

            {/* ВП toggle: explicit button makes the tap target reliable on mobile browsers. */}
            <div className="col-span-2">
              <button
                type="button"
                role="switch"
                aria-checked={form.isMutual}
                onClick={() => setForm((f) => ({ ...f, isMutual: !f.isMutual }))}
                className={`flex w-full min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors active:scale-[0.98] ${
                  form.isMutual
                    ? "border-violet-500/60 bg-violet-500/15 text-violet-300"
                    : "border-border bg-muted/20 text-muted-foreground hover:bg-accent"
                }`}
              >
                <span className="text-sm font-medium">Взаимная подписка (ВП)</span>
                <span
                  aria-hidden="true"
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.isMutual ? "bg-violet-500" : "bg-muted"}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${form.isMutual ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </span>
              </button>
            </div>

            {/* ВП conditional fields */}
            {form.isMutual && (
              <>
                {/* Auto-link suggestion panel */}
                {adminForSearch.length >= 2 && (
                  <div className="col-span-2 rounded-lg border border-violet-500/30 bg-violet-950/20 p-3 space-y-2">
                    <p className="text-xs font-medium text-violet-400">Связанные записи по админу «{adminForSearch}»</p>
                    {linkedByAdminQuery.isLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />Поиск...
                      </div>
                    )}
                    {linkedByAdminQuery.data && (
                      <div className="space-y-1.5">
                        {linkedByAdminQuery.data.sales.length > 0 && (
                          <div>
                            <p className="text-xs text-emerald-400 font-medium mb-1">Продажи:</p>
                            {linkedByAdminQuery.data.sales.map((s) => (
                              <div key={s.id} className="flex items-center justify-between gap-2 text-xs bg-emerald-950/30 border border-emerald-500/20 rounded px-2 py-1.5">
                                <span className="text-emerald-300 flex-1">
                                  #{s.id} • {s.date ? new Date(s.date).toLocaleDateString("ru-RU") : ""} • {s.cost ? `${s.cost}₽` : "без цены"}{s.isMutual ? " • ВП" : ""}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setForm((f) => ({ ...f, partnerChannel: s.admin ?? "" })); }}
                                  className="shrink-0 cursor-pointer rounded bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-medium px-2 py-0.5 select-none"
                                >Использовать</button>
                              </div>
                            ))}
                          </div>
                        )}
                        {linkedByAdminQuery.data.purchases.length > 0 && (
                          <div>
                            <p className="text-xs text-blue-400 font-medium mb-1">Другие закупы:</p>
                            {linkedByAdminQuery.data.purchases.map((p) => (
                              <div key={p.id} className="flex items-center justify-between gap-2 text-xs bg-blue-950/30 border border-blue-500/20 rounded px-2 py-1.5">
                                <span className="text-blue-300 flex-1">
                                  #{p.id} • {p.date ? new Date(p.date).toLocaleDateString("ru-RU") : ""} • {p.cost ? `${p.cost}₽` : "без цены"}{p.isMutual ? " • ВП" : ""}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setForm((f) => ({ ...f, partnerChannel: p.admin ?? "" })); }}
                                  className="shrink-0 cursor-pointer rounded bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium px-2 py-0.5 select-none"
                                >Использовать</button>
                              </div>
                            ))}
                          </div>
                        )}
                        {linkedByAdminQuery.data.sales.length === 0 && linkedByAdminQuery.data.purchases.length === 0 && (
                          <p className="text-xs text-muted-foreground">Связанных записей не найдено</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1.5 col-span-2">
                  <Label>Канал-партнёр</Label>
                  <Input
                    value={form.partnerChannel}
                    onChange={(e) => setForm((f) => ({ ...f, partnerChannel: e.target.value }))}
                    placeholder="Название канала партнёра"
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Наши охваты</Label>
                  <Input
                    type="number"
                    value={form.ourReach}
                    onChange={(e) => setForm((f) => ({ ...f, ourReach: e.target.value }))}
                    placeholder="Например: 5000"
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Охваты партнёра</Label>
                  <Input
                    type="number"
                    value={form.partnerReach}
                    onChange={(e) => setForm((f) => ({ ...f, partnerReach: e.target.value }))}
                    placeholder="Например: 3000"
                    className="bg-input border-border"
                  />
                </div>
                {/* Reach difference hint */}
                {form.ourReach && form.partnerReach && (
                  <div className="col-span-2 rounded-lg bg-violet-500/10 border border-violet-500/20 px-3 py-2">
                    <p className="text-xs text-violet-300">
                      Разница охватов: {Math.abs(Number(form.ourReach) - Number(form.partnerReach)).toLocaleString("ru-RU")}
                      {Number(form.ourReach) > Number(form.partnerReach)
                        ? " — партнёр должен доплатить"
                        : Number(form.ourReach) < Number(form.partnerReach)
                        ? " — мы доплачиваем"
                        : " — охваты равны"}
                    </p>
                  </div>
                )}
                <div className="space-y-1.5 col-span-2">
                  <Label>Доплата</Label>
                  <Select
                    value={form.dopDirection}
                    onValueChange={(v) => setForm((f) => ({ ...f, dopDirection: v as "we_pay" | "they_pay" | "none" }))}
                  >
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue placeholder="Тип доплаты" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без доплаты</SelectItem>
                      <SelectItem value="we_pay">Мы платим</SelectItem>
                      <SelectItem value="they_pay">Нам платят</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.dopDirection !== "none" && (
                  <div className="space-y-1.5 col-span-2">
                    <Label>Сумма доплаты (₽)</Label>
                    <Input
                      type="number"
                      value={form.dopAmount}
                      onChange={(e) => setForm((f) => ({ ...f, dopAmount: e.target.value }))}
                      placeholder="0"
                      className="bg-input border-border"
                    />
                  </div>
                )}
              </>
            )}

            <div className="space-y-1.5 col-span-2">
              <Label>Заметки</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Дополнительные заметки"
                rows={2}
                className="bg-input border-border resize-none"
              />
            </div>
          </div>

          {conflictError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2.5 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{conflictError}</span>
              {onClearConflict && (
                <button
                  type="button"
                  onClick={onClearConflict}
                  className="ml-1 text-red-400/60 hover:text-red-400 transition-colors"
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
