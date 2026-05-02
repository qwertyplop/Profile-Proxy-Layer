import { useState } from "react";
import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, ChevronRight, LogOut, Server, Settings, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar_collapsed") === "1"; } catch { return false; }
  });
  const toggle = () => setCollapsed(v => {
    const next = !v;
    try { localStorage.setItem("sidebar_collapsed", next ? "1" : "0"); } catch {}
    return next;
  });
  return [collapsed, toggle] as const;
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { username, logout } = useAuth();
  const [collapsed, toggleCollapsed] = useCollapsed();

  const navItem = (href: string, label: string, Icon: React.ElementType, active: boolean) => (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
        active
          ? "bg-secondary text-secondary-foreground font-medium"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      } ${collapsed ? "justify-center" : ""}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-mono text-sm selection:bg-primary selection:text-primary-foreground">
      <aside
        className={`${
          collapsed ? "w-full md:w-14" : "w-full md:w-64"
        } border-r border-border bg-card flex flex-col shrink-0 transition-all duration-200`}
      >
        {/* Header */}
        <div className="h-14 flex items-center px-3 border-b border-border shrink-0 gap-2">
          <Server className="w-5 h-5 text-primary shrink-0" />
          {!collapsed && (
            <span className="font-bold tracking-tight text-foreground flex-1 truncate">PROXY_MGR</span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <div className="p-2 flex-1">
          <nav className="space-y-1">
            {navItem("/", "Profiles", Server, location === "/" || location.startsWith("/profiles"))}
            {navItem("/access-keys", "Access Keys", ShieldCheck, location.startsWith("/access-keys"))}
          </nav>
        </div>

        {/* Footer */}
        <div className={`p-2 border-t border-border mt-auto space-y-1 ${collapsed ? "items-center flex flex-col" : ""}`}>
          {username && (
            <div
              title={collapsed ? username : undefined}
              className={`flex items-center gap-2 text-foreground text-xs px-3 py-2 ${collapsed ? "justify-center" : ""}`}
            >
              <User className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{username}</span>}
            </div>
          )}
          <button
            type="button"
            onClick={() => { void logout(); }}
            title={collapsed ? "Sign out" : undefined}
            className={`flex w-full items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground text-xs transition-colors rounded-md hover:bg-secondary/50 ${collapsed ? "justify-center" : ""}`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
          <div
            title={collapsed ? "v1.0.0-rc" : undefined}
            className={`flex items-center gap-2 px-3 py-2 text-muted-foreground text-xs ${collapsed ? "justify-center" : ""}`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            {!collapsed && <span>v1.0.0-rc</span>}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
