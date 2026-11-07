"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Shield,
  Key,
  User,
  Mail,
  Lock,
  Check,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Cpu,
  Database,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const [email, setEmail] = useState("atharva@example.com");
  const [fullName, setFullName] = useState("Atharva");
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const fetchProfileAndSettings = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setEmail(user.email || "atharva@example.com");
          setFullName(user.user_metadata?.full_name || "Atharva");

          const { data: aiSettings } = await supabase
            .from("ai_settings")
            .select("custom_api_key")
            .eq("user_id", user.id)
            .maybeSingle();

          if (aiSettings?.custom_api_key) {
            setOpenRouterKey(aiSettings.custom_api_key);
          }
        }
      } catch {}
    };

    fetchProfileAndSettings();
  }, []);

  const handleSaveOpenRouterKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingKey(true);
    setToastMsg(null);

    try {
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_api_key: openRouterKey }),
      });

      const data = await res.json();
      if (res.ok) {
        setToastMsg({ type: "success", text: "OpenRouter API Key saved securely!" });
      } else {
        setToastMsg({ type: "error", text: data.error || "Failed to save API key" });
      }
    } catch {
      setToastMsg({ type: "error", text: "Network error saving API key" });
    } finally {
      setSavingKey(false);
      setTimeout(() => setToastMsg(null), 4000);
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Toast Alert */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 p-4 rounded-xl text-xs font-bold shadow-2xl flex items-center space-x-2 backdrop-blur-md animate-in slide-in-from-top-4 ${
            toastMsg.type === "success" ? "bg-emerald-500/90 text-slate-950" : "bg-rose-500/90 text-white"
          }`}
        >
          {toastMsg.type === "success" ? <Check className="w-4 h-4 stroke-[3]" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center border border-slate-700">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Platform Settings</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Account profile, AI API secrets, and encryption infrastructure.
            </p>
          </div>
        </div>
      </div>

      {/* Profile Section */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
          <User className="w-4 h-4 text-emerald-400" />
          <span>User Profile</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              readOnly
              value={fullName}
              className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Email Address
            </label>
            <input
              type="text"
              readOnly
              value={email}
              className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300"
            />
          </div>
        </div>
      </div>

      {/* OpenRouter API Key Configuration */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-teal-400" />
            <span>OpenRouter API Key</span>
          </h2>
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-teal-400 hover:text-teal-300 flex items-center space-x-1"
          >
            <span>Get OpenRouter Key</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          OpenRouter powers Atharva AI's model catalog discovery and completion pipeline. Models ending in
          <code className="text-teal-400 font-mono"> :free</code> have zero inference charges.
        </p>

        <form onSubmit={handleSaveOpenRouterKey} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Custom OpenRouter API Key
            </label>
            <input
              type="password"
              value={openRouterKey}
              onChange={(e) => setOpenRouterKey(e.target.value)}
              placeholder="sk-or-v1-••••••••••••••••••••••••••••••••"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <button
            type="submit"
            disabled={savingKey}
            className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-teal-500/20 flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
            <span>Save API Key</span>
          </button>
        </form>
      </div>

      {/* Security Architecture Audit */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Security & Encryption Standards</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>AES-256-GCM Storage</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              WhatsApp Access Tokens & App Secrets are stored strictly encrypted at rest with 96-bit IVs and 128-bit authentication tags.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>HMAC-SHA256 Webhook</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Every incoming Meta webhook payload is verified using your App Secret and X-Hub-Signature-256 header.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Supabase RLS Isolation</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Every database table enforces Row Level Security policies indexed on auth.uid() preventing cross-tenant access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
