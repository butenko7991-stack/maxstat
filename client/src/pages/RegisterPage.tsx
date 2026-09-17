import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  buyer: "Закупщик",
  manager: "Менеджер",
};

type InvitationInfo = { email: string; role: string; expiresAt: string };

function getInvitationToken(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get("invite");
}

export default function RegisterPage() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [token] = useState(getInvitationToken);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [loading, setLoading] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/auth/invitation/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Не удалось проверить приглашение");
        if (!cancelled) setInvitation(data);
      } catch (requestError) {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Не удалось проверить приглашение");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function acceptInvitation(event: React.FormEvent) {
    event.preventDefault();
    if (!token || password !== passwordRepeat) {
      setError("Пароли должны совпадать");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/invitation/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ token, name, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось завершить регистрацию");
      await utils.auth.me.invalidate();
      window.history.replaceState(null, "", "/register");
      navigate("/");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось завершить регистрацию");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = submitting || !name.trim() || password.length < 8 || password !== passwordRepeat;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <UsersRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Доступ по приглашению</CardTitle>
          <CardDescription>Вы создаёте только собственный пароль. Данные владельца вам не передаются.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-center text-sm text-muted-foreground">Проверяем приглашение…</p>}
          {(!token || error) && !loading && (
            <div className="space-y-3">
              <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p>{error ?? "Откройте персональную ссылку-приглашение, которую прислал администратор."}</p>
              </div>
              <Link href="/login"><Button variant="outline" className="w-full">Перейти ко входу</Button></Link>
            </div>
          )}
          {invitation && !loading && !error && (
            <form onSubmit={acceptInvitation} className="space-y-4">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="font-medium text-foreground">{ROLE_LABELS[invitation.role] ?? "Сотрудник"}</p>
                <p className="mt-1 text-muted-foreground">Приглашение для {invitation.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">Действует до {new Date(invitation.expiresAt).toLocaleString("ru-RU")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-name">Ваше имя</Label>
                <Input id="invite-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Анна" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-password">Придумайте пароль</Label>
                <Input id="invite-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Не менее 8 символов" required minLength={8} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-password-repeat">Повторите пароль</Label>
                <Input id="invite-password-repeat" type="password" autoComplete="new-password" value={passwordRepeat} onChange={(event) => setPasswordRepeat(event.target.value)} required minLength={8} />
              </div>
              <Button type="submit" className="w-full" disabled={disabled}>{submitting ? "Создаём доступ…" : "Создать мой доступ"}</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
