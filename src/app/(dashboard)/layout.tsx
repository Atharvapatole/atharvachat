"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Send,
  Bot,
  Radio,
  FileCode,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Wifi,
  Sparkles,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  name: string;
  href: string;
  icon: any;
  badge?: string;
}

const navItems: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Messages", href: "/messages", icon: MessageSquare, badge: "Live" },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Campaigns", href: "/campaigns", icon: Send },
  { name: "AI Assistant", href: "/ai-assistant", icon: Bot, badge: "Atharva" },
  { name: "WhatsApp Connection", href: "/connection", icon: Radio },
  { name: "Message Templates", href: "/templates", icon: FileCode },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [waConnected, setWaConnected] = useState<boolean>(false);
  const [aiActive, setAiActive] = useState<boolean>(true);
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    // Check auth and connection status
    const checkState = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || "");
          const { data: account } = await supabase
            .from("whatsapp_accounts")
            .select("status")
            .eq("user_id", user.id)
            .maybeSingle();

          if (account && account.status === "connected") {
            setWaConnected(true);
          } else {
            // Check if connection works via API (env credentials fallback or DB)
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const headers: Record<string, string> = {};
              if (session?.access_token) {
                headers["Authorization"] = `Bearer ${session.access_token}`;
              }
              const res = await fetch("/api/whatsapp/test-connection", { headers });
              const test = await res.json();
              setWaConnected(Boolean(test.success && test.configured && test.status === "connected"));
            } catch {
              setWaConnected(false);
            }
          }

          const { data: aiSettings } = await supabase
            .from("ai_settings")
            .select("is_enabled")
            .eq("user_id", user.id)
            .maybeSingle();

          if (aiSettings !== null && aiSettings !== undefined) {
            setAiActive(aiSettings.is_enabled);
          }
        }
      } catch {
        setWaConnected(false);
      }
    };
    checkState();
  }, []);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {}
    router.push("/login");
  };

  return (
    <div className="flex h-screen bg-[#070b14] text-slate-100 overflow-hidden font-sans">
      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Desktop & Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-950/95 border-r border-slate-800/80 flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800/80">
          <Link href="/dashboard" className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-500/20">
              <MessageSquare className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-extrabold text-base tracking-tight text-white">ATHARVA</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  PRO
                </span>
              </div>
              <p className="text-[10px] text-slate-400 tracking-wider">WHATSAPP CLOUD</p>
            </div>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live System Indicators */}
        <div className="p-3 mx-4 my-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center space-x-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>WhatsApp Cloud</span>
            </span>
            <span
              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                waConnected
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${waConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              <span>{waConnected ? "Connected" : "Offline"}</span>
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center space-x-1.5">
              <Bot className="w-3.5 h-3.5 text-teal-400" />
              <span>Atharva AI</span>
            </span>
            <span
              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                aiActive
                  ? "bg-teal-500/15 text-teal-400 border border-teal-500/20"
                  : "bg-slate-700/50 text-slate-400"
              }`}
            >
              <span>{aiActive ? "Autonomous ON" : "Paused"}</span>
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/60"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                      isActive
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Footer Profile */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">Atharva</p>
                <p className="text-[11px] text-slate-400 truncate">{userEmail}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Mobile Toggle */}
        <header className="lg:hidden h-14 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm tracking-tight text-white">ATHARVA CHAT</span>
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
            A
          </div>
        </header>

        {/* Dynamic Page Outlet */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
