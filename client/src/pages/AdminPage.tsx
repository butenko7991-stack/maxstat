import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, Copy, Crown, Link2, Send, Shield, Trash2, UserCog, Users, X } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  admin: "Админ",
  buyer: "Закупщик",
  manager: "Менеджер",
  user: "Пользователь",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  admin: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  buyer: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  manager: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  user: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
};

export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [newInvite, setNewInvite] = useState({ email: "", role: "buyer" as "admin" | "buyer" | "manager" });
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [assignDialog, setAssignDialog] = useState({ open: false, userId: 0, userName: "", channelIds: [] as number[] });

  const { data: allUsers, refetch: refetchUsers } = trpc.admin.users.useQuery();
  const { data: allChannels } = trpc.admin.allChannels.useQuery();
  const { data: assignments, refetch: refetchAssignments } = trpc.admin.assignments.useQuery();
  const { data: invitations, refetch: refetchInvitations } = trpc.admin.invitations.useQuery();

  const updateRoleMutation = trpc.admin.updateRole.useMutation({
    onSuccess: () => { refetchUsers(); toast.success("Роль обновлена"); },
    onError: (error) => toast.error(error.message),
  });
  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { refetchUsers(); refetchAssignments(); toast.success("Пользователь удалён"); },
    onError: (error) => toast.error(error.message),
  });
  const setAssignmentsMutation = trpc.admin.setAssignments.useMutation({
    onSuccess: () => { refetchAssignments(); toast.success("Назначения обновлены"); },
    onError: (error) => toast.error(error.message),
  });
  const createInvitationMutation = trpc.admin.createInvitation.useMutation({
    onSuccess: (invitation) => {
      setGeneratedInviteLink(`${window.location.origin}/register#invite=${invitation.token}`);
      refetchInvitations();
      toast.success("Ссылка-приглашение создана. Скопируйте и передайте её сотруднику.");
    },
    onError: (error) => toast.error(error.message),
  });
  const revokeInvitationMutation = trpc.admin.revokeInvitation.useMutation({
    onSuccess: () => { refetchInvitations(); toast.success("Приглашение отозвано"); },
    onError: (error) => toast.error(error.message),
  });

  const openAssignDialog = (userId: number, userName: string) => {
    const userAssigns = assignments?.filter((assignment) => assignment.userId === userId) ?? [];
    setAssignDialog({ open: true, userId, userName, channelIds: userAssigns.map((assignment) => assignment.channelId) });
  };
  const toggleChannel = (channelId: number) => setAssignDialog((previous) => ({
    ...previous,
    channelIds: previous.channelIds.includes(channelId)
      ? previous.channelIds.filter((id) => id !== channelId)
      : [...previous.channelIds, channelId],
  }));
  const saveAssignments = () => {
    setAssignmentsMutation.mutate(
      { userId: assignDialog.userId, channelIds: assignDialog.channelIds },
      { onSuccess: () => setAssignDialog((current) => ({ ...current, open: false })) },
    );
  };
  const openInviteDialog = () => {
    setNewInvite({ email: "", role: user?.role === "owner" ? "admin" : "buyer" });
    setGeneratedInviteLink(null);
    setInviteDialogOpen(true);
  };
  const copyInviteLink = async () => {
    if (!generatedInviteLink) return;
    try {
      await navigator.clipboard.writeText(generatedInviteLink);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать автоматически. Скопируйте ссылку из поля.");
    }
  };

  if (user?.role !== "admin" && user?.role !== "owner") {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="space-y-3 text-center"><Shield className="mx-auto h-12 w-12 text-muted-foreground" /><p className="text-lg text-muted-foreground">Доступ только для администраторов</p></div></div>;
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600"><Shield className="h-5 w-5 text-white" /></div>
        <div className="flex-1"><h1 className="text-xl font-semibold text-foreground">Админ-панель</h1><p className="mt-0.5 text-sm text-muted-foreground">{user?.role === "owner" ? "Ваши админы и команда. Их учёт изолирован от ваших данных." : "Ваша команда и назначение каналов"}</p></div>
        <Button size="sm" className="gap-1.5" onClick={openInviteDialog}><Send className="h-4 w-4" />Создать приглашение</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50"><TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" />Пользователи</TabsTrigger><TabsTrigger value="assignments" className="gap-1.5"><Link2 className="h-3.5 w-3.5" />Назначения</TabsTrigger></TabsList>
        <TabsContent value="users" className="mt-4 space-y-3">
          {allUsers && allUsers.length > 0 ? <div className="space-y-2">{allUsers.map((member) => (
            <div key={member.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-4">
              <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"><UserCog className="h-4 w-4 text-muted-foreground" /></div><div className="min-w-0"><p className="truncate font-medium text-foreground">{member.name || "Без имени"}</p><p className="truncate text-xs text-muted-foreground">{member.email || member.openId}</p></div><span className={`rounded-full border px-2 py-0.5 text-xs ${ROLE_COLORS[member.role] ?? ROLE_COLORS.user}`}>{member.role === "owner" && <Crown className="-mt-0.5 mr-1 inline h-3 w-3" />}{ROLE_LABELS[member.role] ?? "Пользователь"}</span></div>
              <div className="flex items-center gap-2">
                {member.role !== "owner" && member.role !== "admin" && <Select value={member.role} onValueChange={(role) => { if (member.id === user?.id) { toast.error("Нельзя изменить свою роль"); return; } updateRoleMutation.mutate({ userId: member.id, role: role as "buyer" | "manager" }); }}><SelectTrigger className="h-8 w-[130px] border-border bg-input text-xs"><SelectValue /></SelectTrigger><SelectContent className="border-border bg-popover"><SelectItem value="buyer">Закупщик</SelectItem><SelectItem value="manager">Менеджер</SelectItem></SelectContent></Select>}
                {(member.role === "buyer" || member.role === "manager") && <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => openAssignDialog(member.id, member.name || "Без имени")}><Link2 className="h-3 w-3" />Каналы</Button>}
                {member.id !== user?.id && member.role !== "admin" && member.role !== "owner" && <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => { if (confirm(`Удалить пользователя "${member.name || member.openId}"?`)) deleteUserMutation.mutate({ userId: member.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </div>
          ))}</div> : <div className="py-12 text-center text-muted-foreground"><p>Пока нет зарегистрированных пользователей</p></div>}

          <div className="mt-5 border-t border-border pt-4"><h2 className="text-sm font-semibold text-foreground">Приглашения</h2><p className="mt-1 text-xs text-muted-foreground">Ссылка одноразовая, действует 7 дней и не содержит доступ к вашей учётной записи.</p><div className="mt-3 space-y-2">{invitations && invitations.length > 0 ? invitations.map((invitation) => {
            const active = !invitation.acceptedAt && !invitation.revokedAt && new Date(invitation.expiresAt) > new Date();
            const status = invitation.acceptedAt ? "Принято" : invitation.revokedAt ? "Отозвано" : active ? "Активно" : "Истекло";
            return <div key={invitation.id} className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl p-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{invitation.email}</p><p className="text-xs text-muted-foreground">{ROLE_LABELS[invitation.role]} · {status} · до {new Date(invitation.expiresAt).toLocaleDateString("ru-RU")}</p></div>{active && <Button variant="ghost" size="sm" className="h-8 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300" disabled={revokeInvitationMutation.isPending} onClick={() => revokeInvitationMutation.mutate({ invitationId: invitation.id })}><X className="mr-1 h-3.5 w-3.5" />Отозвать</Button>}</div>;
          }) : <p className="py-2 text-sm text-muted-foreground">Активных или ранее созданных приглашений пока нет.</p>}</div></div>
        </TabsContent>
        <TabsContent value="assignments" className="mt-4 space-y-3">{assignments && assignments.length > 0 ? <div className="space-y-2">{assignments.map((assignment) => <div key={assignment.id} className="glass flex items-center justify-between gap-3 rounded-xl p-3"><div className="flex min-w-0 items-center gap-3"><span className={`rounded-full border px-2 py-0.5 text-xs ${ROLE_COLORS[assignment.userRole]}`}><>{ROLE_LABELS[assignment.userRole]}</></span><span className="truncate text-sm font-medium text-foreground">{assignment.userName || "—"}</span><span className="text-sm text-muted-foreground">→</span><span className="truncate text-sm text-foreground">{assignment.channelName}</span></div></div>)}</div> : <div className="py-12 text-center text-muted-foreground"><p>Нет назначений</p><p className="mt-1 text-sm">Назначьте каналы закупщикам и менеджерам во вкладке «Пользователи»</p></div>}</TabsContent>
      </Tabs>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}><DialogContent className="max-w-md border-border bg-popover"><DialogHeader><DialogTitle>Пригласить сотрудника</DialogTitle></DialogHeader>{generatedInviteLink ? <div className="space-y-3 py-2"><div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">Ссылка готова. Она будет показана только сейчас, действует 7 дней и станет недействительной после регистрации.</div><textarea readOnly value={generatedInviteLink} className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-xs text-foreground" aria-label="Ссылка приглашения" /><Button className="w-full gap-2" onClick={copyInviteLink}><Copy className="h-4 w-4" />Скопировать ссылку</Button></div> : <div className="space-y-3 py-2"><label className="block text-sm font-medium text-foreground">Email сотрудника<input type="email" value={newInvite.email} onChange={(event) => setNewInvite((current) => ({ ...current, email: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" placeholder="name@example.com" /></label><label className="block text-sm font-medium text-foreground">Роль<Select value={newInvite.role} onValueChange={(role) => setNewInvite((current) => ({ ...current, role: role as typeof newInvite.role }))}><SelectTrigger className="mt-1.5 w-full bg-background"><SelectValue /></SelectTrigger><SelectContent className="border-border bg-popover">{user?.role === "owner" ? <SelectItem value="admin">Администратор — отдельные каналы и учёт</SelectItem> : <><SelectItem value="buyer">Закупщик — каналы назначает админ</SelectItem><SelectItem value="manager">Менеджер — каналы назначает админ</SelectItem></>}</SelectContent></Select></label><p className="text-xs text-muted-foreground">Сотрудник придумает свой пароль сам. Ваши логины и пароль не используются.</p></div>}<DialogFooter><Button variant="outline" onClick={() => setInviteDialogOpen(false)}>{generatedInviteLink ? "Готово" : "Отмена"}</Button>{!generatedInviteLink && <Button disabled={createInvitationMutation.isPending || !newInvite.email.trim()} onClick={() => createInvitationMutation.mutate(newInvite)}>{createInvitationMutation.isPending ? "Создаю…" : "Создать ссылку"}</Button>}</DialogFooter></DialogContent></Dialog>

      <Dialog open={assignDialog.open} onOpenChange={(open) => setAssignDialog((current) => ({ ...current, open }))}><DialogContent className="max-w-md border-border bg-popover"><DialogHeader><DialogTitle>Назначить каналы: {assignDialog.userName}</DialogTitle></DialogHeader><div className="max-h-[300px] space-y-2 overflow-y-auto py-2">{allChannels && allChannels.length > 0 ? allChannels.map((channel) => { const selected = assignDialog.channelIds.includes(channel.id); return <button key={channel.id} onClick={() => toggleChannel(channel.id)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary/50 bg-primary/10" : "border-border bg-muted/30 hover:bg-muted/50"}`}><div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>{selected && <Check className="h-3 w-3 text-primary-foreground" />}</div><span className="text-sm text-foreground">{channel.name}</span></button>; }) : <p className="py-4 text-center text-sm text-muted-foreground">Нет каналов</p>}</div><DialogFooter><Button variant="outline" onClick={() => setAssignDialog((current) => ({ ...current, open: false }))}>Отмена</Button><Button onClick={saveAssignments} disabled={setAssignmentsMutation.isPending}>{setAssignmentsMutation.isPending ? "Сохраняю..." : "Сохранить"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
