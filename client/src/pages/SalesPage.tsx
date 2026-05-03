import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Plus, TrendingUp, Pencil, Trash2, X, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaymentBadge } from "@/components/PaymentBadge";
import {
  SaleFormModal,
  type SaleFormData,
  type PaymentStatus,
  type TimeSlot,
} from "@/components/RecordFormModal";
import { formatMonthLabel, formatCost, todayIso, currentMonth } from "@/lib/utils";

const EMPTY_FORM: SaleFormData = {
  channelId: "",
  date: todayIso(),
  admin: "",
  link: "",
  timeSlot: "",
  tariff: "",
  platform: "",
  spm: "",
  cost: "",
  paymentStatus: "unpaid",
  botStories: "",
  botStoriesCost: "",
  month: currentMonth(),
  notes: "",
};

const TIME_SLOT_COLORS: Record<string, string> = {
  утро: "text-amber-400 bg-amber-400/10",
  обед: "text-orange-400 bg-orange-400/10",
  вечер: "text-violet-400 bg-violet-400/10",
  "ночной топ": "text-blue-400 bg-blue-400/10",
};

export default function SalesPage() {
  const utils = trpc.useUtils();
  const { data: channels } = trpc.channels.list.useQuery();
  const { data: months } = trpc.summary.months.useQuery();

  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedPayment, setSelectedPayment] = useState<string>("all");
  const [selectedChannel, setSelectedChannel] = useState<string>("all");

  const { data: records, isLoading } = trpc.sales.list.useQuery({
    channelId: selectedChannel !== "all" ? Number(selectedChannel) : undefined,
    month: selectedMonth !== "all" ? selectedMonth : undefined,
    paymentStatus: selectedPayment !== "all" ? selectedPayment : undefined,
  });

  const createMutation = trpc.sales.create.useMutation({
    onSuccess: () => {
      utils.sales.list.invalidate();
      utils.summary.financial.invalidate();
      utils.summary.months.invalidate();
      toast.success("Запись добавлена");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.sales.update.useMutation({
    onSuccess: () => {
      utils.sales.list.invalidate();
      utils.summary.financial.invalidate();
      toast.success("Запись обновлена");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.sales.delete.useMutation({
    onSuccess: () => {
      utils.sales.list.invalidate();
      utils.summary.financial.invalidate();
      toast.success("Запись удалена");
    },
    onError: (e) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SaleFormData>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const channelMap = useMemo(
    () => Object.fromEntries((channels ?? []).map((c) => [c.id, c.name])),
    [channels]
  );

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(r: NonNullable<typeof records>[number]) {
    setEditingId(r.id);
    setForm({
      channelId: String(r.channelId),
      date: r.date ? new Date(r.date).toISOString().slice(0, 10) : todayIso(),
      admin: r.admin ?? "",
      link: r.link ?? "",
      timeSlot: (r.timeSlot as TimeSlot) ?? "",
      tariff: r.tariff ?? "",
      platform: r.platform ?? "",
      spm: r.spm ?? "",
      cost: r.cost ?? "",
      paymentStatus: (r.paymentStatus as PaymentStatus) ?? "unpaid",
      botStories: r.botStories ?? "",
      botStoriesCost: r.botStoriesCost ?? "",
      month: r.month,
      notes: r.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.channelId || !form.date) return;
    const payload = {
      channelId: Number(form.channelId),
      date: form.date,
      admin: form.admin || undefined,
      link: form.link || undefined,
      timeSlot: (form.timeSlot || undefined) as TimeSlot | undefined,
      tariff: form.tariff || undefined,
      platform: form.platform || undefined,
      spm: form.spm || undefined,
      cost: form.cost || undefined,
      paymentStatus: form.paymentStatus,
      botStories: form.botStories || undefined,
      botStoriesCost: form.botStoriesCost || undefined,
      month: form.month,
      notes: form.notes || undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const totalRevenue = useMemo(
    () => (records ?? []).reduce((s, r) => s + (parseFloat(r.cost ?? "0") || 0), 0),
    [records]
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Продажа</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Продажа рекламных размещений</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Добавить</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={selectedChannel} onValueChange={setSelectedChannel}>
          <SelectTrigger className="w-40 bg-card border-border text-sm h-9">
            <SelectValue placeholder="Все каналы" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">Все каналы</SelectItem>
            {(channels ?? []).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40 bg-card border-border text-sm h-9">
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

        <Select value={selectedPayment} onValueChange={setSelectedPayment}>
          <SelectTrigger className="w-40 bg-card border-border text-sm h-9">
            <SelectValue placeholder="Оплата" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="paid">Оплачено</SelectItem>
            <SelectItem value="unpaid">Не оплачено</SelectItem>
            <SelectItem value="partial">Частично</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary bar */}
      {(records?.length ?? 0) > 0 && (
        <div className="glass rounded-xl px-4 py-3 flex items-center gap-6 text-sm">
          <span className="text-muted-foreground">
            Записей: <span className="text-foreground font-medium">{records?.length}</span>
          </span>
          <span className="text-muted-foreground">
            Итого: <span className="text-profit font-semibold">{formatCost(totalRevenue)} ₽</span>
          </span>
        </div>
      )}

      {/* Records */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : !records?.length ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
            <TrendingUp className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Нет записей по выбранным фильтрам</p>
          <Button onClick={openCreate} variant="outline" size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Добавить запись
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.id} className="glass rounded-xl p-3.5 group">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {channelMap[r.channelId] ?? "—"}
                    </span>
                    <PaymentBadge status={r.paymentStatus as PaymentStatus} />
                    {r.timeSlot && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIME_SLOT_COLORS[r.timeSlot] ?? "text-muted-foreground bg-muted"}`}
                      >
                        {r.timeSlot}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-medium text-foreground">
                      {r.admin || "—"}
                    </span>
                    {r.date && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.date).toLocaleDateString("ru-RU")}
                      </span>
                    )}
                    {r.platform && (
                      <span className="text-xs text-muted-foreground">{r.platform}</span>
                    )}
                    {r.tariff && (
                      <span className="text-xs text-muted-foreground">{r.tariff}</span>
                    )}
                    {r.spm && (
                      <span className="text-xs text-muted-foreground">{r.spm}</span>
                    )}
                  </div>
                  {r.link && (
                    <a
                      href={r.link.startsWith("http") ? r.link : `https://${r.link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 truncate max-w-xs"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{r.link}</span>
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-sm font-semibold text-profit">
                    {r.cost ? `${formatCost(parseFloat(r.cost))} ₽` : "—"}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(r)}
                      className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {deleteConfirmId === r.id ? (
                      <>
                        <button
                          onClick={() => {
                            deleteMutation.mutate({ id: r.id });
                            setDeleteConfirmId(null);
                          }}
                          className="p-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 transition-colors text-destructive"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(r.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/15 transition-colors text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <SaleFormModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? "Редактировать продажу" : "Новая запись продажи"}
        channels={channels ?? []}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        isPending={isPending}
      />
    </div>
  );
}
