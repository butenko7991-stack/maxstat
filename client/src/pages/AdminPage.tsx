import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Shield, Users, Link2, Trash2, UserCog, Check } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  admin: "Админ",
  buyer: "Закупщик",
  manager: "Менеджер",
  user: "Пользователь",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  buyer: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  manager: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  user: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
};

export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("users");

  // Users data
  const { data: allUsers, refetch: refetchUsers } = trpc.admin.users.useQuery();
  const { data: allChannels } = trpc.admin.allChannels.useQuery();
  const { data: assignments, refetch: refetchAssignments } = trpc.admin.assignments.useQuery();

  const updateRoleMutation = trpc.admin.updateRole.useMutation({
    onSuccess: () => { refetchUsers(); toast.success("Роль обновлена"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { refetchUsers(); refetchAssignments(); toast.success("Пользователь удалён"); },
    onError: (e) => toast.error(e.message),
  });
  const setAssignmentsMutation = trpc.admin.setAssignments.useMutation({
    onSuccess: () => { refetchAssignments(); toast.success("Назначения обновлены"); },
    onError: (e) => toast.error(e.message),
  });

  // Assignment dialog state
  const [assignDialog, setAssignDialog] = useState<{ open: boolean; userId: number; userName: string; channelIds: number[] }>({
    open: false, userId: 0, userName: "", channelIds: [],
  });

  const openAssignDialog = (userId: number, userName: string) => {
    // Get current assignments for this user
    const userAssigns = assignments?.filter((a) => a.userId === userId) ?? [];
    setAssignDialog({
      open: true,
      userId,
      userName,
      channelIds: userAssigns.map((a) => a.channelId),
    });
  };

  const toggleChannel = (channelId: number) => {
    setAssignDialog((prev) => ({
      ...prev,
      channelIds: prev.channelIds.includes(channelId)
        ? prev.channelIds.filter((id) => id !== channelId)
        : [...prev.channelIds, channelId],
    }));
  };

  const saveAssignments = () => {
    setAssignmentsMutation.mutate(
      { userId: assignDialog.userId, channelIds: assignDialog.channelIds },
      { onSuccess: () => setAssignDialog((p) => ({ ...p, open: false })) }
    );
  };

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-lg text-muted-foreground">Доступ только для администраторов</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Админ-панель</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Управление командой и назначение каналов</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Пользователи
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            Назначения
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="mt-4 space-y-3">
          {allUsers && allUsers.length > 0 ? (
            <div className="space-y-2">
              {allUsers.map((u) => (
                <div key={u.id} className="glass rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <UserCog className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{u.name || "Без имени"}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email || u.openId}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Role selector */}
                    <Select
                      value={u.role}
                      onValueChange={(role) => {
                        if (u.id === user?.id) {
                          toast.error("Нельзя изменить свою роль");
                          return;
                        }
                        updateRoleMutation.mutate({ userId: u.id, role: role as any });
                      }}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs bg-input border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="admin">Админ</SelectItem>
                        <SelectItem value="buyer">Закупщик</SelectItem>
                        <SelectItem value="manager">Менеджер</SelectItem>
                        <SelectItem value="user">Пользователь</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Assign channels button */}
                    {(u.role === "buyer" || u.role === "manager") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => openAssignDialog(u.id, u.name || "Без имени")}
                      >
                        <Link2 className="w-3 h-3" />
                        Каналы
                      </Button>
                    )}

                    {/* Delete button */}
                    {u.id !== user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => {
                          if (confirm(`Удалить пользователя "${u.name || u.openId}"?`)) {
                            deleteUserMutation.mutate({ userId: u.id });
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>Пока нет зарегистрированных пользователей</p>
            </div>
          )}
        </TabsContent>

        {/* Assignments Tab */}
        <TabsContent value="assignments" className="mt-4 space-y-3">
          {assignments && assignments.length > 0 ? (
            <div className="space-y-2">
              {assignments.map((a) => (
                <div key={a.id} className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLORS[a.userRole]}`}>
                      {ROLE_LABELS[a.userRole]}
                    </span>
                    <span className="font-medium text-foreground text-sm truncate">{a.userName || "—"}</span>
                    <span className="text-muted-foreground text-sm">→</span>
                    <span className="text-sm text-foreground truncate">{a.channelName}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>Нет назначений</p>
              <p className="text-sm mt-1">Назначьте каналы закупщикам и менеджерам во вкладке «Пользователи»</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Channel Assignment Dialog */}
      <Dialog open={assignDialog.open} onOpenChange={(open) => setAssignDialog((p) => ({ ...p, open }))}>
        <DialogContent className="bg-popover border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Назначить каналы: {assignDialog.userName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[300px] overflow-y-auto py-2">
            {allChannels && allChannels.length > 0 ? (
              allChannels.map((ch) => {
                const isSelected = assignDialog.channelIds.includes(ch.id);
                return (
                  <button
                    key={ch.id}
                    onClick={() => toggleChannel(ch.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      isSelected
                        ? "border-primary/50 bg-primary/10"
                        : "border-border bg-muted/30 hover:bg-muted/50"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                      isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <span className="text-sm text-foreground">{ch.name}</span>
                  </button>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Нет каналов</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog((p) => ({ ...p, open: false }))}>
              Отмена
            </Button>
            <Button onClick={saveAssignments} disabled={setAssignmentsMutation.isPending}>
              {setAssignmentsMutation.isPending ? "Сохраняю..." : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
