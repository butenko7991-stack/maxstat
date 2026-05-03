import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, X, Check } from "lucide-react";
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
              className="glass rounded-xl p-4 flex items-center gap-4 group"
            >
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
