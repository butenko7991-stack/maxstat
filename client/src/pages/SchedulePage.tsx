import { useState, useMemo, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { cn, formatCost } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Eye,
  ShoppingCart,
  Check,
  Clock,
  X,
  CheckSquare,
  Square,
  Layers,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SaleFormModal, PurchaseFormModal, type PurchaseFormData } from "@/components/RecordFormModal";
import { toast } from "sonner";

const SLOTS = ["утро", "обед", "вечер"] as const;
type Slot = typeof SLOTS[number];

const SLOT_COLORS: Record<Slot, string> = {
  утро: "text-amber-400",
  обед: "text-orange-400",
  вечер: "text-indigo-400",
};

const SLOT_BG: Record<Slot, string> = {
  утро: "bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20",
  обед: "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20",
  вечер: "bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20",
};

const PAYMENT_LABELS: Record<string, string> = {
  paid: "Оплачено",
  unpaid: "Не оплачено",
  partial: "Частично",
};

const PAYMENT_COLORS: Record<string, string> = {
  paid: "text-emerald-400",
  unpaid: "text-red-400",
  partial: "text-amber-400",
};

// Helpers
function getWeekDates(baseDate: Date): Date[] {
  const monday = new Date(baseDate);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDay(d: Date): { weekday: string; day: string; month: string } {
  return {
    weekday: d.toLocaleDateString("ru-RU", { weekday: "short" }),
    day: String(d.getDate()),
    month: d.toLocaleDateString("ru-RU", { month: "short" }),
  };
}

function isToday(d: Date): boolean {
  const today = new Date();
  return toIso(d) === toIso(today);
}

const EMPTY_SALE_FORM = {
  channelId: "", date: "", admin: "", link: "", timeSlot: "", bookingSlot: "" as "" | "утро" | "обед" | "вечер",
  tariff: "", platform: "", spm: "", reach: "", cost: "", paymentStatus: "unpaid" as const,
  botStories: "", botStoriesCost: "", month: "", notes: "",
};

const EMPTY_PURCHASE_FORM: PurchaseFormData = {
  channelId: "", date: "", admin: "", link: "", targetChannels: "",
  direction: "", tariff: "", buyer: "", spm: "", reach: "", cost: "",
  paymentStatus: "unpaid", subscribersGained: "", botStories: "",
  botStoriesCost: "", month: "", notes: "", timeSlot: "", bookingSlot: "",
};

export default function SchedulePage() {
  const [baseDate, setBaseDate] = useState(() => new Date());
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"sales" | "purchases">("sales");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saleForm, setSaleForm] = useState<typeof EMPTY_SALE_FORM>({ ...EMPTY_SALE_FORM });
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormData>({ ...EMPTY_PURCHASE_FORM });
  // Multi-select state
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<Array<{ channelId: number; channelName: string; dateStr: string; slot: Slot }>>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<typeof EMPTY_SALE_FORM>({ ...EMPTY_SALE_FORM });

  function toggleSlotSelection(channelId: number, channelName: string, dateStr: string, slot: Slot) {
    setSelectedSlots((prev) => {
      const key = `${channelId}|${dateStr}|${slot}`;
      const exists = prev.find((s) => `${s.channelId}|${s.dateStr}|${s.slot}` === key);
      if (exists) return prev.filter((s) => `${s.channelId}|${s.dateStr}|${s.slot}` !== key);
      return [...prev, { channelId, channelName, dateStr, slot }];
    });
  }

  function isSlotSelected(channelId: number, dateStr: string, slot: Slot) {
    return selectedSlots.some((s) => s.channelId === channelId && s.dateStr === dateStr && s.slot === slot);
  }

  function exitMultiSelect() {
    setMultiSelectMode(false);
    setSelectedSlots([]);
  }

  const [detailSlot, setDetailSlot] = useState<null | {
    channelName: string;
    date: string;
    slot: Slot;
    records: Array<{ id: number; admin?: string | null; cost?: string | null; paymentStatus: string; link?: string | null; tariff?: string | null }>;
  }>(null);

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
  const startDate = toIso(weekDates[0]);
  const endDate = toIso(weekDates[6]);

  const { data: channels = [], isLoading: channelsLoading, isError: channelsError } = trpc.channels.list.useQuery();
  const { data: scheduleData, refetch, isLoading: scheduleLoading, isError: scheduleError } = trpc.schedule.getData.useQuery(
    { startDate, endDate },
    { refetchOnWindowFocus: false }
  );

  const utils = trpc.useUtils();
  const bulkCreateMutation = trpc.sales.bulkCreate.useMutation({
    onSuccess: (data) => {
      utils.schedule.getData.invalidate();
      utils.sales.list.invalidate();
      setBulkDialogOpen(false);
      exitMultiSelect();
      toast.success(`Создано ${data.count} записей`);
    },
    onError: (e) => toast.error(e.message),
  });

  const createPurchaseMutation = trpc.purchases.create.useMutation({
    onSuccess: () => {
      utils.schedule.getData.invalidate();
      utils.purchases.list.invalidate();
      setPurchaseDialogOpen(false);
      toast.success("Запись закупа создана");
    },
    onError: (e) => toast.error(e.message),
  });
  const createSaleMutation = trpc.sales.create.useMutation({
    onSuccess: () => {
      utils.schedule.getData.invalidate();
      utils.sales.list.invalidate();
      setDialogOpen(false);
      toast.success("Запись создана");
    },
    onError: (e) => {
      if (e.data?.code === "CONFLICT") {
        setConflictError(e.message);
      } else {
        toast.error(e.message);
      }
    },
  });

  const visibleChannels = useMemo(() => {
    if (channelFilter === "all") return channels;
    return channels.filter((c) => String(c.id) === channelFilter);
  }, [channels, channelFilter]);

  // Build purchase slot lookup: channelId -> date -> slot -> purchases[]
  const purchaseSlotMap = useMemo(() => {
    const map: Record<number, Record<string, Record<string, NonNullable<typeof scheduleData>["purchases"]>>> = {};
    if (!scheduleData) return map;
    for (const p of scheduleData.purchases) {
      const cid = p.channelId;
      const dateStr = p.date ? toIso(new Date(p.date)) : "";
      const slot = ((p.bookingSlot ?? p.timeSlot) ?? "").toLowerCase();
      if (!map[cid]) map[cid] = {};
      if (!map[cid][dateStr]) map[cid][dateStr] = {};
      if (!map[cid][dateStr][slot]) map[cid][dateStr][slot] = [];
      map[cid][dateStr][slot].push(p);
    }
    return map;
  }, [scheduleData]);

  // Build lookup: channelId -> date -> slot -> records[]
  const saleMap = useMemo(() => {
    const map: Record<number, Record<string, Record<string, NonNullable<typeof scheduleData>["sales"]>>> = {};
    if (!scheduleData) return map;
    for (const s of scheduleData.sales) {
      const cid = s.channelId;
      const dateStr = s.date ? toIso(new Date(s.date)) : "";
      // Prefer bookingSlot for grid placement; fall back to timeSlot for legacy records
      const slot = ((s.bookingSlot ?? s.timeSlot) ?? "").toLowerCase();
      if (!map[cid]) map[cid] = {};
      if (!map[cid][dateStr]) map[cid][dateStr] = {};
      if (!map[cid][dateStr][slot]) map[cid][dateStr][slot] = [];
      map[cid][dateStr][slot].push(s);
    }
    return map;
  }, [scheduleData]);

  // Purchases per channel per date (reference only) — stores list of admins
  const purchaseMap = useMemo(() => {
    const map: Record<number, Record<string, { count: number; admins: string[] }>> = {};
    if (!scheduleData?.purchases) return map;
    for (const p of scheduleData.purchases) {
      const cid = p.channelId;
      const dateStr = p.date ? toIso(new Date(p.date)) : "";
      if (!map[cid]) map[cid] = {};
      if (!map[cid][dateStr]) map[cid][dateStr] = { count: 0, admins: [] };
      map[cid][dateStr].count += 1;
      if (p.admin) map[cid][dateStr].admins.push(p.admin);
    }
    return map;
  }, [scheduleData]);

  const prevWeek = useCallback(() => {
    setBaseDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
  }, []);
  const nextWeek = useCallback(() => {
    setBaseDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
  }, []);
  const goToday = useCallback(() => setBaseDate(new Date()), []);

  function openCreate(channelId: number, dateStr: string, slot: Slot) {
    const month = dateStr.slice(0, 7);
    setSaleForm({
      ...EMPTY_SALE_FORM,
      channelId: String(channelId),
      date: dateStr,
      timeSlot: slot,
      bookingSlot: slot,
      month,
    });
    setConflictError(null);
    setDialogOpen(true);
  }
  function openPurchaseCreate(channelId: number, dateStr: string, slot: Slot) {
    const month = dateStr.slice(0, 7);
    setPurchaseForm({
      ...EMPTY_PURCHASE_FORM,
      channelId: String(channelId),
      date: dateStr,
      timeSlot: slot,
      bookingSlot: slot as "" | "утро" | "обед" | "вечер",
      month,
    });
    setPurchaseDialogOpen(true);
  }

  function openDetail(channelId: number, channelName: string, dateStr: string, slot: Slot) {
    const records = (saleMap[channelId]?.[dateStr]?.[slot] ?? []) as Array<{
      id: number; admin?: string | null; cost?: string | null; paymentStatus: string; link?: string | null; tariff?: string | null;
    }>;
    setDetailSlot({ channelName, date: dateStr, slot, records });
  }

  const weekLabel = useMemo(() => {
    const first = weekDates[0];
    const last = weekDates[6];
    if (first.getMonth() === last.getMonth()) {
      return `${first.getDate()}–${last.getDate()} ${first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}`;
    }
    return `${first.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} – ${last.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`;
  }, [weekDates]);

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 space-y-4 max-w-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Расписание</h1>
            <p className="text-sm text-muted-foreground">Бронирование рекламных слотов</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Week navigation */}
          <div className="flex items-center gap-1 glass rounded-xl px-1 py-1">
            <button
              onClick={prevWeek}
              className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-foreground px-2 min-w-[180px] text-center">
              {weekLabel}
            </span>
            <button
              onClick={nextWeek}
              className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={goToday}
            className="px-3 py-2 text-xs font-medium rounded-xl border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            Сегодня
          </button>
          {activeTab === "sales" && (
            <button
              onClick={() => {
                if (multiSelectMode) { exitMultiSelect(); }
                else { setMultiSelectMode(true); }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-colors",
                multiSelectMode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              {multiSelectMode ? "Отмена" : "Мультивыбор"}
            </button>
          )}
          {/* Channel filter */}
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-9 text-xs w-40 bg-card border-border">
              <SelectValue placeholder="Все каналы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все каналы</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 glass rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab("sales")}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeTab === "sales"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            Продажа
          </button>
          <button
            onClick={() => setActiveTab("purchases")}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
              activeTab === "purchases"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            Закуп
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500/40" />
            Свободно
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-500/20 border border-red-500/40" />
            Забронировано
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-500/20 border border-slate-500/30" />
            Закуп (справочно)
          </span>
        </div>

        {/* Calendar grid — scrollable horizontally on mobile */}
        {activeTab === "sales" && <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
          <div className="min-w-[640px]">
            {/* Day headers */}
            <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: "140px repeat(7, minmax(0, 1fr))" }}>
              <div /> {/* empty corner */}
              {weekDates.map((d) => {
                const { weekday, day, month } = formatDay(d);
                const today = isToday(d);
                return (
                  <div
                    key={toIso(d)}
                    className={cn(
                      "text-center py-2 rounded-xl text-xs font-medium",
                      today ? "bg-primary/15 text-primary" : "text-muted-foreground"
                    )}
                  >
                    <div className="capitalize">{weekday}</div>
                    <div className={cn("text-base font-semibold", today ? "text-primary" : "text-foreground")}>
                      {day}
                    </div>
                    <div className="text-[10px] opacity-60">{month}</div>
                  </div>
                );
              })}
            </div>

            {/* Channel rows */}
            {(channelsLoading || scheduleLoading) ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="glass rounded-xl overflow-hidden animate-pulse">
                    <div className="px-3 py-2 border-b border-border/50 bg-card/50">
                      <div className="h-3 w-28 rounded bg-muted/60" />
                    </div>
                    {["утро", "обед", "вечер"].map((s) => (
                      <div key={s} className="grid gap-1 p-2" style={{ gridTemplateColumns: "140px repeat(7, minmax(0, 1fr))" }}>
                        <div className="h-3 w-12 rounded bg-muted/40 self-center" />
                        {[1,2,3,4,5,6,7].map((d) => (
                          <div key={d} className="rounded-lg bg-muted/20 min-h-[52px]" />
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (channelsError || scheduleError) ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-red-400 mb-2">Ошибка загрузки данных расписания.</p>
                <button
                  onClick={() => refetch()}
                  className="text-xs underline text-muted-foreground hover:text-foreground transition-colors"
                >
                  Попробовать снова
                </button>
              </div>
            ) : visibleChannels.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                Нет каналов. Добавьте каналы в разделе «Каналы».
              </div>
            ) : (
              <div className="space-y-3">
                {visibleChannels.map((channel) => (
                  <div key={channel.id} className="glass rounded-xl overflow-hidden">
                    {/* Channel name */}
                    <div className="px-3 py-2 border-b border-border/50 bg-card/50">
                      <span className="text-xs font-semibold text-foreground">{channel.name}</span>
                      {/* Show purchase count for the week as reference */}
                      {(() => {
                        const total = weekDates.reduce((s, d) => s + (purchaseMap[channel.id]?.[toIso(d)]?.count ?? 0), 0);
                        return total > 0 ? (
                          <span className="ml-2 text-[10px] text-muted-foreground flex-inline items-center gap-1">
                            <ShoppingCart className="w-3 h-3 inline" /> {total} закуп.
                          </span>
                        ) : null;
                      })()}
                    </div>

                    {/* Slot rows */}
                    {SLOTS.map((slot) => (
                      <div
                        key={slot}
                        className="grid gap-1 p-2"
                        style={{ gridTemplateColumns: "140px repeat(7, minmax(0, 1fr))" }}
                      >
                        {/* Slot label */}
                        <div className="flex items-center gap-1.5 px-1">
                          <Clock className={cn("w-3 h-3 shrink-0", SLOT_COLORS[slot])} />
                          <span className={cn("text-xs font-medium capitalize", SLOT_COLORS[slot])}>{slot}</span>
                        </div>

                        {/* Day cells */}
                        {weekDates.map((d) => {
                          const dateStr = toIso(d);
                          const records = saleMap[channel.id]?.[dateStr]?.[slot] ?? [];
                          const booked = records.length > 0;
                          const purchaseInfo = purchaseMap[channel.id]?.[dateStr];
                          const hasPurchase = (purchaseInfo?.count ?? 0) > 0;

                          if (booked) {
                            return (
                              <button
                                key={dateStr}
                                onClick={() => openDetail(channel.id, channel.name, dateStr, slot)}
                                className="relative rounded-lg border bg-red-500/15 border-red-500/30 hover:bg-red-500/25 transition-colors p-1.5 text-left min-h-[52px] w-full overflow-hidden group"
                              >
                                <div className="flex items-start justify-between gap-1 min-w-0">
                                  <span className="text-[10px] font-semibold text-red-400 leading-tight truncate min-w-0 block">
                                    {records[0]?.admin ?? "—"}
                                  </span>
                                  <Eye className="w-3 h-3 text-red-400/60 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                {records[0]?.cost && (
                                  <div className="text-[10px] text-red-300/70 mt-0.5 truncate">
                                    {formatCost(parseFloat(records[0].cost))} ₽
                                  </div>
                                )}
                                <div className={cn("text-[9px] mt-0.5 truncate", PAYMENT_COLORS[records[0]?.paymentStatus ?? "unpaid"])}>
                                  {PAYMENT_LABELS[records[0]?.paymentStatus ?? "unpaid"]}
                                </div>
                                {records.length > 1 && (
                                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                                    {records.length}
                                  </div>
                                )}
                                {hasPurchase && purchaseInfo && (
                                  <div className="mt-0.5 flex items-center gap-0.5 rounded bg-muted/30 border border-border/30 px-1 py-0.5 overflow-hidden">
                                    <ShoppingCart className="w-2 h-2 text-muted-foreground/50 shrink-0" />
                                    <span className="text-[9px] text-muted-foreground/60 truncate leading-tight">
                                      {purchaseInfo.admins.length > 0
                                        ? purchaseInfo.admins.slice(0, 1).join(", ") + (purchaseInfo.count > 1 ? ` +${purchaseInfo.count - 1}` : "")
                                        : `${purchaseInfo.count} закуп.`}
                                    </span>
                                  </div>
                                )}
                              </button>
                            );
                          }

                          const selected = isSlotSelected(channel.id, dateStr, slot);
                          return (
                            <button
                              key={dateStr}
                              onClick={() => {
                                if (multiSelectMode) {
                                  toggleSlotSelection(channel.id, channel.name, dateStr, slot);
                                } else {
                                  openCreate(channel.id, dateStr, slot);
                                }
                              }}
                              className={cn(
                                "relative rounded-lg border transition-all p-1.5 min-h-[52px] group flex flex-col items-center justify-center gap-1",
                                selected
                                  ? "bg-primary/20 border-primary/60 ring-1 ring-primary/40"
                                  : "bg-emerald-500/5 border-emerald-500/15 hover:bg-emerald-500/20 hover:border-emerald-500/40"
                              )}
                            >
                              {selected ? (
                                <CheckSquare className="w-4 h-4 text-primary" />
                              ) : multiSelectMode ? (
                                <Square className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-emerald-400 transition-colors" />
                              ) : (
                                <Plus className="w-3.5 h-3.5 text-emerald-500/40 group-hover:text-emerald-400 transition-colors" />
                              )}
                              {hasPurchase && purchaseInfo && (
                                <div className="absolute bottom-0 left-0 right-0 px-1 pb-1">
                                  <div className="flex items-center gap-0.5 rounded bg-muted/40 border border-border/40 px-1 py-0.5 overflow-hidden">
                                    <ShoppingCart className="w-2.5 h-2.5 text-muted-foreground/60 shrink-0" />
                                    <span className="text-[9px] text-muted-foreground/70 truncate leading-tight">
                                      {purchaseInfo.admins.length > 0
                                        ? purchaseInfo.admins.slice(0, 2).join(", ") + (purchaseInfo.count > 2 ? ` +${purchaseInfo.count - 2}` : "")
                                        : `${purchaseInfo.count} закуп.`}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>}

        {/* Purchase grid */}
        {activeTab === "purchases" && (
          <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0">
            <div className="min-w-[640px]">
              {/* Day headers */}
              <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: "140px repeat(7, minmax(0, 1fr))" }}>
                <div />
                {weekDates.map((d) => {
                  const { weekday, day, month } = formatDay(d);
                  const today = isToday(d);
                  return (
                    <div
                      key={toIso(d)}
                      className={cn(
                        "text-center py-2 rounded-xl text-xs font-medium",
                        today ? "bg-primary/15 text-primary" : "text-muted-foreground"
                      )}
                    >
                      <div className="capitalize">{weekday}</div>
                      <div className={cn("text-base font-semibold", today ? "text-primary" : "text-foreground")}>{day}</div>
                      <div className="text-[10px] opacity-60">{month}</div>
                    </div>
                  );
                })}
              </div>
              {/* Channel rows */}
              {(channelsLoading || scheduleLoading) ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="glass rounded-xl overflow-hidden animate-pulse">
                      <div className="px-3 py-2 border-b border-border/50 bg-card/50">
                        <div className="h-3 w-28 rounded bg-muted/60" />
                      </div>
                      {["утро", "обед", "вечер"].map((s) => (
                        <div key={s} className="grid gap-1 p-2" style={{ gridTemplateColumns: "140px repeat(7, minmax(0, 1fr))" }}>
                          <div className="h-3 w-12 rounded bg-muted/40 self-center" />
                          {[1,2,3,4,5,6,7].map((d) => <div key={d} className="rounded-lg bg-muted/20 min-h-[52px]" />)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : visibleChannels.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  Нет каналов.
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleChannels.map((channel) => (
                    <div key={channel.id} className="glass rounded-xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-border/50 bg-card/50">
                        <span className="text-xs font-semibold text-foreground">{channel.name}</span>
                      </div>
                      {SLOTS.map((slot) => (
                        <div key={slot} className="grid gap-1 p-2" style={{ gridTemplateColumns: "140px repeat(7, minmax(0, 1fr))" }}>
                          <div className="flex items-center gap-1.5 px-1">
                            <Clock className={cn("w-3 h-3 shrink-0", SLOT_COLORS[slot])} />
                            <span className={cn("text-xs font-medium capitalize", SLOT_COLORS[slot])}>{slot}</span>
                          </div>
                          {weekDates.map((d) => {
                            const dateStr = toIso(d);
                            const purchases = purchaseSlotMap[channel.id]?.[dateStr]?.[slot] ?? [];
                            const booked = purchases.length > 0;
                            if (booked) {
                              return (
                                <button
                                  key={dateStr}
                                  onClick={() => {
                                    setDetailSlot({
                                      channelName: channel.name,
                                      date: dateStr,
                                      slot,
                                      records: purchases.map((p) => ({
                                        id: p.id,
                                        admin: p.admin,
                                        cost: p.cost,
                                        paymentStatus: p.paymentStatus,
                                        link: null,
                                        tariff: null,
                                      })),
                                    });
                                  }}
                                  className="relative rounded-lg border bg-blue-500/15 border-blue-500/30 hover:bg-blue-500/25 transition-colors p-1.5 text-left min-h-[52px] w-full overflow-hidden group"
                                >
                                  <div className="flex items-start justify-between gap-1 min-w-0">
                                    <span className="text-[10px] font-semibold text-blue-400 leading-tight truncate min-w-0 block">
                                      {purchases[0]?.admin ?? "—"}
                                    </span>
                                    <Eye className="w-3 h-3 text-blue-400/60 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                  {purchases[0]?.cost && (
                                    <div className="text-[10px] text-blue-300/70 mt-0.5 truncate">
                                      {formatCost(parseFloat(purchases[0].cost))} ₽
                                    </div>
                                  )}
                                  <div className={cn("text-[9px] mt-0.5 truncate", PAYMENT_COLORS[purchases[0]?.paymentStatus ?? "unpaid"])}>
                                    {PAYMENT_LABELS[purchases[0]?.paymentStatus ?? "unpaid"]}
                                  </div>
                                  {purchases.length > 1 && (
                                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] flex items-center justify-center font-bold">
                                      {purchases.length}
                                    </div>
                                  )}
                                </button>
                              );
                            }
                            return (
                              <button
                                key={dateStr}
                                onClick={() => openPurchaseCreate(channel.id, dateStr, slot)}
                                className="relative rounded-lg border transition-colors p-1.5 min-h-[52px] group flex flex-col items-center justify-center gap-1 bg-blue-500/5 border-blue-500/15 hover:bg-blue-500/20 hover:border-blue-500/40"
                              >
                                <Plus className="w-3.5 h-3.5 text-blue-500/40 group-hover:text-blue-400 transition-colors" />
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Purchase create dialog */}
        {purchaseDialogOpen && (
          <PurchaseFormModal
            open={purchaseDialogOpen}
            onOpenChange={setPurchaseDialogOpen}
            title="Новый закуп"
            form={purchaseForm}
            setForm={setPurchaseForm}
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              if (!purchaseForm.channelId || !purchaseForm.date) return;
              const f = purchaseForm;
              createPurchaseMutation.mutate({
                channelId: Number(f.channelId),
                date: f.date,
                admin: f.admin || undefined,
                link: f.link || undefined,
                targetChannels: f.targetChannels || undefined,
                direction: f.direction || undefined,
                tariff: f.tariff || undefined,
                buyer: f.buyer || undefined,
                spm: f.spm || undefined,
                reach: f.reach ? Number(f.reach) : undefined,
                cost: f.cost || undefined,
                paymentStatus: f.paymentStatus as "paid" | "unpaid" | "partial",
                subscribersGained: f.subscribersGained ? Number(f.subscribersGained) : undefined,
                botStories: f.botStories || undefined,
                botStoriesCost: f.botStoriesCost || undefined,
                month: f.month,
                notes: f.notes || undefined,
                timeSlot: f.timeSlot || undefined,
                bookingSlot: (f.bookingSlot || undefined) as "утро" | "обед" | "вечер" | undefined,
              });
            }}
            isPending={createPurchaseMutation.isPending}
            channels={channels}
            suggestions={{ admins: [], platforms: [], buyers: [], directions: [] }}
          />
        )}

        {/* Sale create dialog */}
        {dialogOpen && (
          <SaleFormModal
            open={dialogOpen}
            onOpenChange={(v) => { setDialogOpen(v); if (!v) setConflictError(null); }}
            title="Новая запись продажи"
            form={saleForm as any}
            setForm={(updater: any) => { setConflictError(null); setSaleForm(updater); }}
            conflictError={conflictError}
            onClearConflict={() => setConflictError(null)}
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              if (!saleForm.channelId || !saleForm.date) return;
              const f = saleForm;
              createSaleMutation.mutate({
                channelId: Number(f.channelId), date: f.date,
                admin: f.admin || undefined, link: f.link || undefined,
                timeSlot: f.timeSlot || undefined,
                bookingSlot: (f.bookingSlot || undefined) as "утро" | "обед" | "вечер" | undefined,
                tariff: f.tariff || undefined, platform: f.platform || undefined,
                spm: f.spm || undefined,
                reach: f.reach ? Number(f.reach) : undefined,
                cost: f.cost || undefined,
                paymentStatus: f.paymentStatus as "paid" | "unpaid" | "partial",
                botStories: f.botStories || undefined,
                botStoriesCost: f.botStoriesCost || undefined,
                month: f.month,
                notes: f.notes || undefined,
              });
            }}
            isPending={createSaleMutation.isPending}
            channels={channels}
            suggestions={{ admins: [], platforms: [], buyers: [], directions: [] }}
          />
        )}

        {/* Multi-select bottom panel */}
        {multiSelectMode && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 glass rounded-2xl px-5 py-3 shadow-2xl border border-primary/20">
            <div className="text-sm text-foreground">
              {selectedSlots.length === 0
                ? <span className="text-muted-foreground">Тапните на свободные ячейки</span>
                : <span className="font-semibold text-primary">Выбрано: {selectedSlots.length}</span>
              }
            </div>
            {selectedSlots.length > 0 && (
              <>
                <div className="flex flex-wrap gap-1 max-w-xs">
                  {selectedSlots.slice(0, 4).map((s) => (
                    <span key={`${s.channelId}|${s.dateStr}|${s.slot}`} className="text-[10px] bg-primary/15 text-primary rounded-md px-1.5 py-0.5">
                      {s.channelName.slice(0, 10)} • {s.dateStr.slice(5)} • {s.slot}
                    </span>
                  ))}
                  {selectedSlots.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">+{selectedSlots.length - 4}</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    const first = selectedSlots[0];
                    setBulkForm({
                      ...EMPTY_SALE_FORM,
                      channelId: String(first.channelId),
                      date: first.dateStr,
                      bookingSlot: first.slot,
                      timeSlot: first.slot,
                      month: first.dateStr.slice(0, 7),
                    });
                    setBulkDialogOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
                >
                  Создать {selectedSlots.length} записей
                </button>
              </>
            )}
            <button onClick={exitMultiSelect} className="ml-1 p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Bulk create dialog */}
        {bulkDialogOpen && (
          <SaleFormModal
            open={bulkDialogOpen}
            onOpenChange={(v) => setBulkDialogOpen(v)}
            title={`Новая запись — ${selectedSlots.length} слотов`}
            form={bulkForm as any}
            setForm={(updater: any) => setBulkForm(updater)}
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              const f = bulkForm;
              bulkCreateMutation.mutate({
                slots: selectedSlots.map((s) => ({
                  channelId: s.channelId,
                  date: s.dateStr,
                  bookingSlot: s.slot as "утро" | "обед" | "вечер",
                  timeSlot: s.slot,
                  month: s.dateStr.slice(0, 7),
                })),
                admin: f.admin || undefined,
                link: f.link || undefined,
                tariff: f.tariff || undefined,
                platform: f.platform || undefined,
                spm: f.spm || undefined,
                reach: f.reach ? Number(f.reach) : undefined,
                cost: f.cost || undefined,
                paymentStatus: f.paymentStatus as "paid" | "unpaid" | "partial",
                botStories: f.botStories || undefined,
                botStoriesCost: f.botStoriesCost || undefined,
                notes: f.notes || undefined,
              });
            }}
            isPending={bulkCreateMutation.isPending}
            channels={channels}
            suggestions={{ admins: [], platforms: [], buyers: [], directions: [] }}
          />
        )}

        {/* Detail drawer */}
        {detailSlot && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setDetailSlot(null)}>
            <div
              className="glass rounded-2xl w-full max-w-sm p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{detailSlot.channelName}</h3>
                  <p className="text-sm text-muted-foreground capitalize">
                    {new Date(detailSlot.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} · {detailSlot.slot}
                  </p>
                </div>
                <button onClick={() => setDetailSlot(null)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                {detailSlot.records.map((r, i) => (
                  <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{r.admin ?? "—"}</span>
                      <span className={cn("text-xs font-medium", PAYMENT_COLORS[r.paymentStatus])}>
                        {PAYMENT_LABELS[r.paymentStatus]}
                      </span>
                    </div>
                    {r.tariff && <div className="text-xs text-muted-foreground">Тариф: {r.tariff}</div>}
                    {r.cost && <div className="text-sm font-semibold text-foreground">{formatCost(parseFloat(r.cost))} ₽</div>}
                    {r.link && (
                      <a
                        href={r.link.startsWith("http") ? r.link : `https://${r.link}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary/70 hover:text-primary truncate block"
                      >
                        {r.link}
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setDetailSlot(null)}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
