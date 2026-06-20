import { trpc } from "@/lib/trpc";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Plus, ShoppingCart, Pencil, Trash2, X, Check,
  ExternalLink, Copy, Download, Search, ArrowUpDown, ChevronRight,
  Users, DollarSign, Calendar, Tag, Link2, FileText, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PurchaseFormModal,
  type PurchaseFormData,
  type PaymentStatus,
  type AutocompleteSuggestions,
} from "@/components/RecordFormModal";
import { formatMonthLabel, formatCost, todayIso, currentMonth } from "@/lib/utils";
import * as XLSX from "xlsx";
import { PostAnalyticsBadge } from "@/components/PostAnalyticsBadge";

const EMPTY_FORM: PurchaseFormData = {
  channelId: "", date: todayIso(), admin: "", link: "", targetChannels: "",
  direction: "", tariff: "", buyer: "", spm: "", reach: "", cost: "", paymentStatus: "unpaid",
  subscribersGained: "", month: currentMonth(), notes: "",
  timeSlot: "", bookingSlot: "", sourceSubscribers: "",
};

const PAYMENT_CYCLE: Record<PaymentStatus, PaymentStatus> = {
  unpaid: "partial",
  partial: "paid",
  paid: "unpaid",
};

const PAYMENT_LABELS: Record<string, string> = {
  paid: "Оплачено", unpaid: "Не оплачено", partial: "Частично",
};

