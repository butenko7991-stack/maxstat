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

export type PaymentStatus = "paid" | "unpaid" | "partial";
export type TimeSlot = "утро" | "обед" | "вечер" | "ночной топ";

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
  timeSlot: TimeSlot | "";
  tariff: string;
  platform: string;
  spm: string;
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
              <Label>Стоимость (₽)</Label>
              <Input
                type="number"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                placeholder="0"
                className="bg-input border-border"
              />
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
              <Label>Тариф</Label>
              <Input
                value={form.tariff}
                onChange={(e) => setForm((f) => ({ ...f, tariff: e.target.value }))}
                placeholder="1/48, фикс..."
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

            <div className="space-y-1.5">
              <Label>СПМ</Label>
              <Input
                value={form.spm}
                onChange={(e) => setForm((f) => ({ ...f, spm: e.target.value }))}
                placeholder="1000СПМ, фикс..."
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
              <Select
                value={form.timeSlot || "none"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, timeSlot: v === "none" ? "" : (v as TimeSlot) }))
                }
              >
                <SelectTrigger className="bg-input border-border">
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="утро">утро</SelectItem>
                  <SelectItem value="обед">обед</SelectItem>
                  <SelectItem value="вечер">вечер</SelectItem>
                  <SelectItem value="ночной топ">ночной топ</SelectItem>
                </SelectContent>
              </Select>
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
              <Label>Стоимость (₽)</Label>
              <Input
                type="number"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                placeholder="0"
                className="bg-input border-border"
              />
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
              <Label>СПМ</Label>
              <Input
                value={form.spm}
                onChange={(e) => setForm((f) => ({ ...f, spm: e.target.value }))}
                placeholder="1000СПМ, фикс..."
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
