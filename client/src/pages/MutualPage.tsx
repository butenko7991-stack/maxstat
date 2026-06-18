import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Pencil, Trash2, ExternalLink, TrendingUp, TrendingDown,
  Handshake, BarChart3, ArrowRightLeft, CheckCircle2, XCircle,
  Clock, ChevronRight, Calculator, ArrowUp, ArrowDown, Users,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type DealStatus = "предложение" | "согласовано" | "размещено" | "завершено" | "отменено";
type DealType = "без доплаты" | "с доплатой";
type DopDirection = "мы платим" | "нам платят";
type DopPaymentStatus = "paid" | "unpaid" | "not_applicable";

interface FormData {
  ourChannelId: string;
  ourChannelIds: string[]; // multi-channel IDs (when creating for multiple channels)
  partnerChannelName: string;
  partnerContact: string;
  month: string;
  // Our post (we host partner's ad in our channel)
  ourPostDate: string;
  ourBookingSlot: "утро" | "обед" | "вечер" | "";
  ourReach: string;
  ourPostLink: string;
  // Partner post (they host our ad in their channel)
  partnerPostDate: string;
  partnerBookingSlot: "утро" | "обед" | "вечер" | "";
  partnerReach: string;
  partnerPostLink: string;
  // Doplate
  dealType: DealType;
  dopDirection: DopDirection | "";
  dopAmount: string;
  dopPaymentStatus: DopPaymentStatus;
  // Meta
  status: DealStatus;
  notes: string;
}

