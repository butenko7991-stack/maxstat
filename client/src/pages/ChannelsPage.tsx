import { useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, X, Check, Users, ChevronDown, ChevronUp, Save, Camera, Loader2, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ChannelFormData {
  name: string;
  description: string;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Subscriber Snapshot Section ─────────────────────────────────────────────
interface SnapshotSectionProps {
  channelId: number;
  channelName: string;
}

function SnapshotSection({ channelId, channelName }: SnapshotSectionProps) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  const [snapDate, setSnapDate] = useState(todayIso);
  const [snapCount, setSnapCount] = useState("");
  const [snapNotes, setSnapNotes] = useState("");
  const [snapViews24h, setSnapViews24h] = useState("");
  const [snapViews48h, setSnapViews48h] = useState("");
  const [snapViews72h, setSnapViews72h] = useState("");
  const [snapEr24, setSnapEr24] = useState("");
  const [snapWeeklyGrowth, setSnapWeeklyGrowth] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // OCR state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const recognizeTrustatMutation = trpc.ocr.recognizeTrustatScreenshot.useMutation();

  const handleTrustatUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrStatus("loading");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const imageBase64 = dataUrl.split(",")[1];
      const mimeType = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
      setOcrPreview(dataUrl);
      try {
        const response = await recognizeTrustatMutation.mutateAsync({ imageBase64, mimeType });
        if (!response.success) {
          setOcrStatus("error");
          toast.error("AI не смог распознать скрин Trustat");
          return;
        }
        const d = response.data;
        if (d.subscriberCount != null) setSnapCount(String(d.subscriberCount));
        if (d.views24h != null) setSnapViews24h(String(d.views24h));
        if (d.views48h != null) setSnapViews48h(String(d.views48h));
        if (d.views72h != null) setSnapViews72h(String(d.views72h));
        if (d.er24 != null) setSnapEr24(String(d.er24));
        if (d.weeklyGrowth != null) setSnapWeeklyGrowth(String(d.weeklyGrowth));
        if (d.snapshotDate) setSnapDate(d.snapshotDate);
        setOcrStatus("done");
        toast.success("Данные Trustat распознаны — проверьте и сохраните");
      } catch {
        setOcrStatus("error");
        toast.error("Ошибка распознавания скрина");
      }
    };
    reader.readAsDataURL(file);
  };

  const { data: snapshots, isLoading, isError } = trpc.snapshots.list.useQuery(
    { channelId },
    { enabled: expanded }
  );

  const upsertMutation = trpc.snapshots.upsert.useMutation({
    onSuccess: () => {
      utils.snapshots.list.invalidate({ channelId });
      toast.success("Снимок сохранён");
      setSnapCount("");
      setSnapNotes("");
      setSnapViews24h("");
      setSnapViews48h("");
      setSnapViews72h("");
      setSnapEr24("");
      setSnapWeeklyGrowth("");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.snapshots.delete.useMutation({
    onSuccess: () => {
      utils.snapshots.list.invalidate({ channelId });
      toast.success("Снимок удалён");
      setDeleteConfirmId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!snapCount || !snapDate) return;
    upsertMutation.mutate({
      channelId,
      subscriberCount: Number(snapCount),
      snapshotDate: snapDate,
      notes: snapNotes || undefined,
      views24h: snapViews24h ? Number(snapViews24h) : undefined,
      views48h: snapViews48h ? Number(snapViews48h) : undefined,
      views72h: snapViews72h ? Number(snapViews72h) : undefined,
      er24: snapEr24 ? Number(snapEr24) : undefined,
      weeklyGrowth: snapWeeklyGrowth ? Number(snapWeeklyGrowth) : undefined,
    });
  }

  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <Users className="w-3.5 h-3.5" />
        <span className="font-medium">Подписчики</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Trustat OCR block */}
          <div className="rounded-xl border border-violet-800/40 bg-violet-950/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-violet-400/80 font-medium">
                <Camera className="w-3.5 h-3.5" />
                Загрузить скрин Trustat
              </div>
              {ocrStatus === "done" && (
                <div className="flex items-center gap-1 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Распознано
                </div>
              )}
              {ocrStatus === "error" && (
                <div className="text-xs text-red-400">Ошибка распознавания</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleTrustatUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs border-violet-700/50 text-violet-300 hover:bg-violet-900/30 h-8"
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
              AI заполнит: подписчики, охваты 24/48/72ч, ER24, прирост, дата
            </p>
          </div>

          {/* Add snapshot form */}
          <form onSubmit={handleSave} className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1 flex-1 min-w-[120px]">
              <Label className="text-xs">Дата</Label>
              <Input
                type="date"
                value={snapDate}
                onChange={(e) => setSnapDate(e.target.value)}
                className="bg-input border-border h-8 text-xs"
                required
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[100px]">
              <Label className="text-xs">Подписчиков</Label>
              <Input
                type="number"
                value={snapCount}
                onChange={(e) => setSnapCount(e.target.value)}
                placeholder="0"
                className="bg-input border-border h-8 text-xs"
                min={0}
                required
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[80px]">
              <Label className="text-xs">Охваты 24ч</Label>
              <Input
                type="number"
                value={snapViews24h}
                onChange={(e) => setSnapViews24h(e.target.value)}
                placeholder="0"
                className="bg-input border-border h-8 text-xs"
                min={0}
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[80px]">
              <Label className="text-xs">Охваты 48ч</Label>
              <Input
                type="number"
                value={snapViews48h}
                onChange={(e) => setSnapViews48h(e.target.value)}
                placeholder="0"
                className="bg-input border-border h-8 text-xs"
                min={0}
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[80px]">
              <Label className="text-xs">Охваты 72ч</Label>
              <Input
                type="number"
                value={snapViews72h}
                onChange={(e) => setSnapViews72h(e.target.value)}
                placeholder="0"
                className="bg-input border-border h-8 text-xs"
                min={0}
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[70px]">
              <Label className="text-xs">ER24 (%)</Label>
              <Input
                type="number"
                value={snapEr24}
                onChange={(e) => setSnapEr24(e.target.value)}
                placeholder="0.00"
                className="bg-input border-border h-8 text-xs"
                min={0}
                max={100}
                step={0.01}
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[80px]">
              <Label className="text-xs">Прирост/нед</Label>
              <Input
                type="number"
                value={snapWeeklyGrowth}
                onChange={(e) => setSnapWeeklyGrowth(e.target.value)}
                placeholder="0"
                className="bg-input border-border h-8 text-xs"
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[120px]">
              <Label className="text-xs">Заметка (необяз.)</Label>
              <Input
                value={snapNotes}
                onChange={(e) => setSnapNotes(e.target.value)}
                placeholder="Необязательно"
                className="bg-input border-border h-8 text-xs"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="h-8 gap-1.5 shrink-0"
              disabled={upsertMutation.isPending || !snapCount}
            >
              <Save className="w-3.5 h-3.5" />
              Сохранить
            </Button>
          </form>

          {/* Snapshot history */}
          {isLoading ? (
            <div className="space-y-1.5">
              {[1, 2].map((i) => <div key={i} className="h-8 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : isError ? (
            <p className="text-xs text-red-400 text-center py-2">Ошибка загрузки снимков. Попробуйте позже.</p>
          ) : !snapshots?.length ? (
            <p className="text-xs text-muted-foreground text-center py-2">Нет снимков. Добавьте первый.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {[...snapshots].sort((a, b) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime()).map((snap, idx, arr) => {
                const prev = arr[idx + 1];
                const growth = prev ? snap.subscriberCount - prev.subscriberCount : null;
                return (
                  <div key={snap.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 border border-border/40 px-3 py-1.5 group">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{formatDate(snap.snapshotDate)}</span>
                    <span className="text-xs font-semibold text-foreground">{snap.subscriberCount.toLocaleString("ru-RU")}</span>
                    {growth !== null && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${growth >= 0 ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>
                        {growth >= 0 ? "+" : ""}{growth.toLocaleString("ru-RU")}
                      </span>
                    )}
                    {snap.views24h != null && (
                      <span className="text-[10px] text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded">
                        👁 {snap.views24h.toLocaleString("ru-RU")}
                      </span>
                    )}
                    {snap.er24 != null && (
                      <span className="text-[10px] text-violet-400 bg-violet-400/10 px-1.5 py-0.5 rounded">
                        ER {parseFloat(String(snap.er24)).toFixed(2)}%
                      </span>
                    )}
                    {snap.notes && <span className="text-[10px] text-muted-foreground flex-1 truncate">{snap.notes}</span>}
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      {deleteConfirmId === snap.id ? (
                        <>
                          <button
                            onClick={() => deleteMutation.mutate({ id: snap.id })}
                            className="p-1 rounded text-destructive hover:bg-destructive/15 transition-colors"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="p-1 rounded text-muted-foreground hover:bg-accent transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(snap.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChannelsPage() {
  const utils = trpc.useUtils();
  const { data: channels, isLoading } = trpc.channels.list.useQuery();

  const createMutation = trpc.channels.create.useMutation({
    onSuccess: () => {
      utils.channels.list.invalidate();
      toast.success("Канал создан");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.channels.update.useMutation({
    onSuccess: () => {
      utils.channels.list.invalidate();
      toast.success("Канал обновлён");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.channels.delete.useMutation({
    onSuccess: () => {
      utils.channels.list.invalidate();
      toast.success("Канал удалён");
    },
    onError: (e) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ChannelFormData>({ name: "", description: "" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm({ name: "", description: "" });
    setDialogOpen(true);
  }

  function openEdit(ch: { id: number; name: string; description: string | null }) {
    setEditingId(ch.id);
    setForm({ name: ch.name, description: ch.description ?? "" });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, name: form.name, description: form.description });
    } else {
      createMutation.mutate({ name: form.name, description: form.description });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Каналы</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Управление рекламными каналами</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Добавить</span>
        </Button>
      </div>

      {/* Channel list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-card animate-pulse" />
          ))}
        </div>
      ) : !channels?.length ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">Нет каналов. Добавьте первый.</p>
          <Button onClick={openCreate} variant="outline" size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Добавить канал
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="glass rounded-xl p-4 group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-primary">
                    {ch.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{ch.name}</p>
                  {ch.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{ch.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(ch)}
                    className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {deleteConfirmId === ch.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          deleteMutation.mutate({ id: ch.id });
                          setDeleteConfirmId(null);
                        }}
                        className="p-2 rounded-lg bg-destructive/15 hover:bg-destructive/25 transition-colors text-destructive"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(ch.id)}
                      className="p-2 rounded-lg hover:bg-destructive/15 transition-colors text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {/* Subscriber snapshots section */}
              <SnapshotSection channelId={ch.id} channelName={ch.name} />
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingId ? "Редактировать канал" : "Новый канал"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="ch-name">Название *</Label>
              <Input
                id="ch-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Например: Твоя Алиса"
                required
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-desc">Описание</Label>
              <Textarea
                id="ch-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Краткое описание канала"
                rows={3}
                className="bg-input border-border resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setDialogOpen(false)}
              >
                Отмена
              </Button>
              <Button type="submit" className="flex-1" disabled={isPending}>
                {isPending ? "Сохранение..." : editingId ? "Сохранить" : "Создать"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
