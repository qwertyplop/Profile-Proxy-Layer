import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Server, Settings } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-mono text-sm selection:bg-primary selection:text-primary-foreground">
      <aside className="w-full md:w-64 border-r border-border bg-card flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
          <Server className="w-5 h-5 text-primary mr-2" />
          <span className="font-bold tracking-tight text-foreground">PROXY_MGR</span>
        </div>
        <div className="p-4 flex-1">
          <nav className="space-y-1">
            <Link
              href="/"
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                location === "/" || location.startsWith("/profiles")
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
            >
              <Server className="w-4 h-4" />
              Profiles
            </Link>
          </nav>
        </div>
        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Settings className="w-4 h-4" />
            <span>v1.0.0-rc</span>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
