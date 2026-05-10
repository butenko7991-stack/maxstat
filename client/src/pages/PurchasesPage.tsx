import { trpc } from "@/lib/trpc";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Plus, ShoppingCart, Pencil, Trash2, X, Check,
  ExternalLink, Copy, Download, Search, ArrowUpDown,
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

const EMPTY_FORM: PurchaseFormData = {
  channelId: "", date: todayIso(), admin: "", link: "", targetChannels: "",
  direction: "", tariff: "", buyer: "", spm: "", reach: "", cost: "", paymentStatus: "unpaid",
  botStories: "", botStoriesCost: "", month: currentMonth(), notes: "",
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

  // Export effect: when exportData arrives after user click, build xlsx
  useEffect(() => {
    if (!exportPending) return;
    if (exportFetching) return;
    if (!exportData) {
      // refetch completed but no data returned (error case)
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
      "Бот/Сторис": r.botStories ?? "",
      "Стоимость бот/сторис": r.botStoriesCost ? parseFloat(r.botStoriesCost) : "",
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
      botStories: r.botStories ?? "", botStoriesCost: r.botStoriesCost ?? "",
      month: r.month, notes: r.notes ?? "",
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
      paymentStatus: form.paymentStatus, botStories: form.botStories || undefined,
      botStoriesCost: form.botStoriesCost || undefined, month: form.month,
      notes: form.notes || undefined,
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
            <div key={r.id} className="glass rounded-xl p-3.5 group">
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
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-sm font-semibold text-loss">
                    {r.cost ? `${formatCost(parseFloat(r.cost))} ₽` : "—"}
                  </span>
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
    </div>
  );
}
