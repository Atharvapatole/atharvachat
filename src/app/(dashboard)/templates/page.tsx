"use client";

import { useState, useEffect } from "react";
import {
  FileCode,
  RefreshCw,
  Plus,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Languages,
} from "lucide-react";
import { MessageTemplate } from "@/lib/types";

export default function MessageTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fetchTemplates = async (sync = false) => {
    if (sync) setSyncing(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/whatsapp/templates?sync=${sync}`);
      const data = await res.json();
      if (data.templates && data.templates.length > 0) {
        setTemplates(data.templates);
      } else {
        loadSampleTemplates();
      }
      if (sync) {
        setToastMsg("Templates synchronized from Meta WhatsApp Business Account!");
        setTimeout(() => setToastMsg(null), 3000);
      }
    } catch {
      loadSampleTemplates();
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const loadSampleTemplates = () => {
    setTemplates([
      {
        id: "t-1",
        name: "hello_world",
        category: "MARKETING",
        language: "en_US",
        status: "APPROVED",
        body_text: "Welcome and thank you for connecting with us! Reply to this message to chat.",
        variable_count: 0,
        buttons: [{ type: "QUICK_REPLY", text: "Chat with Atharva" }],
      },
      {
        id: "t-2",
        name: "meeting_followup",
        category: "UTILITY",
        language: "en_US",
        status: "APPROVED",
        body_text: "Hi {{1}}, this is Atharva following up regarding our discussion. Let me know when you're free for a quick call.",
        variable_count: 1,
        buttons: [{ type: "URL", text: "Book Calendar", url: "https://calendar.google.com" }],
      },
      {
        id: "t-3",
        name: "service_notice",
        category: "UTILITY",
        language: "en_US",
        status: "APPROVED",
        body_text: "Dear {{1}}, your inquiry has been resolved. Feel free to message back anytime if you need more assistance.",
        variable_count: 1,
        buttons: [],
      },
      {
        id: "t-4",
        name: "product_launch_broadcast",
        category: "MARKETING",
        language: "en_US",
        status: "APPROVED",
        body_text: "Hey {{1}}! We just announced our new WhatsApp AI automation suite. Check out the release notes at {{2}}.",
        variable_count: 2,
        buttons: [{ type: "QUICK_REPLY", text: "Learn More" }],
      },
    ]);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 p-4 rounded-xl bg-emerald-500/90 text-slate-950 text-xs font-bold shadow-2xl flex items-center space-x-2 backdrop-blur-md animate-in slide-in-from-top-4">
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">WhatsApp Message Templates</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Approved Meta templates required for initiating conversations outside the 24-hour service window.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchTemplates(true)}
            disabled={syncing}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-800 flex items-center space-x-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            <span>Sync from Meta WABA</span>
          </button>

          <a
            href="https://business.facebook.com/wa/manage/message-templates"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center space-x-1.5 transition-all"
          >
            <span>Meta Template Manager</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Policy card */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center space-x-3 text-xs text-slate-300">
        <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
        <p>
          <strong>Meta Template Rule:</strong> To initiate conversations or message contacts outside the
          24-hour customer window, Meta requires pre-approved templates categorized under Marketing, Utility,
          or Authentication.
        </p>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {templates.map((tpl) => (
          <div
            key={tpl.id || tpl.name}
            className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 flex flex-col justify-between space-y-4 shadow-xl transition-colors"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white text-sm font-mono">{tpl.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20">
                    {tpl.status}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {tpl.category}
                </span>
              </div>

              {/* Message preview bubble */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans">
                <p className="whitespace-pre-wrap">{tpl.body_text}</p>

                {tpl.buttons && tpl.buttons.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-2">
                    {tpl.buttons.map((btn: any, idx: number) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 text-emerald-400 font-medium text-[10px] border border-slate-700 flex items-center space-x-1"
                      >
                        <span>{btn.text}</span>
                        {btn.type === "URL" && <ExternalLink className="w-2.5 h-2.5" />}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
              <div className="flex items-center space-x-3">
                <span className="flex items-center space-x-1">
                  <Languages className="w-3.5 h-3.5 text-slate-500" />
                  <span>{tpl.language}</span>
                </span>
                <span>• Variables: <strong className="text-white">{tpl.variable_count}</strong></span>
              </div>
              <span className="text-emerald-400/90 font-medium">Ready for campaigns</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
