import { useState, useMemo } from "react";
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
import {
  Plus, Pencil, Trash2, ExternalLink, TrendingUp, TrendingDown,
  Handshake, BarChart3, ArrowRightLeft, CheckCircle2, XCircle,
  Clock, ChevronRight, Calculator,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type DealStatus = "предложение" | "согласовано" | "размещено" | "завершено" | "отменено";
type DealType = "без доплаты" | "с доплатой";
type DopDirection = "мы платим" | "нам платят";
type DopPaymentStatus = "paid" | "unpaid" | "not_applicable";

interface FormData {
  ourChannelId: string;
  partnerChannelName: string;
  partnerContact: string;
  dealDate: string;
  ourReach: string;
  partnerReach: string;
  dealType: DealType;
  dopDirection: DopDirection | "";
  dopAmount: string;
  dopPaymentStatus: DopPaymentStatus;
  ourPostLink: string;
  partnerPostLink: string;
  status: DealStatus;
  month: string;
  notes: string;
}

const EMPTY_FORM: FormData = {
  ourChannelId: "",
  partnerChannelName: "",
  partnerContact: "",
  dealDate: "",
  ourReach: "",
  partnerReach: "",
  dealType: "без доплаты",
  dopDirection: "",
  dopAmount: "",
  dopPaymentStatus: "not_applicable",
  ourPostLink: "",
  partnerPostLink: "",
  status: "предложение",
  month: new Date().toISOString().slice(0, 7),
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

  const utils = trpc.useUtils();

  const { data: channels = [] } = trpc.channels.list.useQuery();
  const { data: deals = [], isLoading } = trpc.mutual.list.useQuery({
    month,
    status: filterStatus === "all" ? undefined : filterStatus,
    ourChannelId: filterChannel === "all" ? undefined : Number(filterChannel),
  });

  const createMutation = trpc.mutual.create.useMutation({
    onSuccess: () => { utils.mutual.list.invalidate(); toast.success("ВП-сделка создана"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.mutual.update.useMutation({
    onSuccess: () => { utils.mutual.list.invalidate(); toast.success("Сделка обновлена"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.mutual.delete.useMutation({
    onSuccess: () => { utils.mutual.list.invalidate(); toast.success("Сделка удалена"); setDeleteConfirm(null); },
    onError: (e) => toast.error(e.message),
  });

  // Doplate calculator
  const ourReachNum = Number(form.ourReach) || 0;
  const partnerReachNum = Number(form.partnerReach) || 0;
  const { data: dopCalc } = trpc.mutual.calcDoplate.useQuery(
    { ourReach: ourReachNum, partnerReach: partnerReachNum },
    { enabled: ourReachNum > 0 && partnerReachNum > 0 }
  );

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

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, month });
    setDialogOpen(true);
  }

  function openEdit(d: typeof deals[0]) {
    setEditId(d.id);
    setForm({
      ourChannelId: String(d.ourChannelId),
      partnerChannelName: d.partnerChannelName,
      partnerContact: d.partnerContact ?? "",
      dealDate: d.dealDate ? new Date(d.dealDate).toISOString().slice(0, 10) : "",
      ourReach: d.ourReach != null ? String(d.ourReach) : "",
      partnerReach: d.partnerReach != null ? String(d.partnerReach) : "",
      dealType: d.dealType as DealType,
      dopDirection: (d.dopDirection as DopDirection) ?? "",
      dopAmount: d.dopAmount ?? "",
      dopPaymentStatus: (d.dopPaymentStatus as DopPaymentStatus) ?? "not_applicable",
      ourPostLink: d.ourPostLink ?? "",
      partnerPostLink: d.partnerPostLink ?? "",
      status: d.status as DealStatus,
      month: d.month,
      notes: d.notes ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.ourChannelId) { toast.error("Выбери наш канал"); return; }
    if (!form.partnerChannelName.trim()) { toast.error("Укажи канал партнёра"); return; }

    const payload = {
      ourChannelId: Number(form.ourChannelId),
      partnerChannelName: form.partnerChannelName.trim(),
      partnerContact: form.partnerContact || undefined,
      dealDate: form.dealDate ? new Date(form.dealDate) : undefined,
      ourReach: form.ourReach ? Number(form.ourReach) : undefined,
      partnerReach: form.partnerReach ? Number(form.partnerReach) : undefined,
      dealType: form.dealType,
      dopDirection: (form.dopDirection || undefined) as DopDirection | undefined,
      dopAmount: form.dopAmount || undefined,
      dopPaymentStatus: form.dopPaymentStatus,
      ourPostLink: form.ourPostLink || undefined,
      partnerPostLink: form.partnerPostLink || undefined,
      status: form.status,
      month: form.month,
      notes: form.notes || undefined,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function advanceStatus(d: typeof deals[0]) {
    const idx = STATUS_ORDER.indexOf(d.status as DealStatus);
    if (idx < 0 || idx >= STATUS_ORDER.length - 1) return;
    const nextStatus = STATUS_ORDER[idx + 1];
    updateMutation.mutate({ id: d.id, status: nextStatus });
  }

  const diff = reachDiff(ourReachNum || undefined, partnerReachNum || undefined);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Handshake className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Взаимки</h1>
            <p className="text-xs text-muted-foreground">Взаимная подписка с партнёрами</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-36 h-9 text-sm" />
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="w-4 h-4" /> Новая ВП
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="list" className="text-xs gap-1.5"><Handshake className="w-3.5 h-3.5" />Сделки</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs gap-1.5"><BarChart3 className="w-3.5 h-3.5" />Аналитика</TabsTrigger>
          <TabsTrigger value="calculator" className="text-xs gap-1.5"><Calculator className="w-3.5 h-3.5" />Калькулятор</TabsTrigger>
        </TabsList>

        {/* ── LIST TAB ── */}
        <TabsContent value="list" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
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

          {/* Pipeline header */}
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground px-1">
            {STATUS_ORDER.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <span className={`px-2 py-0.5 rounded-full border ${STATUS_CONFIG[s].color}`}>{STATUS_CONFIG[s].label}</span>
                {i < STATUS_ORDER.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/50" />}
              </div>
            ))}
          </div>

          {/* Deal cards */}
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Загрузка...</div>
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
                      {/* Reach row */}
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span>Наши:</span>
                          <span className="font-medium text-foreground">{fmtReach(d.ourReach)}</span>
                        </div>
                        <ArrowRightLeft className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span>Партнёр:</span>
                          <span className="font-medium text-foreground">{fmtReach(d.partnerReach)}</span>
                        </div>
                        {rd && (
                          <span className={`ml-auto font-medium ${rd.diff > 0 ? "text-green-400" : "text-red-400"}`}>
                            {rd.diff > 0 ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />}
                            {" "}{rd.pct}%
                          </span>
                        )}
                      </div>

                      {/* Doplate */}
                      {d.dealType === "с доплатой" && (
                        <div className="flex items-center gap-2 text-xs bg-accent/40 rounded-lg px-2.5 py-1.5">
                          <span className="text-muted-foreground">Доплата:</span>
                          <span className="font-medium text-foreground">{d.dopDirection === "мы платим" ? "Мы платим" : "Нам платят"}</span>
                          {d.dopAmount && <span className="font-semibold text-primary">{d.dopAmount} ₽</span>}
                          <Badge variant="outline" className={`ml-auto text-xs ${d.dopPaymentStatus === "paid" ? "text-green-400 border-green-500/30" : d.dopPaymentStatus === "unpaid" ? "text-red-400 border-red-500/30" : "text-muted-foreground"}`}>
                            {DOP_PAYMENT_LABELS[d.dopPaymentStatus as DopPaymentStatus]}
                          </Badge>
                        </div>
                      )}

                      {/* Links */}
                      {(d.ourPostLink || d.partnerPostLink) && (
                        <div className="flex gap-2 text-xs">
                          {d.ourPostLink && (
                            <a href={d.ourPostLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                              <ExternalLink className="w-3 h-3" />Наш пост
                            </a>
                          )}
                          {d.partnerPostLink && (
                            <a href={d.partnerPostLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                              <ExternalLink className="w-3 h-3" />Пост партнёра
                            </a>
                          )}
                        </div>
                      )}

                      {d.notes && <p className="text-xs text-muted-foreground line-clamp-2 italic">{d.notes}</p>}

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {canAdvance && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs flex-1 gap-1"
                            onClick={() => advanceStatus(d)}
                            disabled={updateMutation.isPending}
                          >
                            <ChevronRight className="w-3 h-3" />
                            {STATUS_CONFIG[STATUS_ORDER[STATUS_ORDER.indexOf(d.status as DealStatus) + 1]]?.label}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(d)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(d.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
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
        <TabsContent value="analytics" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Всего сделок", value: analytics.total, icon: <Handshake className="w-4 h-4" />, color: "text-primary" },
              { label: "Активных", value: analytics.active, icon: <Clock className="w-4 h-4" />, color: "text-yellow-400" },
              { label: "Завершено", value: analytics.completed, icon: <CheckCircle2 className="w-4 h-4" />, color: "text-green-400" },
              { label: "С доплатой", value: analytics.withDop, icon: <ArrowRightLeft className="w-4 h-4" />, color: "text-purple-400" },
            ].map(m => (
              <Card key={m.label} className="glass border-border/50">
                <CardContent className="p-4">
                  <div className={`${m.color} mb-2`}>{m.icon}</div>
                  <p className="text-2xl font-bold text-foreground">{m.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Doplate summary */}
          <div className="grid md:grid-cols-2 gap-3">
            <Card className="glass border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />Мы платим доплату
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold text-red-400">{analytics.wePayTotal.toLocaleString()} ₽</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {deals.filter(d => d.dopDirection === "мы платим").length} сделок с доплатой
                </p>
              </CardContent>
            </Card>
            <Card className="glass border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />Нам платят доплату
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-2xl font-bold text-green-400">{analytics.theyPayTotal.toLocaleString()} ₽</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {deals.filter(d => d.dopDirection === "нам платят").length} сделок с доплатой
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Pipeline stats */}
          <Card className="glass border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Воронка по статусам</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {analytics.byStatus.map(({ status, count }) => {
                const sc = STATUS_CONFIG[status];
                const pct = analytics.total > 0 ? Math.round((count / analytics.total) * 100) : 0;
                return (
                  <div key={status} className="flex items-center gap-3">
                    <Badge className={`text-xs border w-28 justify-center gap-1 ${sc.color}`}>{sc.icon}{sc.label}</Badge>
                    <div className="flex-1 h-2 bg-accent rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
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
              <p className="text-xs text-muted-foreground">Введи охваты обоих каналов, чтобы рассчитать справедливую доплату.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Наши охваты</Label>
                  <Input
                    type="number"
                    placeholder="например 50000"
                    value={form.ourReach}
                    onChange={e => setForm(f => ({ ...f, ourReach: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Охваты партнёра</Label>
                  <Input
                    type="number"
                    placeholder="например 30000"
                    value={form.partnerReach}
                    onChange={e => setForm(f => ({ ...f, partnerReach: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {diff && (
                <div className="bg-accent/40 rounded-xl p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Разница охватов:</span>
                    <span className={`font-semibold ${diff.diff > 0 ? "text-green-400" : "text-red-400"}`}>
                      {diff.diff > 0 ? "+" : ""}{diff.diff.toLocaleString()} ({diff.pct}%)
                    </span>
                  </div>
                  {diff.diff > 0 ? (
                    <p className="text-xs text-muted-foreground">Наши охваты выше — партнёр должен доплатить</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Охваты партнёра выше — мы должны доплатить</p>
                  )}
                  {dopCalc && (
                    <>
                      <div className="flex justify-between border-t border-border/50 pt-2">
                        <span className="text-muted-foreground">Рекомендуемая доплата:</span>
                        <span className="font-bold text-primary text-base">{dopCalc.recommendedAmount.toLocaleString()} ₽</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Разница: {Math.abs(dopCalc.diff).toLocaleString()} охватов
                      </p>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── FORM DIALOG ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Редактировать ВП-сделку" : "Новая ВП-сделка"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Our channel */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Наш канал *</Label>
                <Select value={form.ourChannelId} onValueChange={v => setForm(f => ({ ...f, ourChannelId: v }))}>
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

            {/* Partner info */}
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

            {/* Date & Month */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Дата размещения</Label>
                <Input
                  type="date"
                  value={form.dealDate}
                  onChange={e => setForm(f => ({ ...f, dealDate: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Месяц *</Label>
                <Input
                  type="month"
                  value={form.month}
                  onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Reach */}
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

            {/* Doplate calculator hint */}
            {diff && dopCalc && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Рекомендуемая доплата:</span>
                <span className="font-bold text-primary">{dopCalc.recommendedAmount.toLocaleString()} ₽
                  {" "}({diff.diff > 0 ? "партнёр платит" : "мы платим"})
                </span>
              </div>
            )}

            {/* Deal type */}
            <div className="space-y-1.5">
              <Label className="text-xs">Тип сделки</Label>
              <Select value={form.dealType} onValueChange={v => setForm(f => ({ ...f, dealType: v as DealType, dopDirection: v === "без доплаты" ? "" : f.dopDirection, dopPaymentStatus: v === "без доплаты" ? "not_applicable" : f.dopPaymentStatus }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="без доплаты">Без доплаты</SelectItem>
                  <SelectItem value="с доплатой">С доплатой</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Doplate fields */}
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
                  <Input
                    type="number"
                    placeholder="1000"
                    value={form.dopAmount}
                    onChange={e => setForm(f => ({ ...f, dopAmount: e.target.value }))}
                    className="h-9 text-sm"
                  />
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

            {/* Post links */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Ссылка на наш пост</Label>
                <Input
                  placeholder="https://..."
                  value={form.ourPostLink}
                  onChange={e => setForm(f => ({ ...f, ourPostLink: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ссылка на пост партнёра</Label>
                <Input
                  placeholder="https://..."
                  value={form.partnerPostLink}
                  onChange={e => setForm(f => ({ ...f, partnerPostLink: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Notes */}
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
              {editId ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRM ── */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Удалить сделку?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Это действие нельзя отменить.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Отмена</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteMutation.mutate({ id: deleteConfirm })} disabled={deleteMutation.isPending}>
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
