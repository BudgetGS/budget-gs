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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

type NavItem = { to: string; label: string; icon: any; roles?: string[] };
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/budget", label: "Meses", icon: Calendar },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/unidades", label: "Unidades", icon: Building2, roles: ["admin", "gerente"] },
  { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] },
];

const COLLAPSE_KEY = "gs:sidebar-collapsed";

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
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const items = NAV.filter((n) => !n.roles || (role && n.roles.includes(role)));

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  const navLink = (n: NavItem) => {
    const active = pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
    const inner = (
      <Link
        key={n.to}
        to={n.to}
        className={cn(
          "flex items-center rounded-xl text-sm font-medium transition-colors",
          collapsed ? "justify-center px-2 py-2.5 w-full" : "gap-3 px-3 py-2.5",
          active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
        )}
      >
        <n.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{n.label}</span>}
      </Link>
    );
    if (!collapsed) return inner;
    return (
      <Tooltip key={n.to}>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">{n.label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar - desktop */}
      <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-sidebar sticky top-0 h-screen transition-[width] duration-200",
          collapsed ? "md:w-16" : "md:w-64",
        )}
      >
        <div className={cn("py-6 border-b border-border shrink-0", collapsed ? "px-2 flex justify-center" : "px-6")}>
          <div className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-primary-foreground font-bold tracking-tight">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            {collapsed ? "G" : "GS"}
          </div>
          {!collapsed && (
            <p className="mt-2 text-xs text-muted-foreground font-medium">Controle de Budget</p>
          )}
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
          {items.map(navLink)}
        </nav>
        <div className={cn("shrink-0 border-t border-border bg-sidebar", collapsed ? "p-2" : "p-4")}>
          {!collapsed && (
            <div className="mb-3">
              <p className="text-sm font-semibold truncate">{profile?.nome ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
              <p className="text-xs font-semibold capitalize text-muted-foreground mt-0.5">{role}</p>
            </div>
          )}
          {!collapsed && (
            <Link
              to="/minha-conta"
              className="mb-2 flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <UserCircle className="h-4 w-4" /> Minha conta
            </Link>
          )}
          {collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/minha-conta"
                  className="flex items-center justify-center rounded-xl border border-border p-2.5 mb-2 hover:bg-accent"
                >
                  <UserCircle className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">Minha conta</TooltipContent>
            </Tooltip>
          )}
          {!collapsed && (
            <Button variant="outline" size="sm" className="w-full rounded-xl mb-2" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          )}
          {collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="w-full rounded-xl mb-2"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">Sair</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full rounded-xl", collapsed && "px-2")}
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span className="ml-2">Recolher</span>}
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