const EMPTY_FORM: FormData = {
  ourChannelId: "",
  ourChannelIds: [],
  partnerChannelName: "",
  partnerContact: "",
  month: new Date().toISOString().slice(0, 7),
  ourPostDate: "",
  ourBookingSlot: "",
  ourReach: "",
  ourPostLink: "",
  partnerPostDate: "",
  partnerBookingSlot: "",
  partnerReach: "",
  partnerPostLink: "",
  dealType: "без доплаты",
  dopDirection: "",
  dopAmount: "",
  dopPaymentStatus: "not_applicable",
  status: "предложение",
  notes: "",
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<DealStatus, { label: string; color: string; icon: React.ReactNode }> = {
  "предложение": { label: "Предложение", color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: <Clock className="w-3 h-3" /> },
  "согласовано":  { label: "Согласовано",  color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
  "размещено":    { label: "Размещено",    color: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: <ArrowRightLeft className="w-3 h-3" /> },
  "завершено":    { label: "Завершено",    color: "bg-green-500/15 text-green-400 border-green-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
  "отменено":     { label: "Отменено",     color: "bg-red-500/15 text-red-400 border-red-500/30", icon: <XCircle className="w-3 h-3" /> },
};
const STATUS_ORDER: DealStatus[] = ["предложение", "согласовано", "размещено", "завершено"];

const DOP_PAYMENT_LABELS: Record<DopPaymentStatus, string> = {
  paid: "Оплачено",
  unpaid: "Не оплачено",
  not_applicable: "—",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtReach(n: number | null | undefined) {
  if (!n) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}
function reachDiff(our: number | null | undefined, partner: number | null | undefined) {
  if (!our || !partner) return null;
  const diff = our - partner;
  return { diff, pct: Math.round(Math.abs(diff / partner) * 100) };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MutualPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("list");
  // Map of channelId -> latest views24h from snapshots
  const [channelReachMap, setChannelReachMap] = useState<Record<number, number | null>>({});

  const utils = trpc.useUtils();
  const { data: channels = [] } = trpc.channels.list.useQuery();
  const { data: deals = [], isLoading } = trpc.mutual.list.useQuery({
    month,
    status: filterStatus === "all" ? undefined : filterStatus,
    ourChannelId: filterChannel === "all" ? undefined : Number(filterChannel),
  });

  // Fetch latest snapshots for all channels to build reach map
  const { data: allSnapshots = [] } = trpc.snapshots.list.useQuery({});

  useEffect(() => {
    if (!allSnapshots.length || !channels.length) return;
    const map: Record<number, number | null> = {};
    for (const ch of channels) {
      const chSnaps = allSnapshots
        .filter((s: any) => s.channelId === ch.id && s.views24h != null)
        .sort((a: any, b: any) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime());
      map[ch.id] = chSnaps.length > 0 ? chSnaps[0].views24h : null;
    }
    setChannelReachMap(map);
  }, [allSnapshots, channels]);

  // When ourChannelId changes (single mode), auto-fill ourReach from snapshot
  useEffect(() => {
    if (!form.ourChannelId || editId) return;
    const chId = Number(form.ourChannelId);
    const reach = channelReachMap[chId];
    if (reach != null) {
      setForm(f => ({ ...f, ourReach: String(reach) }));
    }
  }, [form.ourChannelId, channelReachMap, editId]);

  const createMutation = trpc.mutual.create.useMutation({
    onSuccess: () => {
      utils.mutual.list.invalidate();
      utils.purchases.list.invalidate();
      utils.sales.list.invalidate();
      utils.summary.financial.invalidate();
      toast.success("ВП-сделка создана — продажа и закуп добавлены автоматически");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.mutual.update.useMutation({
    onSuccess: () => {
      utils.mutual.list.invalidate();
      utils.purchases.list.invalidate();
      utils.sales.list.invalidate();
      utils.summary.financial.invalidate();
      toast.success("Сделка обновлена");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.mutual.delete.useMutation({
    onSuccess: () => {
      utils.mutual.list.invalidate();
      utils.purchases.list.invalidate();
      utils.sales.list.invalidate();
      utils.summary.financial.invalidate();
      toast.success("Сделка и связанные записи удалены");
      setDeleteConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // Doplate calculator
  const ourReachNum = Number(form.ourReach) || 0;
  const partnerReachNum = Number(form.partnerReach) || 0;
  const { data: dopCalc } = trpc.mutual.calcDoplate.useQuery(
    { ourReach: ourReachNum, partnerReach: partnerReachNum },
    { enabled: ourReachNum > 0 && partnerReachNum > 0 }
  );
  const diff = ourReachNum > 0 && partnerReachNum > 0 ? reachDiff(ourReachNum, partnerReachNum) : null;

  // Analytics
  const analytics = useMemo(() => {
    const active = deals.filter(d => d.status !== "отменено");
    const completed = deals.filter(d => d.status === "завершено");
    const withDop = deals.filter(d => d.dealType === "с доплатой");
    const wePayTotal = withDop
      .filter(d => d.dopDirection === "мы платим")
      .reduce((s, d) => s + (Number(d.dopAmount) || 0), 0);
    const theyPayTotal = withDop
      .filter(d => d.dopDirection === "нам платят")
      .reduce((s, d) => s + (Number(d.dopAmount) || 0), 0);
    const byStatus = STATUS_ORDER.map(s => ({ status: s, count: deals.filter(d => d.status === s).length }));
    return { total: deals.length, active: active.length, completed: completed.length, withDop: withDop.length, wePayTotal, theyPayTotal, byStatus };
  }, [deals]);

  // Multi-channel toggle helper
  function toggleChannel(chId: string) {
    setForm(f => {
      const ids = f.ourChannelIds.includes(chId)
        ? f.ourChannelIds.filter(id => id !== chId)
        : [...f.ourChannelIds, chId];
      // Auto-fill ourReach from first selected channel's snapshot
      let ourReach = f.ourReach;
      if (ids.length === 1) {
        const reach = channelReachMap[Number(ids[0])];
        if (reach != null) ourReach = String(reach);
      }
      return { ...f, ourChannelIds: ids, ourChannelId: ids[0] ?? "", ourReach };
    });
  }

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, month });
    setDialogOpen(true);
  }

  function openEdit(d: typeof deals[0]) {
    setEditId(d.id);
    setForm({
      ourChannelId: String(d.ourChannelId),
      ourChannelIds: [String(d.ourChannelId)],
      partnerChannelName: d.partnerChannelName,
      partnerContact: d.partnerContact ?? "",
      month: d.month,
      ourPostDate: d.ourPostDate ? new Date(d.ourPostDate).toISOString().slice(0, 10) : "",
      ourBookingSlot: (d as any).ourBookingSlot ?? "",
      ourReach: d.ourReach != null ? String(d.ourReach) : "",
      ourPostLink: d.ourPostLink ?? "",
      partnerPostDate: d.partnerPostDate ? new Date(d.partnerPostDate).toISOString().slice(0, 10) : "",
      partnerBookingSlot: (d as any).partnerBookingSlot ?? "",
      partnerReach: d.partnerReach != null ? String(d.partnerReach) : "",
      partnerPostLink: d.partnerPostLink ?? "",
      dealType: d.dealType as DealType,
      dopDirection: (d.dopDirection as DopDirection) ?? "",
      dopAmount: d.dopAmount ?? "",
      dopPaymentStatus: (d.dopPaymentStatus as DopPaymentStatus) ?? "not_applicable",
      status: d.status as DealStatus,
      notes: d.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const selectedIds = editId
      ? [Number(form.ourChannelId)]
      : form.ourChannelIds.map(Number).filter(Boolean);

    if (selectedIds.length === 0) { toast.error("Выбери хотя бы один канал"); return; }
    if (!form.partnerChannelName.trim()) { toast.error("Укажи канал партнёра"); return; }

    const basePayload = {
      partnerChannelName: form.partnerChannelName.trim(),
      partnerContact: form.partnerContact || undefined,
      month: form.month,
      ourPostDate: form.ourPostDate ? new Date(form.ourPostDate) : undefined,
      ourBookingSlot: (form.ourBookingSlot || undefined) as "утро" | "обед" | "вечер" | undefined,
      ourReach: form.ourReach ? Number(form.ourReach) : undefined,
      ourPostLink: form.ourPostLink || undefined,
      partnerPostDate: form.partnerPostDate ? new Date(form.partnerPostDate) : undefined,
      partnerBookingSlot: (form.partnerBookingSlot || undefined) as "утро" | "обед" | "вечер" | undefined,
      partnerReach: form.partnerReach ? Number(form.partnerReach) : undefined,
      partnerPostLink: form.partnerPostLink || undefined,
      dealType: form.dealType,
      dopDirection: (form.dopDirection || undefined) as DopDirection | undefined,
      dopAmount: form.dopAmount || undefined,
      dopPaymentStatus: form.dopPaymentStatus,
      status: form.status,
      notes: form.notes || undefined,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ourChannelId: selectedIds[0], ...basePayload });
    } else if (selectedIds.length === 1) {
      createMutation.mutate({ ourChannelId: selectedIds[0], ourChannelIds: selectedIds, ...basePayload });
    } else {
      // Create one deal per selected channel sequentially
      const createNext = (idx: number) => {
        if (idx >= selectedIds.length) {
          utils.mutual.list.invalidate();
          utils.purchases.list.invalidate();
          utils.sales.list.invalidate();
          utils.summary.financial.invalidate();
          toast.success(`Создано ${selectedIds.length} ВП-сделок`);
          setDialogOpen(false);
          return;
        }
        const chId = selectedIds[idx];
        const reach = channelReachMap[chId] ?? (form.ourReach ? Number(form.ourReach) : undefined);
        createMutation.mutate(
          { ourChannelId: chId, ourChannelIds: [chId], ...basePayload, ourReach: reach ?? basePayload.ourReach },
          { onSuccess: () => createNext(idx + 1), onError: (e) => toast.error(e.message) }
        );
      };
      createNext(0);
    }
  }

  function advanceStatus(d: typeof deals[0]) {
    const idx = STATUS_ORDER.indexOf(d.status as DealStatus);
    if (idx < 0 || idx >= STATUS_ORDER.length - 1) return;
    updateMutation.mutate({ id: d.id, status: STATUS_ORDER[idx + 1] });
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Handshake className="w-5 h-5 text-primary" />
            Взаимные подписки (ВП)
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Каждая ВП автоматически создаёт запись в Закупе и Продаже
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-36 h-9 text-sm" />
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="w-4 h-4" />Новая ВП
          </Button>
        </div>
      </div>
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="list" className="text-xs gap-1"><Handshake className="w-3 h-3" />Сделки</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs gap-1"><BarChart3 className="w-3 h-3" />Аналитика</TabsTrigger>
          <TabsTrigger value="calculator" className="text-xs gap-1"><Calculator className="w-3 h-3" />Калькулятор</TabsTrigger>
        </TabsList>
        {/* ── LIST TAB ── */}
        <TabsContent value="list" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Статус" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Наш канал" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все каналы</SelectItem>
                {channels.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[1,2,3].map(i => <div key={i} className="h-48 rounded-xl bg-muted/30 animate-pulse" />)}
            </div>
          ) : deals.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Handshake className="w-12 h-12 text-muted-foreground/30 mx-auto" />
              <p className="text-muted-foreground text-sm">Нет ВП-сделок за этот период</p>
              <Button variant="outline" size="sm" onClick={openCreate}>Создать первую</Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {deals.map(d => {
                const sc = STATUS_CONFIG[d.status as DealStatus] ?? STATUS_CONFIG["предложение"];
                const rd = reachDiff(d.ourReach ?? undefined, d.partnerReach ?? undefined);
                const ourCh = channels.find(c => c.id === d.ourChannelId);
                const canAdvance = STATUS_ORDER.indexOf(d.status as DealStatus) < STATUS_ORDER.length - 1;
                return (
                  <Card key={d.id} className="glass border-border/50 hover:border-primary/30 transition-all">
                    <CardHeader className="pb-2 pt-4 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{d.partnerChannelName}</p>
                          {ourCh && <p className="text-xs text-muted-foreground truncate">← {ourCh.name}</p>}
                        </div>
                        <Badge className={`text-xs border shrink-0 gap-1 ${sc.color}`}>
                          {sc.icon}{sc.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                      {/* Two-sided reach display */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-primary/8 rounded-lg px-2.5 py-2 space-y-1">
                          <p className="text-xs font-medium text-primary flex items-center gap-1">
                            <ArrowUp className="w-3 h-3" />Наш пост
                          </p>
                          <p className="text-sm font-bold text-foreground">{fmtReach(d.ourReach)}</p>
                          {d.ourPostDate && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(d.ourPostDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                            </p>
                          )}
                          {d.ourPostLink && (
                            <a href={d.ourPostLink} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                              <ExternalLink className="w-2.5 h-2.5" />ссылка
                            </a>
                          )}
                        </div>
                        <div className="bg-accent/40 rounded-lg px-2.5 py-2 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                            <ArrowDown className="w-3 h-3" />Пост партнёра
                          </p>
                          <p className="text-sm font-bold text-foreground">{fmtReach(d.partnerReach)}</p>
                          {d.partnerPostDate && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(d.partnerPostDate).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                            </p>
                          )}
                          {d.partnerPostLink && (
                            <a href={d.partnerPostLink} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                              <ExternalLink className="w-2.5 h-2.5" />ссылка
                            </a>
                          )}
                        </div>
                      </div>
                      {/* Reach diff badge */}
                      {rd && (
                        <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${rd.diff > 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                          {rd.diff > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          <span>{rd.diff > 0 ? "+" : ""}{rd.diff.toLocaleString()} охватов ({rd.pct}%)</span>
                        </div>
                      )}
                      {/* Doplate */}
                      {d.dealType === "с доплатой" && d.dopAmount && (
                        <div className="flex items-center justify-between text-xs bg-accent/30 rounded-md px-2 py-1">
                          <span className="text-muted-foreground">{d.dopDirection === "мы платим" ? "Мы платим:" : "Нам платят:"}</span>
                          <span className="font-medium">{Number(d.dopAmount).toLocaleString()} ₽ · {DOP_PAYMENT_LABELS[d.dopPaymentStatus as DopPaymentStatus]}</span>
                        </div>
                      )}
                      {/* Actions */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {canAdvance && (
                          <Button size="sm" variant="outline" className="h-7 text-xs flex-1 gap-1" onClick={() => advanceStatus(d)}>
                            <ChevronRight className="w-3 h-3" />
                            {STATUS_CONFIG[STATUS_ORDER[STATUS_ORDER.indexOf(d.status as DealStatus) + 1]]?.label}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => openEdit(d)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(d.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── ANALYTICS TAB ── */}
        <TabsContent value="analytics" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="glass border-border/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Всего сделок</p>
                <p className="text-2xl font-bold text-foreground mt-1">{analytics.total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{analytics.active} активных</p>
              </CardContent>
            </Card>
            <Card className="glass border-border/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Завершено</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{analytics.completed}</p>
              </CardContent>
            </Card>
            <Card className="glass border-border/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Нам платят</p>
                <p className="text-2xl font-bold text-primary mt-1">{analytics.theyPayTotal.toLocaleString()} ₽</p>
              </CardContent>
            </Card>
            <Card className="glass border-border/50">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Мы платим</p>
                <p className="text-2xl font-bold text-red-400 mt-1">{analytics.wePayTotal.toLocaleString()} ₽</p>
              </CardContent>
            </Card>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Card className="glass border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Воронка статусов</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {analytics.byStatus.map(({ status, count }) => {
                  const sc = STATUS_CONFIG[status];
                  return (
                    <div key={status} className="flex items-center justify-between">
                      <Badge className={`text-xs border gap-1 ${sc.color}`}>{sc.icon}{sc.label}</Badge>
                      <span className="text-sm font-medium">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card className="glass border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Охваты по каналам</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {channels.map(ch => {
                  const chDeals = deals.filter(d => d.ourChannelId === ch.id && d.ourReach);
                  if (!chDeals.length) return null;
                  const avgReach = Math.round(chDeals.reduce((s, d) => s + (d.ourReach ?? 0), 0) / chDeals.length);
                  return (
                    <div key={ch.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[60%]">{ch.name}</span>
                      <span className="font-medium">{fmtReach(avgReach)} avg · {chDeals.length} ВП</span>
                    </div>
                  );
                })}
                {channels.every(ch => !deals.find(d => d.ourChannelId === ch.id)) && (
                  <p className="text-xs text-muted-foreground">Нет данных за период</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── CALCULATOR TAB ── */}
        <TabsContent value="calculator" className="mt-4">
          <Card className="glass border-border/50 max-w-md">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="w-4 h-4 text-primary" />Калькулятор доплаты
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Наши охваты</Label>
                  <Input
                    type="number"
                    placeholder="50000"
                    value={form.ourReach}
                    onChange={e => setForm(f => ({ ...f, ourReach: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Охваты партнёра</Label>
                  <Input
                    type="number"
                    placeholder="30000"
                    value={form.partnerReach}
                    onChange={e => setForm(f => ({ ...f, partnerReach: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              {diff && dopCalc && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Разница охватов:</span>
                    <span className={`font-medium ${diff.diff > 0 ? "text-green-400" : "text-red-400"}`}>
                      {diff.diff > 0 ? "+" : ""}{diff.diff.toLocaleString()} ({diff.pct}%)
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Рекомендуемая доплата:</span>
                    <span className="font-bold text-primary text-sm">{dopCalc.recommendedAmount.toLocaleString()} ₽</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {diff.diff > 0 ? "Партнёр платит нам (наши охваты больше)" : "Мы платим партнёру (их охваты больше)"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── CREATE / EDIT DIALOG ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Редактировать ВП-сделку" : "Новая ВП-сделка"}</DialogTitle>
            {!editId && (
              <p className="text-xs text-muted-foreground">
                Автоматически создаст запись в Продаже (наш пост) и Закупе (пост партнёра)
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-1">

            {/* ── Channel selector ── */}
            {editId ? (
              // Edit mode: single channel select
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Наш канал *</Label>
                  <Select value={form.ourChannelId} onValueChange={v => setForm(f => ({ ...f, ourChannelId: v, ourChannelIds: [v] }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Выбери канал" /></SelectTrigger>
                    <SelectContent>
                      {channels.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Статус</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as DealStatus }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              // Create mode: multi-channel checkboxes
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  <Users className="w-3 h-3" />Наши каналы * <span className="text-muted-foreground font-normal">(можно выбрать несколько)</span>
                </Label>
                <div className="grid grid-cols-2 gap-1.5 p-3 rounded-lg border border-border/50 bg-accent/10 max-h-40 overflow-y-auto">
                  {channels.map(c => {
                    const reach = channelReachMap[c.id];
                    const checked = form.ourChannelIds.includes(String(c.id));
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs ${checked ? "bg-primary/15 text-primary" : "hover:bg-accent/30 text-foreground"}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleChannel(String(c.id))}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate flex-1">{c.name}</span>
                        {reach != null && (
                          <span className="text-muted-foreground shrink-0">{fmtReach(reach)}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {form.ourChannelIds.length > 1 && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    <Handshake className="w-3 h-3" />
                    Будет создано {form.ourChannelIds.length} отдельных ВП-сделок
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Канал партнёра *</Label>
                <Input
                  placeholder="@channel или название"
                  value={form.partnerChannelName}
                  onChange={e => setForm(f => ({ ...f, partnerChannelName: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Контакт партнёра</Label>
                <Input
                  placeholder="@username"
                  value={form.partnerContact}
                  onChange={e => setForm(f => ({ ...f, partnerContact: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Status for create mode */}
            {!editId && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Месяц *</Label>
                  <Input
                    type="month"
                    value={form.month}
                    onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Статус</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as DealStatus }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {editId && (
              <div className="space-y-1.5">
                <Label className="text-xs">Месяц *</Label>
                <Input
                  type="month"
                  value={form.month}
                  onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
                  className="h-9 text-sm w-40"
                />
              </div>
            )}

            {/* Two-sided post sections */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
                <p className="text-xs font-semibold text-primary flex items-center gap-1">
                  <ArrowUp className="w-3 h-3" />Наш пост
                </p>
                <p className="text-xs text-muted-foreground -mt-1">Мы размещаем рекламу партнёра</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Дата размещения</Label>
                  <Input type="date" value={form.ourPostDate} onChange={e => setForm(f => ({ ...f, ourPostDate: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Слот в расписании</Label>
                  <Select value={form.ourBookingSlot} onValueChange={v => setForm(f => ({ ...f, ourBookingSlot: v as any }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Не выбран" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="утро">Утро</SelectItem>
                      <SelectItem value="обед">Обед</SelectItem>
                      <SelectItem value="вечер">Вечер</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    Охват
                    {form.ourChannelIds.length === 1 && channelReachMap[Number(form.ourChannelIds[0])] != null && (
                      <span className="text-primary font-normal">(авто из снимка)</span>
                    )}
                  </Label>
                  <Input type="number" placeholder="50000" value={form.ourReach} onChange={e => setForm(f => ({ ...f, ourReach: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ссылка на пост</Label>
                  <Input placeholder="https://..." value={form.ourPostLink} onChange={e => setForm(f => ({ ...f, ourPostLink: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>

              <div className="space-y-2 p-3 rounded-lg border border-border/50 bg-accent/20">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <ArrowDown className="w-3 h-3" />Пост партнёра
                </p>
                <p className="text-xs text-muted-foreground -mt-1">Они размещают нашу рекламу</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Дата размещения</Label>
                  <Input type="date" value={form.partnerPostDate} onChange={e => setForm(f => ({ ...f, partnerPostDate: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Слот в расписании</Label>
                  <Select value={form.partnerBookingSlot} onValueChange={v => setForm(f => ({ ...f, partnerBookingSlot: v as any }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Не выбран" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="утро">Утро</SelectItem>
                      <SelectItem value="обед">Обед</SelectItem>
                      <SelectItem value="вечер">Вечер</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Охват</Label>
                  <Input type="number" placeholder="30000" value={form.partnerReach} onChange={e => setForm(f => ({ ...f, partnerReach: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ссылка на пост</Label>
                  <Input placeholder="https://..." value={form.partnerPostLink} onChange={e => setForm(f => ({ ...f, partnerPostLink: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>
            </div>

            {diff && dopCalc && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calculator className="w-3 h-3" />Рекомендуемая доплата:
                </span>
                <span className="font-bold text-primary">
                  {dopCalc.recommendedAmount.toLocaleString()} ₽
                  {" "}({diff.diff > 0 ? "партнёр платит нам" : "мы платим партнёру"})
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Тип сделки</Label>
              <Select
                value={form.dealType}
                onValueChange={v => setForm(f => ({
                  ...f,
                  dealType: v as DealType,
                  dopDirection: v === "без доплаты" ? "" : f.dopDirection,
                  dopPaymentStatus: v === "без доплаты" ? "not_applicable" : f.dopPaymentStatus,
                }))}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="без доплаты">Без доплаты</SelectItem>
                  <SelectItem value="с доплатой">С доплатой</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.dealType === "с доплатой" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Направление</Label>
                  <Select value={form.dopDirection} onValueChange={v => setForm(f => ({ ...f, dopDirection: v as DopDirection }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Кто платит" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="мы платим">Мы платим</SelectItem>
                      <SelectItem value="нам платят">Нам платят</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Сумма (₽)</Label>
                  <Input type="number" placeholder="1000" value={form.dopAmount} onChange={e => setForm(f => ({ ...f, dopAmount: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Статус оплаты</Label>
                  <Select value={form.dopPaymentStatus} onValueChange={v => setForm(f => ({ ...f, dopPaymentStatus: v as DopPaymentStatus }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unpaid">Не оплачено</SelectItem>
                      <SelectItem value="paid">Оплачено</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Заметки</Label>
              <Textarea
                placeholder="Дополнительная информация..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="text-sm resize-none"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editId ? "Сохранить" : form.ourChannelIds.length > 1 ? `Создать ${form.ourChannelIds.length} ВП` : "Создать ВП"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM ── */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Удалить сделку?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Это удалит ВП-сделку и связанные с ней записи в Продаже и Закупе. Действие нельзя отменить.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate({ id: deleteConfirm })}
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