const PAYMENT_CLASSES: Record<string, string> = {
  paid: "badge-paid cursor-pointer hover:opacity-75 transition-opacity select-none",
  unpaid: "badge-unpaid cursor-pointer hover:opacity-75 transition-opacity select-none",
  partial: "badge-partial cursor-pointer hover:opacity-75 transition-opacity select-none",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PurchaseDetailDrawer({ record, channelMap, onClose, onEdit }: { record: any; channelMap: Record<number, string>; onClose: () => void; onEdit: () => void }) {
  const r = record;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      {/* Drawer */}
      <div
        className="relative w-full max-w-md bg-card border-l border-border h-full overflow-y-auto shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground">Детали закупа</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 bg-transparent" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5" />
              Редактировать
            </Button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 flex-1">
          {/* Channel + Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
              {channelMap[r.channelId] ?? "—"}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              r.paymentStatus === "paid" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
              r.paymentStatus === "partial" ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
              "bg-red-500/20 text-red-400 border border-red-500/30"
            }`}>
              {PAYMENT_LABELS[r.paymentStatus] ?? r.paymentStatus}
            </span>
            {r.isMutual && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-500/20 text-violet-400 border border-violet-500/30">
                ⇄ ВП{r.partnerChannel ? `: ${r.partnerChannel}` : ""}
              </span>
            )}
          </div>

          {/* Main info grid */}
          <div className="grid grid-cols-2 gap-3">
            {r.admin && (
              <div className="glass rounded-xl p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Админ</p>
                <p className="text-sm font-medium text-foreground">{r.admin}</p>
              </div>
            )}
            {r.date && (
              <div className="glass rounded-xl p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Дата</p>
                <p className="text-sm font-medium text-foreground">{new Date(r.date).toLocaleDateString("ru-RU")}</p>
              </div>
            )}
            {r.cost && (
              <div className="glass rounded-xl p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Стоимость</p>
                <p className="text-sm font-semibold text-loss">{formatCost(parseFloat(r.cost))} ₽</p>
              </div>
            )}
            {r.subscribersGained != null && r.subscribersGained > 0 && (
              <div className="glass rounded-xl p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Привлечено</p>
                <p className="text-sm font-semibold text-emerald-400">+{r.subscribersGained} подп.</p>
                {r.cost && <p className="text-xs text-muted-foreground">{Math.round(parseFloat(r.cost) / r.subscribersGained)} ₽/подп.</p>}
              </div>
            )}
            {r.tariff && (
              <div className="glass rounded-xl p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Tag className="w-3 h-3" /> Тариф</p>
                <p className="text-sm font-medium text-foreground">{r.tariff}</p>
              </div>
            )}
            {r.spm && (
              <div className="glass rounded-xl p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">СПМ</p>
                <p className="text-sm font-medium text-foreground">{r.spm}</p>
              </div>
            )}
            {r.reach != null && r.reach > 0 && (
              <div className="glass rounded-xl p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">Охват</p>
                <p className="text-sm font-medium text-foreground">{r.reach.toLocaleString("ru-RU")}</p>
              </div>
            )}
            {r.sourceSubscribers != null && r.sourceSubscribers > 0 && (
              <div className="glass rounded-xl p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">Подп. источника</p>
                <p className="text-sm font-medium text-foreground">{r.sourceSubscribers.toLocaleString("ru-RU")}</p>
              </div>
            )}
            {r.timeSlot && (
              <div className="glass rounded-xl p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">Время</p>
                <p className="text-sm font-medium text-foreground">{r.timeSlot}</p>
              </div>
            )}
            {r.bookingSlot && (
              <div className="glass rounded-xl p-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">Слот</p>
                <p className="text-sm font-medium text-foreground capitalize">{r.bookingSlot}</p>
              </div>
            )}
          </div>

          {/* Direction / buyer */}
          {(r.direction || r.buyer) && (
            <div className="glass rounded-xl p-3 space-y-2">
              {r.direction && (
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">Направление:</span>
                  <span className="text-sm text-foreground">{r.direction}</span>
                </div>
              )}
              {r.buyer && (
                <div className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">Закупщик:</span>
                  <span className="text-sm text-foreground">{r.buyer}</span>
                </div>
              )}
            </div>
          )}

          {/* Target channels */}
          {r.targetChannels && (
            <div className="glass rounded-xl p-3 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Layers className="w-3 h-3" /> Целевые каналы</p>
              <p className="text-sm text-foreground">{r.targetChannels}</p>
            </div>
          )}

          {/* Link */}
          {r.link && (
            <div className="glass rounded-xl p-3 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Link2 className="w-3 h-3" /> Ссылка</p>
              <a
                href={r.link.startsWith("http") ? r.link : `https://${r.link}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 break-all"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                {r.link}
              </a>
            </div>
          )}

          {/* Post analytics */}
          <PostAnalyticsBadge
            recordType="purchase"
            recordId={r.id}
            link={r.link}
            paymentStatus={r.paymentStatus}
          />

          {/* Notes */}
          {r.notes && (
            <div className="glass rounded-xl p-3 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><FileText className="w-3 h-3" /> Заметки</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{r.notes}</p>
            </div>
          )}

          {/* Month */}
          <div className="text-xs text-muted-foreground text-right">
            Месяц: {formatMonthLabel(r.month)} · ID: {r.id}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  const utils = trpc.useUtils();
  const { data: channels } = trpc.channels.list.useQuery();
  const { data: months } = trpc.summary.months.useQuery();

  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedPayment, setSelectedPayment] = useState<string>("all");
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<"date" | "cost" | "paymentStatus">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PurchaseFormData>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [exportPending, setExportPending] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [viewRecord, setViewRecord] = useState<any | null>(null);

  const listInput = useMemo(() => ({
    channelId: selectedChannel !== "all" ? Number(selectedChannel) : undefined,
    month: selectedMonth !== "all" ? selectedMonth : undefined,
    paymentStatus: selectedPayment !== "all" ? selectedPayment : undefined,
  }), [selectedChannel, selectedMonth, selectedPayment]);

  const { data: records, isLoading } = trpc.purchases.list.useQuery(listInput);
  const { data: autocompleteData } = trpc.summary.autocomplete.useQuery();
  const suggestions: AutocompleteSuggestions = {
    admins: autocompleteData?.admins ?? [],
    directions: autocompleteData?.directions ?? [],
    buyers: autocompleteData?.buyers ?? [],
    platforms: autocompleteData?.platforms ?? [],
  };

  const { data: exportData, isFetching: exportFetching, refetch: refetchExport } =
    trpc.purchases.exportData.useQuery(
      { month: selectedMonth !== "all" ? selectedMonth : undefined,
        channelId: selectedChannel !== "all" ? Number(selectedChannel) : undefined },
      { enabled: false }
    );

  const createMutation = trpc.purchases.create.useMutation({
    onSuccess: () => { utils.purchases.list.invalidate(); utils.summary.financial.invalidate(); utils.summary.months.invalidate(); toast.success("Запись добавлена"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.purchases.update.useMutation({
    onSuccess: () => { utils.purchases.list.invalidate(); utils.summary.financial.invalidate(); toast.success("Запись обновлена"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.purchases.delete.useMutation({
    onSuccess: () => { utils.purchases.list.invalidate(); utils.summary.financial.invalidate(); toast.success("Запись удалена"); },
    onError: (e) => toast.error(e.message),
  });
  const quickPayMutation = trpc.purchases.quickUpdatePayment.useMutation({
    onMutate: async ({ id, paymentStatus }) => {
      await utils.purchases.list.cancel(listInput);
      const prev = utils.purchases.list.getData(listInput);
      utils.purchases.list.setData(listInput, (old) =>
        old?.map((r) => r.id === id ? { ...r, paymentStatus } : r)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.purchases.list.setData(listInput, () => ctx.prev);
      toast.error("Ошибка обновления");
    },
    onSettled: () => { utils.purchases.list.invalidate(); utils.summary.financial.invalidate(); },
  });
  const duplicateMutation = trpc.purchases.duplicate.useMutation({
    onSuccess: () => { utils.purchases.list.invalidate(); utils.summary.financial.invalidate(); toast.success("Запись скопирована"); },
    onError: (e) => toast.error(e.message),
  });

  const channelMap = useMemo(
    () => Object.fromEntries((channels ?? []).map((c) => [c.id, c.name])),
    [channels]
  );

  const filteredRecords = useMemo(() => {
    let list = records ?? [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) =>
        (r.admin ?? "").toLowerCase().includes(q) ||
        (r.link ?? "").toLowerCase().includes(q) ||
        (r.direction ?? "").toLowerCase().includes(q) ||
        (r.targetChannels ?? "").toLowerCase().includes(q) ||
        (r.buyer ?? "").toLowerCase().includes(q) ||
        (channelMap[r.channelId] ?? "").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime();
      } else if (sortField === "cost") {
        cmp = (parseFloat(a.cost ?? "0") || 0) - (parseFloat(b.cost ?? "0") || 0);
      } else if (sortField === "paymentStatus") {
        const order: Record<string, number> = { unpaid: 0, partial: 1, paid: 2 };
        cmp = (order[a.paymentStatus] ?? 0) - (order[b.paymentStatus] ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [records, searchQuery, channelMap, sortField, sortDir]);

  const totalCost = useMemo(
    () => filteredRecords.reduce((s, r) => s + (parseFloat(r.cost ?? "0") || 0), 0),
    [filteredRecords]
  );
  const totalSubscribers = useMemo(
    () => filteredRecords.reduce((s, r) => s + (r.subscribersGained ?? 0), 0),
    [filteredRecords]
  );
  const avgCostPerSub = totalSubscribers > 0 ? Math.round(totalCost / totalSubscribers) : null;

  // Export effect: when exportData arrives after user click, build xlsx
  useEffect(() => {
    if (!exportPending) return;
    if (exportFetching) return;
    if (!exportData) {
      setExportPending(false);
      toast.error("Не удалось получить данные для экспорта");
      return;
    }
    const rows = exportData.map((r) => ({
      "Дата": r.date ? new Date(r.date).toLocaleDateString("ru-RU") : "",
      "Канал": channelMap[r.channelId] ?? "",
      "Админ": r.admin ?? "",
      "Ссылка": r.link ?? "",
      "Каналы": r.targetChannels ?? "",
      "Направление": r.direction ?? "",
      "Тариф": r.tariff ?? "",
      "Закупщик": r.buyer ?? "",
      "СПМ": r.spm ?? "",
      "Стоимость": r.cost ? parseFloat(r.cost) : "",
      "Оплата": PAYMENT_LABELS[r.paymentStatus] ?? r.paymentStatus,
      "Пришло подписчиков": r.subscribersGained ?? "",
      "Стоимость подписчика": (r.subscribersGained && r.cost && Number(r.subscribersGained) > 0)
        ? Math.round(parseFloat(r.cost) / r.subscribersGained)
        : "",
      "Заметки": r.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Закуп");
    const monthLabel = selectedMonth !== "all" ? `_${selectedMonth}` : "";
    XLSX.writeFile(wb, `Закуп${monthLabel}.xlsx`);
    setExportPending(false);
    toast.success("Файл Excel скачан");
  }, [exportData, exportFetching, exportPending, channelMap, selectedMonth]);

  function handleExport() {
    setExportPending(true);
    refetchExport();
  }

  function openCreate() { setEditingId(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true); }
  function openEdit(r: NonNullable<typeof records>[number]) {
    setEditingId(r.id);
    setForm({
      channelId: String(r.channelId), date: r.date ? new Date(r.date).toISOString().slice(0, 10) : todayIso(),
      admin: r.admin ?? "", link: r.link ?? "", targetChannels: r.targetChannels ?? "",
      direction: r.direction ?? "", tariff: r.tariff ?? "", buyer: r.buyer ?? "",
      spm: r.spm ?? "", reach: r.reach ? String(r.reach) : "", cost: r.cost ?? "", paymentStatus: (r.paymentStatus as PaymentStatus) ?? "unpaid",
      subscribersGained: r.subscribersGained ? String(r.subscribersGained) : "",
      month: r.month, notes: r.notes ?? "",
      timeSlot: r.timeSlot ?? "", bookingSlot: (r.bookingSlot ?? "") as "утро" | "обед" | "вечер" | "",
      sourceSubscribers: (r as Record<string, unknown>).sourceSubscribers ? String((r as Record<string, unknown>).sourceSubscribers) : "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.channelId || !form.date) return;
    const payload = {
      channelId: Number(form.channelId), date: form.date,
      admin: form.admin || undefined, link: form.link || undefined,
      targetChannels: form.targetChannels || undefined, direction: form.direction || undefined,
      tariff: form.tariff || undefined, buyer: form.buyer || undefined,
      spm: form.spm || undefined,
      reach: form.reach ? Number(form.reach) : undefined,
      cost: form.cost || undefined,
      paymentStatus: form.paymentStatus,
      subscribersGained: form.subscribersGained ? Number(form.subscribersGained) : undefined,
      month: form.month,
      notes: form.notes || undefined,
      timeSlot: form.timeSlot || undefined,
      bookingSlot: form.bookingSlot || undefined,
      sourceSubscribers: form.sourceSubscribers ? Number(form.sourceSubscribers) : undefined,
    };
    if (editingId) { updateMutation.mutate({ id: editingId, ...payload }); }
    else { createMutation.mutate(payload); }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Закуп</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Покупка рекламных размещений</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExport}
            variant="outline"
            size="sm"
            className="gap-2 bg-transparent"
            disabled={exportFetching && exportPending}
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </Button>
          <Button onClick={openCreate} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Добавить</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по админу, ссылке, направлению..."
          className="pl-9 bg-card border-border h-9 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
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
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
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
              <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
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
        {/* Sort control */}
        <div className="flex items-center gap-1 ml-auto">
          <Select value={sortField} onValueChange={(v) => setSortField(v as typeof sortField)}>
            <SelectTrigger className="w-36 bg-card border-border text-sm h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="date">По дате</SelectItem>
              <SelectItem value="cost">По стоимости</SelectItem>
              <SelectItem value="paymentStatus">По оплате</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0 bg-transparent"
            title={sortDir === "asc" ? "По возрастанию" : "По убыванию"}
            onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
          >
            <ArrowUpDown className="w-3.5 h-3.5" style={{ transform: sortDir === "asc" ? "none" : "scaleY(-1)" }} />
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {filteredRecords.length > 0 && (
        <div className="glass rounded-xl px-4 py-3 flex items-center gap-6 text-sm">
          <span className="text-muted-foreground">
            Записей: <span className="text-foreground font-medium">{filteredRecords.length}</span>
          </span>
          <span className="text-muted-foreground">
            Итого: <span className="text-loss font-semibold">{formatCost(totalCost)} ₽</span>
          </span>
          {totalSubscribers > 0 && (
            <span className="text-muted-foreground">
              Подп.: <span className="text-emerald-400 font-semibold">+{totalSubscribers}</span>
              {avgCostPerSub && <span className="text-muted-foreground ml-1">({avgCostPerSub} ₽/подп.)</span>}
            </span>
          )}
        </div>
      )}

      {/* Records */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : !filteredRecords.length ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
            <ShoppingCart className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">
            {searchQuery ? "Ничего не найдено" : "Нет записей по выбранным фильтрам"}
          </p>
          {!searchQuery && (
            <Button onClick={openCreate} variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Добавить запись
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRecords.map((r) => (
            <div
              key={r.id}
              className="glass rounded-xl p-3.5 group cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
              onClick={(e) => { if ((e.target as HTMLElement).closest('button, a')) return; setViewRecord(r); }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {channelMap[r.channelId] ?? "—"}
                    </span>
                    <button
                      title="Нажмите для смены статуса оплаты"
                      onClick={() => quickPayMutation.mutate({
                        id: r.id,
                        paymentStatus: PAYMENT_CYCLE[r.paymentStatus as PaymentStatus] ?? "unpaid",
                      })}
                      className={PAYMENT_CLASSES[r.paymentStatus] ?? PAYMENT_CLASSES.unpaid}
                    >
                      {PAYMENT_LABELS[r.paymentStatus] ?? r.paymentStatus}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{r.admin || "—"}</span>
                    {r.date && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.date).toLocaleDateString("ru-RU")}
                      </span>
                    )}
                    {r.direction && <span className="text-xs text-muted-foreground">{r.direction}</span>}
                    {r.tariff && <span className="text-xs text-muted-foreground">{r.tariff}</span>}
                    {r.spm && <span className="text-xs text-muted-foreground">СПМ: {r.spm}</span>}
                    {!!(r as Record<string, unknown>).isMutual && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-violet-500/20 text-violet-400 border border-violet-500/30">
                        ⇄ ВП{(r as Record<string, unknown>).partnerChannel ? `: ${String((r as Record<string, unknown>).partnerChannel)}` : ""}
                      </span>
                    )}
                  </div>
                  {r.link && (
                    <a
                      href={r.link.startsWith("http") ? r.link : `https://${r.link}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 truncate max-w-xs"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{r.link}</span>
                    </a>
                  )}
                  <PostAnalyticsBadge
                    recordType="purchase"
                    recordId={r.id}
                    link={r.link}
                    paymentStatus={r.paymentStatus}
                  />
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-sm font-semibold text-loss">
                    {r.cost ? `${formatCost(parseFloat(r.cost))} ₽` : "—"}
                  </span>
                  {r.subscribersGained != null && r.subscribersGained > 0 && (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs text-emerald-400 font-medium">
                        +{r.subscribersGained} подп.
                      </span>
                      {r.cost && (
                        <span className="text-xs text-muted-foreground">
                          {Math.round(parseFloat(r.cost) / r.subscribersGained)} ₽/подп.
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => duplicateMutation.mutate({ id: r.id })}
                        title="Дублировать"
                        className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(r)}
                        title="Редактировать"
                        className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {deleteConfirmId === r.id ? (
                        <>
                          <button
                            onClick={() => { deleteMutation.mutate({ id: r.id }); setDeleteConfirmId(null); }}
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
            </div>
          ))}
        </div>
      )}

      <PurchaseFormModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? "Редактировать закуп" : "Новая запись закупа"}
        channels={channels ?? []}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        isPending={isPending}
        suggestions={suggestions}
      />

      {/* Detail Drawer */}
      {viewRecord && (
        <PurchaseDetailDrawer
          record={viewRecord}
          channelMap={channelMap}
          onClose={() => setViewRecord(null)}
          onEdit={() => {
            openEdit(viewRecord);
            setViewRecord(null);
          }}
        />
      )}
    </div>
  );
}
