import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Receipt, CheckCircle2, Clock,
  Wallet, TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMonthLabel, formatCost, currentMonth } from "@/lib/utils";

// ─── Preset categories ────────────────────────────────────────────────────────
const PRESET_CATEGORIES = [
  "Контентщик",
  "Закупщик",
  "Менеджер",
  "Дизайнер",
  "Реклама",
  "Сервисы",
  "Прочее",
];

// ─── Form state ───────────────────────────────────────────────────────────────
interface ExpenseForm {
  month: string;
  category: string;
  customCategory: string;
  description: string;
  amount: string;
  paymentStatus: "paid" | "unpaid";
}

const EMPTY_FORM: ExpenseForm = {
  month: currentMonth(),
  category: "Контентщик",
  customCategory: "",
  description: "",
  amount: "",
  paymentStatus: "unpaid",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const utils = trpc.useUtils();

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth());

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Queries
  const { data: months } = trpc.summary.months.useQuery();
  const { data: records, isLoading } = trpc.expenses.list.useQuery({
    month: selectedMonth !== "all" ? selectedMonth : undefined,
  });
  const { data: summary } = trpc.expenses.summary.useQuery({
    month: selectedMonth !== "all" ? selectedMonth : undefined,
  });

  // Mutations
  const createMutation = trpc.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      utils.expenses.summary.invalidate();
      utils.summary.financial.invalidate();
      toast.success("Расход добавлен");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.expenses.update.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      utils.expenses.summary.invalidate();
      utils.summary.financial.invalidate();
      toast.success("Расход обновлён");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      utils.expenses.summary.invalidate();
      utils.summary.financial.invalidate();
      toast.success("Расход удалён");
      setDeleteConfirmId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const quickPayMutation = trpc.expenses.update.useMutation({
    onSuccess: () => {
      utils.expenses.list.invalidate();
      utils.expenses.summary.invalidate();
      utils.summary.financial.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Helpers
  const effectiveCategory = (f: ExpenseForm) =>
    f.category === "Прочее" && f.customCategory.trim()
      ? f.customCategory.trim()
      : f.category;

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, month: selectedMonth !== "all" ? selectedMonth : currentMonth() });
    setDialogOpen(true);
  }

  function openEdit(r: NonNullable<typeof records>[number]) {
    setEditingId(r.id);
    const isPreset = PRESET_CATEGORIES.includes(r.category);
    setForm({
      month: r.month,
      category: isPreset ? r.category : "Прочее",
      customCategory: isPreset ? "" : r.category,
      description: r.description ?? "",
      amount: String(parseFloat(String(r.amount ?? 0))),
      paymentStatus: r.paymentStatus as "paid" | "unpaid",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const cat = effectiveCategory(form);
    const amt = parseFloat(form.amount);
    if (!cat) return toast.error("Укажите категорию");
    if (!amt || isNaN(amt) || amt <= 0) return toast.error("Укажите корректную сумму");

    const payload = {
      month: form.month,
      category: cat,
      description: form.description || undefined,
      amount: amt,
      paymentStatus: form.paymentStatus,
    };

    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  // Summary values
  const totalAmount = summary?.total ?? 0;
  const paidAmount = summary?.paid ?? 0;
  const unpaidAmount = summary?.unpaid ?? 0;
  const byCategory = summary?.byCategory ?? {};

  // Group records by category for display
  const groupedByCategory = useMemo(() => {
    const groups: Record<string, NonNullable<typeof records>> = {};
    for (const r of records ?? []) {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    }
    return groups;
  }, [records]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="w-5 h-5 text-rose-400" />
            Расходы
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Операционные затраты: зарплаты, сервисы, прочее
          </p>
        </div>
        <Button onClick={openCreate} className="bg-rose-600 hover:bg-rose-700 text-white h-9 gap-1.5">
          <Plus className="w-4 h-4" />
          Добавить расход
        </Button>
      </div>

      {/* Month filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-44 bg-card border-border text-sm h-9">
            <SelectValue placeholder="Все месяцы" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">Все месяцы</SelectItem>
            {(months ?? []).map((m) => (
              <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5" /> Итого расходов
          </p>
          <p className="text-xl font-bold text-rose-400">{formatCost(totalAmount)} ₽</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Оплачено
          </p>
          <p className="text-xl font-bold text-emerald-400">{formatCost(paidAmount)} ₽</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" /> Не оплачено
          </p>
          <p className="text-xl font-bold text-amber-400">{formatCost(unpaidAmount)} ₽</p>
        </div>
      </div>

      {/* By category summary */}
      {Object.keys(byCategory).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-rose-400" />
            По категориям
          </p>
          <div className="space-y-2">
            {Object.entries(byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{cat}</span>
                  <span className="font-medium text-foreground">{formatCost(amt)} ₽</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Records list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (records ?? []).length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Нет расходов за выбранный период</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
            Добавить первый расход
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {(records ?? []).map((r) => {
            const amt = parseFloat(String(r.amount ?? 0));
            const isPaid = r.paymentStatus === "paid";
            return (
              <div
                key={r.id}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-3"
              >
                {/* Payment status toggle */}
                <button
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isPaid
                      ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                      : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                  }`}
                  title={isPaid ? "Оплачено — нажмите чтобы отменить" : "Не оплачено — нажмите чтобы отметить оплаченным"}
                  onClick={() =>
                    quickPayMutation.mutate({
                      id: r.id,
                      paymentStatus: isPaid ? "unpaid" : "paid",
                    })
                  }
                >
                  {isPaid ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{r.category}</span>
                    <span className="text-xs text-muted-foreground">{formatMonthLabel(r.month)}</span>
                    {!isPaid && (
                      <span className="text-xs bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">
                        Не оплачено
                      </span>
                    )}
                  </div>
                  {r.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.description}</p>
                  )}
                </div>

                {/* Amount */}
                <span className="font-bold text-rose-400 text-sm flex-shrink-0">
                  {formatCost(amt)} ₽
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(r)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-rose-400"
                    onClick={() => setDeleteConfirmId(r.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? "Редактировать расход" : "Добавить расход"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Month */}
            <div className="space-y-1.5">
              <Label className="text-sm">Месяц</Label>
              <Select value={form.month} onValueChange={(v) => setForm((f) => ({ ...f, month: v }))}>
                <SelectTrigger className="bg-background border-border h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {(months ?? [currentMonth()]).map((m) => (
                    <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-sm">Категория</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="bg-background border-border h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {PRESET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.category === "Прочее" && (
                <Input
                  placeholder="Укажите категорию..."
                  value={form.customCategory}
                  onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
                  className="bg-background border-border h-9 mt-1.5"
                />
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-sm">Описание (необязательно)</Label>
              <Textarea
                placeholder="Например: зарплата за июнь, Figma подписка..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="bg-background border-border text-sm resize-none h-16"
              />
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-sm">Сумма (₽)</Label>
              <Input
                type="number"
                min="0"
                step="100"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="bg-background border-border h-9"
              />
            </div>

            {/* Payment status */}
            <div className="space-y-1.5">
              <Label className="text-sm">Статус оплаты</Label>
              <Select
                value={form.paymentStatus}
                onValueChange={(v) => setForm((f) => ({ ...f, paymentStatus: v as "paid" | "unpaid" }))}
              >
                <SelectTrigger className="bg-background border-border h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="unpaid">Не оплачено</SelectItem>
                  <SelectItem value="paid">Оплачено</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Отмена
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isPending ? "Сохранение..." : editingId !== null ? "Сохранить" : "Добавить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить расход?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Это действие нельзя отменить.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId !== null && deleteMutation.mutate({ id: deleteConfirmId })}
              disabled={deleteMutation.isPending}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
