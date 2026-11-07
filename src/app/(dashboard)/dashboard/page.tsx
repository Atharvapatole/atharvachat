"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users,
  MessageSquare,
  Send,
  CheckCheck,
  Bot,
  Radio,
  ArrowUpRight,
  TrendingUp,
  ShieldCheck,
  RefreshCw,
  PlusCircle,
  Clock,
  Sparkles,
  AlertCircle,
  Loader2,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeDate, formatPhoneNumber } from "@/lib/utils";
import { getEnvWhatsAppConfig } from "@/lib/config";

export default function DashboardOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalContacts: 0,
    activeConversations: 0,
    messagesSent: 0,
    messagesReceived: 0,
    messagesDelivered: 0,
    messagesRead: 0,
    aiMessages: 0,
    campaignsCount: 0,
  });
  const [recentConversations, setRecentConversations] = useState<any[]>([]);
  const [waAccount, setWaAccount] = useState<any>(null);
  const [aiEnabled, setAiEnabled] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Fetch real contacts count
        const { count: contactsCount } = await supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);

        // Fetch real conversations count
        const { count: convCount } = await supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);

        // Fetch real messages counts
        const { count: sentCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("direction", "outbound");

        const { count: recvCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("direction", "inbound");

        const { count: deliveredCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("direction", "outbound")
          .in("status", ["delivered", "read"]);

        const { count: readCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("direction", "outbound")
          .eq("status", "read");

        const { count: aiCount } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("sender_type", "ai_assistant");

        const { count: campCount } = await supabase
          .from("campaigns")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);

        // WhatsApp account in DB or environment
        const { data: account } = await supabase
          .from("whatsapp_accounts")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        const envConfig = getEnvWhatsAppConfig();
        if (account) {
          setWaAccount(account);
        } else if (envConfig.phoneNumberId) {
          setWaAccount({
            status: "connected",
            display_phone_number: `ID: ${envConfig.phoneNumberId}`,
            verified_name: "Environment Configured",
            quality_rating: "CONFIGURED",
          });
        } else {
          setWaAccount(null);
        }

        // AI settings
        const { data: aiSettings } = await supabase
          .from("ai_settings")
          .select("is_enabled")
          .eq("user_id", user.id)
          .maybeSingle();

        if (aiSettings) {
          setAiEnabled(aiSettings.is_enabled);
        }

        // Recent conversations
        const { data: convs } = await supabase
          .from("conversations")
          .select("*, contact:contacts(*)")
          .eq("user_id", user.id)
          .order("last_message_at", { ascending: false })
          .limit(5);

        setStats({
          totalContacts: contactsCount || 0,
          activeConversations: convCount || 0,
          messagesSent: sentCount || 0,
          messagesReceived: recvCount || 0,
          messagesDelivered: deliveredCount || 0,
          messagesRead: readCount || 0,
          aiMessages: aiCount || 0,
          campaignsCount: campCount || 0,
        });

        setRecentConversations(convs || []);
      }
    } catch (err) {
      console.error("Dashboard data load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const isConnected = waAccount?.status === "connected";

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Dashboard Overview
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time WhatsApp Business Cloud API metrics and Atharva AI activity.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchDashboardData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center space-x-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/messages"
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center space-x-1.5 transition-all"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Open WhatsApp Inbox</span>
          </Link>
        </div>
      </div>

      {/* System Status Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* WhatsApp Cloud Status */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                isConnected
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-slate-800 text-slate-500 border-slate-700"
              }`}
            >
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <p className="font-bold text-white text-sm">WhatsApp Business Cloud API</p>
                {isConnected ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-500" />
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isConnected
                  ? waAccount?.display_phone_number || "Connected & Ready"
                  : "WhatsApp is not connected."}
              </p>
            </div>
          </div>
          <Link
            href="/connection"
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
          >
            <span>{isConnected ? "Manage" : "Connect"}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* AI Assistant Status */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <p className="font-bold text-white text-sm">Atharva AI Representative</p>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    aiEnabled
                      ? "bg-teal-500/15 text-teal-300 border border-teal-500/25"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {aiEnabled ? "Autonomous ON" : "Disabled"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Dynamic OpenRouter free models • Conversation memory
              </p>
            </div>
          </div>
          <Link
            href="/ai-assistant"
            className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center space-x-1"
          >
            <span>Configure</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Contacts</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-extrabold text-white">{stats.totalContacts.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-2">
            {stats.totalContacts === 0
              ? "No contacts yet. Start a new chat to add a contact."
              : `${stats.activeConversations} active conversations`}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Messages Sent</span>
            <Send className="w-4 h-4 text-teal-400" />
          </div>
          <p className="text-3xl font-extrabold text-white">{stats.messagesSent.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-2">
            {stats.messagesSent === 0
              ? "No messages sent yet."
              : `Delivered: ${stats.messagesDelivered} • Read: ${stats.messagesRead}`}
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">AI Automated Replies</span>
            <Bot className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-3xl font-extrabold text-white">{stats.aiMessages.toLocaleString()}</p>
          <p className="text-xs text-cyan-400 flex items-center space-x-1 mt-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Zero-cost free model engine</span>
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Campaigns</span>
            <CheckCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-extrabold text-white">{stats.campaignsCount}</p>
          <p className="text-xs text-slate-400 mt-2">
            {stats.campaignsCount === 0 ? "No campaigns created yet." : "Broadcast campaigns launched"}
          </p>
        </div>
      </div>

      {/* Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Messages Status Overview */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/60 border border-slate-800/90 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-white">Message Activity</h2>
              <p className="text-xs text-slate-400 mt-0.5">Real-time metrics from Supabase database</p>
            </div>
            <Link href="/messages" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
              Go to Inbox
            </Link>
          </div>

          {stats.messagesSent === 0 && stats.messagesReceived === 0 ? (
            <div className="py-12 text-center space-y-3">
              <MessageSquare className="w-10 h-10 text-slate-700 mx-auto" />
              <p className="text-sm font-bold text-slate-300">No messages yet. Start your first conversation.</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Once you connect WhatsApp and begin chatting, actual sent and incoming counts will display here.
              </p>
              <Link
                href="/messages"
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow"
              >
                <Plus className="w-4 h-4" />
                <span>Start Conversation</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Outbound Messages Dispatched</span>
                  <span className="text-emerald-400 font-bold">{stats.messagesSent}</span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-emerald-500 h-full w-full" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Confirmed Delivered to Recipient</span>
                  <span className="text-teal-400 font-bold">{stats.messagesDelivered}</span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-teal-500 h-full"
                    style={{
                      width: `${stats.messagesSent > 0 ? (stats.messagesDelivered / stats.messagesSent) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Verified Read by Recipient</span>
                  <span className="text-sky-400 font-bold">{stats.messagesRead}</span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-sky-500 h-full"
                    style={{
                      width: `${stats.messagesSent > 0 ? (stats.messagesRead / stats.messagesSent) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Inbound Messages Received</span>
                  <span className="text-cyan-400 font-bold">{stats.messagesReceived}</span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div className="bg-cyan-500 h-full w-full" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recent Conversations */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/90 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white">Recent Conversations</h2>
              <Link href="/messages" className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold">
                View All
              </Link>
            </div>

            {recentConversations.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 space-y-2">
                <Users className="w-8 h-8 text-slate-700 mx-auto" />
                <p className="font-semibold text-slate-400">No active conversations</p>
                <p className="text-[11px] text-slate-500">Chats will appear here once started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentConversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href="/messages"
                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 flex items-center justify-between transition-colors block"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {conv.contact?.name ? conv.contact.name.charAt(0).toUpperCase() : "C"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate">
                          {conv.contact?.name || formatPhoneNumber(conv.contact?.phone_number)}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {formatPhoneNumber(conv.contact?.phone_number)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <span className="text-[10px] text-slate-500 block">
                        {formatRelativeDate(conv.last_message_at)}
                      </span>
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                          conv.ai_status === "active" ? "bg-teal-500/10 text-teal-400" : "bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {conv.ai_status === "active" ? "AI Rep" : "Human"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800">
            <Link
              href="/messages"
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center space-x-2 transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Start New WhatsApp Chat</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
