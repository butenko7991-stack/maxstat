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
import { useEffect } from "react";
import { Calculator } from "lucide-react";

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
  reach: string; // audience reach for SPM cost calculation
  cost: string;
  paymentStatus: PaymentStatus;
  botStories: string;
  botStoriesCost: string;
  month: string;
  notes: string;
}

export interface SaleFormData {
  channelId: string;
  date: string;
  admin: string;
  link: string;
  timeSlot: string;
  tariff: string;
  platform: string;
  spm: string;
  reach: string; // audience reach for SPM cost calculation
  cost: string;
  paymentStatus: PaymentStatus;
  botStories: string;
  botStoriesCost: string;
  month: string;
  notes: string;
}

interface Channel {
  id: number;
  name: string;
}

/**
 * Calculates cost from reach and SPM value.
 * SPM field can be a plain number (e.g. "1000") or text like "1000СПМ".
 * Formula: cost = (reach × spmValue) / 1000
 */
function calcCostFromSpm(reach: string, spm: string): string {
  const reachNum = parseFloat(reach);
  // Extract numeric part from spm string (e.g. "1000СПМ" → 1000, "1500" → 1500)
  const spmMatch = spm.match(/[\d.,]+/);
  if (!spmMatch) return "";
  const spmNum = parseFloat(spmMatch[0].replace(",", "."));
  if (!isFinite(reachNum) || !isFinite(spmNum) || reachNum <= 0 || spmNum <= 0) return "";
  return String(Math.round((reachNum * spmNum) / 1000));
}

interface PurchaseFormModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  channels: Channel[];
  form: PurchaseFormData;
  setForm: React.Dispatch<React.SetStateAction<PurchaseFormData>>;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
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
}: PurchaseFormModalProps) {
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
              <Input
                value={form.admin}
                onChange={(e) => setForm((f) => ({ ...f, admin: e.target.value }))}
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
                  = {form.reach} × {form.spm.match(/[\d.,]+/)?.[0] ?? "?"} / 1000 = <strong>{calcCostFromSpm(form.reach, form.spm)} ₽</strong>
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
              <Input
                value={form.direction}
                onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}
                placeholder="психология, мода..."
                className="bg-input border-border"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Закупщик</Label>
              <Input
                value={form.buyer}
                onChange={(e) => setForm((f) => ({ ...f, buyer: e.target.value }))}
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

            <div className="space-y-1.5">
              <Label>Бот/Сторис</Label>
              <Input
                value={form.botStories}
                onChange={(e) => setForm((f) => ({ ...f, botStories: e.target.value }))}
                placeholder="Описание"
                className="bg-input border-border"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Стоимость бот/сторис (₽)</Label>
              <Input
                type="number"
                value={form.botStoriesCost}
                onChange={(e) => setForm((f) => ({ ...f, botStoriesCost: e.target.value }))}
                placeholder="0"
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
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
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

interface SaleFormModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  channels: Channel[];
  form: SaleFormData;
  setForm: React.Dispatch<React.SetStateAction<SaleFormData>>;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
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
              <Label>Время</Label>
              <Input
                value={form.timeSlot}
                onChange={(e) => setForm((f) => ({ ...f, timeSlot: e.target.value }))}
                placeholder="утро, 10:00, вечер..."
                className="bg-input border-border"
              />
            </div>

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
              <Input
                value={form.admin}
                onChange={(e) => setForm((f) => ({ ...f, admin: e.target.value }))}
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
                  = {form.reach} × {form.spm.match(/[\d.,]+/)?.[0] ?? "?"} / 1000 = <strong>{calcCostFromSpm(form.reach, form.spm)} ₽</strong>
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
              <Input
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                placeholder="Сетка, MAX, TG..."
                className="bg-input border-border"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Бот/Сторис</Label>
              <Input
                value={form.botStories}
                onChange={(e) => setForm((f) => ({ ...f, botStories: e.target.value }))}
                placeholder="Описание"
                className="bg-input border-border"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Стоимость бот/сторис (₽)</Label>
              <Input
                type="number"
                value={form.botStoriesCost}
                onChange={(e) => setForm((f) => ({ ...f, botStoriesCost: e.target.value }))}
                placeholder="0"
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
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
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
