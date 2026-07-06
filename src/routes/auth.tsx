import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: redirect ?? "/dashboard", replace: true });
    }
  }, [loading, session, navigate, redirect]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error("Não foi possível entrar", { description: error.message });
    toast.success("Bem-vindo!");
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setForgotBusy(false);
    if (error) return toast.error("Não foi possível enviar", { description: error.message });
    toast.success("E-mail de redefinição enviado. Verifique sua caixa de entrada.");
    setShowForgot(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[color:var(--primary)]/10 via-background to-[color:var(--secondary)]/15 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-primary-foreground font-bold text-xl tracking-tight">
            <span className="h-2 w-2 rounded-full bg-secondary" />
            GS
          </div>
          <h1 className="mt-6 text-2xl font-bold text-foreground">
            Controle de Budget Mensal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestão de budget por unidade de manutenção
          </p>
        </div>

        <Card className="border-border/60 shadow-lg rounded-2xl">
          <CardHeader>
            <CardTitle>Acessar sistema</CardTitle>
            <CardDescription>Use seu e-mail corporativo</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Entrando..." : "Entrar"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(email); setShowForgot(true); }}
                    className="w-full text-center text-sm text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
            </form>
          </CardContent>
        </Card>

        {showForgot && (
          <div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowForgot(false)}
          >
            <Card className="w-full max-w-sm rounded-2xl" onClick={(e) => e.stopPropagation()}>
              <CardHeader>
                <CardTitle>Redefinir senha</CardTitle>
                <CardDescription>Enviaremos um link para o seu e-mail.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgotEmail">E-mail</Label>
                    <Input
                      id="forgotEmail"
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForgot(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1" disabled={forgotBusy}>
                      {forgotBusy ? "Enviando..." : "Enviar link"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}