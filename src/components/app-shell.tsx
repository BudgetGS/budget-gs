import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Calendar,
  BarChart3,
  Building2,
  Settings,
  LogOut,
  Menu,
  X,
  UserCircle,
  History,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: any; roles?: string[] };
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/budget", label: "Meses", icon: Calendar },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/unidades", label: "Unidades", icon: Building2, roles: ["admin", "gerente"] },
  { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] },
];

function Greeting({ name }: { name: string }) {
  const h = new Date().getHours();
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return (
    <div>
      <p className="text-sm text-muted-foreground">{saudacao},</p>
      <p className="text-lg font-bold text-foreground leading-tight">{name}</p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const items = NAV.filter((n) => !n.roles || (role && n.roles.includes(role)));

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex md:w-64 flex-col border-r border-border bg-sidebar">
        <div className="px-6 py-6 border-b border-border">
          <div className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-primary-foreground font-bold tracking-tight">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            GS
          </div>
          <p className="mt-2 text-xs text-muted-foreground font-medium">
            Controle de Budget
          </p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {items.map((n) => {
            const active = pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <div className="mb-3">
            <p className="text-sm font-semibold truncate">{profile?.nome ?? "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
            <p className="text-xs font-semibold capitalize text-muted-foreground mt-0.5">{role}</p>
          </div>
          <Link
            to="/minha-conta"
            className="mb-2 flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <UserCircle className="h-4 w-4" /> Minha conta
          </Link>
          <Button variant="outline" size="sm" className="w-full rounded-xl" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      {/* Mobile sheet */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-64 h-full bg-sidebar border-r border-border p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-primary-foreground font-bold">
                GS
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="space-y-1">
              {items.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-accent"
                >
                  <n.icon className="h-4 w-4" /> {n.label}
                </Link>
              ))}
            </nav>
            <Button variant="outline" size="sm" className="w-full rounded-xl mt-6" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] md:flex items-center gap-3 px-4 md:px-8 py-4">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0 md:flex-1">
              <Greeting name={profile?.nome ?? "—"} />
            </div>
            <div className="shrink-0 hidden sm:block">
              <span className="inline-flex items-center rounded-full bg-secondary/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">
                {role}
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 min-w-0">{children}</main>
      </div>
    </div>
  );
}