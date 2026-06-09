import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDarkMode } from "@/lib/theme";
import {
  LayoutDashboard, ShoppingCart, Package, ArrowLeftRight, Boxes, Wallet,
  Lock, Settings, LogOut, Moon, Sun, TrendingUp, Receipt,
} from "lucide-react";
import { Button } from "./ui/button";

const navStaff = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/penjualan", label: "Penjualan", icon: ShoppingCart },
  { to: "/stok/bahan-baku", label: "Bahan Baku", icon: Package },
  { to: "/stok/pindah-wadah", label: "Pindah Wadah", icon: ArrowLeftRight },
  { to: "/stok/kemasan", label: "Kemasan & Packing", icon: Boxes },
  { to: "/pengeluaran", label: "Biaya Operasional", icon: Receipt },
];

const navOwnerOnly = [
  { to: "/keuangan", label: "Keuangan", icon: TrendingUp },
  { to: "/pengeluaran-pribadi", label: "Pengeluaran Pribadi", icon: Wallet },
  { to: "/pengaturan/harga", label: "Pengaturan Harga", icon: Settings },
  { to: "/pengaturan/lumpsum", label: "Lumpsum Bulanan", icon: Settings },
  { to: "/pengaturan/staf", label: "Akun Staf", icon: Lock },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { role, user, signOut } = useAuth();
  const navigate = useNavigate();
  const { dark, toggle } = useDarkMode();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = role === "owner" ? [...navStaff, ...navOwnerOnly] : navStaff;

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-sidebar-accent flex items-center justify-center font-bold text-sidebar-accent-foreground">A</div>
          <div>
            <div className="font-semibold">Araa Honey</div>
            <div className="text-xs opacity-70 capitalize">{role ?? "—"}</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((it) => {
            const Icon = it.icon;
            const active = pathname === it.to || pathname.startsWith(it.to + "/");
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "hover:bg-sidebar-border/40"
                }`}
              >
                <Icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="text-xs opacity-70 px-2 truncate">{user?.email}</div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-border/40 hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b bg-card flex items-center justify-between px-6">
          <h1 className="text-sm font-medium text-muted-foreground">Sistem Operasional Internal</h1>
          <Button variant="ghost" size="icon" onClick={toggle}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </header>
        <div className="flex-1 p-6 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
