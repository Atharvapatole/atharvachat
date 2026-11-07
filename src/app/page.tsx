import Link from "next/link";
import { MessageSquare, Bot, Shield, Zap, Sparkles, Send, CheckCircle2, ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-[#070b14] text-slate-100 overflow-hidden">
      {/* Glow gradient background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-emerald-500/15 via-emerald-600/5 to-transparent blur-3xl pointer-events-none" />

      {/* Navigation */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <MessageSquare className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-tight text-white">ATHARVA</span>
              <span className="text-xs uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                CHAT AI
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-lg shadow-md shadow-emerald-500/20 transition-all flex items-center space-x-2"
            >
              <span>Launch Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-28">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Autonomous WhatsApp Representative & Marketing Cloud</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Connect WhatsApp Business. <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Empower with Atharva AI.
            </span>
          </h1>

          <p className="text-lg text-slate-400 leading-relaxed">
            The all-in-one platform for WhatsApp Business Cloud API. Real-time 3-column inbox,
            multilingual AI representative (English, Hinglish, Marathi, Hindi), compliant bulk campaigns,
            and cryptographic credential security.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/dashboard"
              className="w-full sm:w-auto px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2 text-base transition-all"
            >
              <span>Go to Messages Dashboard</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/connection"
              className="w-full sm:w-auto px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 font-semibold rounded-xl flex items-center justify-center space-x-2 text-base transition-all"
            >
              <span>Connect WhatsApp Cloud API</span>
            </Link>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/20">
              <Bot className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Atharva AI Assistant</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Responds as your personal AI representative with conversation memory, Hinglish / Hindi /
              Marathi fluency, and automatic fallback across free OpenRouter models.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center mb-4 border border-teal-500/20">
              <Send className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Real WhatsApp Cloud Inbox</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Three-column WhatsApp Business web interface. Direct Meta Cloud API delivery, real-time status
              ticks (Sent, Delivered, Read), 24h service window enforcement, and human takeover.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4 border border-cyan-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Enterprise Security & Compliance</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              AES-256-GCM credential encryption, Meta HMAC SHA-256 webhook signatures, opt-out suppression
              filters, and Supabase Row Level Security on every table.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
