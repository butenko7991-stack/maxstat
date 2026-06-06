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
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Calculator, Camera, CheckCircle2, Loader2 } from "lucide-react";
import { AutocompleteInput } from "./AutocompleteInput";
import { trpc } from "@/lib/trpc";

export type PaymentStatus = "paid" | "unpaid" | "partial";
export type TimeSlot = string;

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
  bookingSlot: "утро" | "обед" | "вечер" | "";
  sourceSubscribers: string; // approx size of source channel (optional)
}

export interface SaleFormData {
  channelId: string;
  date: string;
  admin: string;
  link: string;
  timeSlot: string;
  bookingSlot: "утро" | "обед" | "вечер" | "";
  tariff: string;
  platform: string;
  spm: string;
  reach: string;
  cost: string;
  paymentStatus: PaymentStatus;
  month: string;
  postNotNeeded: boolean;
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
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, paymentStatus: v as PaymentStatus }))
                }
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

            <div className="space-y-1.5">
              <Label>Тариф</Label>
              <Input
                value={form.tariff}
                onChange={(e) => setForm((f) => ({ ...f, tariff: e.target.value }))}
                placeholder="1/48, фикс..."
                className="bg-input border-border"
              />
            </div>

            {/* SPM + Reach + Auto-calculated cost block */}
            <div className="col-span-2 rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <Calculator className="w-3.5 h-3.5" />
                Расчёт по СПМ: Охваты × СПМ / 1000
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Охваты</Label>
                  <Input
                    type="number"
                    value={form.reach}
                    onChange={(e) => setForm((f) => ({ ...f, reach: e.target.value }))}
                    placeholder="500"
                    className="bg-input border-border"
                    min={0}
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
              <Input
                value={form.link}
                onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                placeholder="https://iimax.ru/..."
                className="bg-input border-border"
              />
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
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, bookingSlot: (v === "none" ? "" : v) as "утро" | "обед" | "вечер" | "" }))
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
                      setForm((f) => ({ ...f, bookingSlot: (v === "none" ? "" : v) as "утро" | "обед" | "вечер" | "" }))
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
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, paymentStatus: v as PaymentStatus }))
                }
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

            <div className="space-y-1.5">
              <Label>Тариф</Label>
              <Input
                value={form.tariff}
                onChange={(e) => setForm((f) => ({ ...f, tariff: e.target.value }))}
                placeholder="1/48, фикс..."
                className="bg-input border-border"
              />
            </div>

            {/* SPM + Reach + Auto-calculated cost block */}
            <div className="col-span-2 rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <Calculator className="w-3.5 h-3.5" />
                Расчёт по СПМ: Охваты × СПМ / 1000
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Охваты</Label>
                  <Input
                    type="number"
                    value={form.reach}
                    onChange={(e) => setForm((f) => ({ ...f, reach: e.target.value }))}
                    placeholder="500"
                    className="bg-input border-border"
                    min={0}
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
              <Input
                value={form.link}
                onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                placeholder="https://iimax.ru/..."
                className="bg-input border-border"
              />
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
