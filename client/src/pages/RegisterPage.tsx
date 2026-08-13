import { Link } from "wouter";
import { ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <UsersRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Доступ по приглашению</CardTitle>
          <CardDescription>
            Учётные записи создаёт владелец или администратор рабочей зоны. Так данные разных команд остаются изолированными.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>Получите email и временный пароль у администратора вашей команды, затем войдите в приложение.</p>
          </div>
          <Link href="/login">
            <Button className="w-full">Перейти ко входу</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
