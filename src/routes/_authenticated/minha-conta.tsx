import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Camera, KeyRound, Loader2, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  component: MinhaContaPage,
});

function MinhaContaPage() {
  const { user, profile, role, refresh } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("nome, telefone, data_nascimento, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        toast.error("Erro ao carregar perfil");
        return;
      }
      setNome(data?.nome ?? "");
      setTelefone(data?.telefone ?? "");
      setDataNascimento(data?.data_nascimento ?? "");
      setAvatarPath(data?.avatar_url ?? null);
      setLoaded(true);
    })();
  }, [user]);

  useEffect(() => {
    if (!avatarPath) {
      setAvatarUrl(null);
      return;
    }
    supabase.storage.from("avatars").createSignedUrl(avatarPath, 3600).then(({ data }) => {
      setAvatarUrl(data?.signedUrl ?? null);
    });
  }, [avatarPath]);

  const initials = (profile?.nome ?? user?.email ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB)");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      toast.error("Falha no upload da foto");
      setUploading(false);
      return;
    }
    // remove old file (best effort)
    if (avatarPath && avatarPath !== path) {
      await supabase.storage.from("avatars").remove([avatarPath]);
    }
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", user.id);
    if (updErr) {
      toast.error("Erro ao salvar foto");
    } else {
      setAvatarPath(path);
      toast.success("Foto atualizada");
      await refresh();
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSave = async () => {
    if (!user) return;
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        data_nascimento: dataNascimento || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar alterações");
      return;
    }
    toast.success("Dados salvos com sucesso");
    await refresh();
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setResetting(false);
    if (error) {
      toast.error("Erro ao enviar e-mail de redefinição");
      return;
    }
    toast.success("E-mail de redefinição enviado");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Minha Conta</h1>
        <p className="text-sm text-muted-foreground">Atualize seus dados pessoais</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foto de perfil</CardTitle>
          <CardDescription>Envie uma imagem (máx. 5MB)</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={nome} />}
            <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {uploading ? "Enviando..." : "Alterar foto"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={user?.email ?? ""} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Perfil</Label>
            <Input id="role" value={role ?? ""} readOnly disabled className="capitalize" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={!loaded}
              maxLength={120}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(11) 99999-9999"
                disabled={!loaded}
                maxLength={30}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de nascimento</Label>
              <Input
                id="data_nascimento"
                type="date"
                value={dataNascimento}
                onChange={(e) => setDataNascimento(e.target.value)}
                disabled={!loaded}
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving || !loaded}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
          <CardDescription>
            Envie um e-mail para redefinir sua senha
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handlePasswordReset} disabled={resetting}>
            {resetting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {resetting ? "Enviando..." : "Alterar senha"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}