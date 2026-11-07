"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search,
  Send,
  Bot,
  User,
  Check,
  CheckCheck,
  AlertCircle,
  FileCode,
  Smile,
  Clock,
  Shield,
  Tag,
  Phone,
  Mail,
  Building,
  RotateCcw,
  Sparkles,
  Loader2,
  Trash2,
  Play,
  Pause,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatMessageTime, formatPhoneNumber, formatRelativeDate } from "@/lib/utils";

interface Contact {
  id: string;
  name: string | null;
  phone_number: string;
  email: string | null;
  company: string | null;
  tags: string[];
  notes: string | null;
  consent_status: "opted_in" | "opted_out" | "pending";
  ai_enabled: boolean;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_type: "contact" | "human_user" | "ai_assistant" | "system_campaign";
  content: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error_message?: string | null;
  template_name?: string | null;
  created_at: string;
}

interface Conversation {
  id: string;
  contact_id: string;
  status: "open" | "closed" | "archived";
  ai_status: "active" | "paused_by_user" | "disabled";
  ai_paused_until: string | null;
  last_message_at: string;
  last_incoming_message_at: string | null;
  unread_count: number;
  contact: Contact;
  last_message?: Message;
}

export default function WhatsAppMessagingPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [contactMemory, setContactMemory] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Initial Load: Fetch conversations and templates
  const loadConversations = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data, error } = await supabase
          .from("conversations")
          .select("*, contact:contacts(*)")
          .eq("user_id", user.id)
          .order("last_message_at", { ascending: false });

        if (data && data.length > 0) {
          setConversations(data as Conversation[]);
          if (!selectedConversation) {
            setSelectedConversation(data[0] as Conversation);
          }
        } else {
          // Provide interactive sample conversations if database is empty
          loadSampleData();
        }
      } else {
        loadSampleData();
      }
    } catch {
      loadSampleData();
    }
  };

  const loadSampleData = () => {
    const samples: Conversation[] = [
      {
        id: "conv-1",
        contact_id: "c-1",
        status: "open",
        ai_status: "active",
        ai_paused_until: null,
        last_message_at: new Date().toISOString(),
        last_incoming_message_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        unread_count: 0,
        contact: {
          id: "c-1",
          name: "Rajesh Sharma",
          phone_number: "+919820112233",
          email: "rajesh@techcorp.in",
          company: "TechCorp Mumbai",
          tags: ["Enterprise", "VIP", "Mumbai"],
          notes: "Interested in WhatsApp AI bot integration for enterprise customer support.",
          consent_status: "opted_in",
          ai_enabled: true,
        },
      },
      {
        id: "conv-2",
        contact_id: "c-2",
        status: "open",
        ai_status: "paused_by_user",
        ai_paused_until: new Date(Date.now() + 1000 * 60 * 25).toISOString(),
        last_message_at: new Date(Date.now() - 1000 * 60 * 65).toISOString(),
        last_incoming_message_at: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
        unread_count: 1,
        contact: {
          id: "c-2",
          name: "Ananya Patel",
          phone_number: "+919876543210",
          email: "ananya@designstudio.com",
          company: "Studio Bloom",
          tags: ["Design", "Prospect"],
          notes: "Asked about custom system prompt settings.",
          consent_status: "opted_in",
          ai_enabled: true,
        },
      },
      {
        id: "conv-3",
        contact_id: "c-3",
        status: "open",
        ai_status: "active",
        ai_paused_until: null,
        last_message_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        last_incoming_message_at: new Date(Date.now() - 1000 * 60 * 190).toISOString(),
        unread_count: 0,
        contact: {
          id: "c-3",
          name: "Vikram Malhotra",
          phone_number: "+919988776655",
          email: "vikram@fintech.co",
          company: "FinEdge Solutions",
          tags: ["Fintech", "Follow-up"],
          notes: "Requested a demo walkthrough in Hinglish.",
          consent_status: "opted_in",
          ai_enabled: true,
        },
      },
    ];

    setConversations(samples);
    setSelectedConversation(samples[0]);
  };

  useEffect(() => {
    loadConversations();

    // Fetch templates
    fetch("/api/whatsapp/templates")
      .then((res) => res.json())
      .then((data) => {
        if (data.templates) setTemplates(data.templates);
      })
      .catch(() => {});
  }, []);

  // 2. Load Messages for Selected Conversation
  useEffect(() => {
    if (!selectedConversation) return;

    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", selectedConversation.id)
          .order("created_at", { ascending: true });

        if (data && data.length > 0) {
          setMessages(data as Message[]);
        } else {
          // Sample conversation messages
          if (selectedConversation.id === "conv-1") {
            setMessages([
              {
                id: "m-1",
                conversation_id: "conv-1",
                direction: "inbound",
                sender_type: "contact",
                content: "Namaste Atharva! Can you share details about your WhatsApp messaging platform?",
                status: "read",
                created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
              },
              {
                id: "m-2",
                conversation_id: "conv-1",
                direction: "outbound",
                sender_type: "ai_assistant",
                content:
                  "Namaste Rajesh ji! Absolutely. Atharva Chat connects your official WhatsApp Business Cloud API with an autonomous AI representative. It handles customer inquiries, supports Hinglish/Marathi/English, and complies with Meta 24-hr service policies. Would you like to see a demo?",
                status: "read",
                created_at: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
              },
              {
                id: "m-3",
                conversation_id: "conv-1",
                direction: "inbound",
                sender_type: "contact",
                content: "That sounds great. Are the AI models free to use?",
                status: "read",
                created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
              },
              {
                id: "m-4",
                conversation_id: "conv-1",
                direction: "outbound",
                sender_type: "ai_assistant",
                content:
                  "Yes, exactly! The platform dynamically discovers free OpenRouter models (like Llama 3.3 70B & Gemini 2.0 Flash Free) with automatic zero-cost fallbacks. So no unexpected charges ever.",
                status: "delivered",
                created_at: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
              },
            ]);
          } else {
            setMessages([
              {
                id: "m-20",
                conversation_id: selectedConversation.id,
                direction: "inbound",
                sender_type: "contact",
                content: "Hello Atharva, pinging to check up on our scheduled meeting.",
                status: "read",
                created_at: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
              },
            ]);
          }
        }

        // Fetch AI memory for this contact
        const { data: mem } = await supabase
          .from("ai_conversation_memory")
          .select("*")
          .eq("conversation_id", selectedConversation.id)
          .maybeSingle();

        setContactMemory(
          mem || {
            summary: "Prospect discussing enterprise WhatsApp AI bot integration and free models.",
            key_facts: ["Company: TechCorp Mumbai", "Prefers Hinglish & English", "Interested in free OpenRouter models"],
            sentiment: "Positive / Highly Engaged",
          }
        );
      } catch {
        // Fallback
      } finally {
        setLoadingMessages(false);
        setTimeout(scrollToBottom, 100);
      }
    };

    fetchMessages();
  }, [selectedConversation]);

  // 3. Send Message Action
  const handleSendMessage = async (overrideText?: string, isTemplate = false, templateName?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() && !isTemplate) return;
    if (!selectedConversation) return;

    setSending(true);
    setErrorToast(null);

    const optimisticId = `msg-${Date.now()}`;
    const newMsg: Message = {
      id: optimisticId,
      conversation_id: selectedConversation.id,
      direction: "outbound",
      sender_type: "human_user",
      content: textToSend,
      template_name: templateName || null,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText("");
    setTimeout(scrollToBottom, 50);

    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          contactId: selectedConversation.contact_id,
          text: textToSend,
          messageType: isTemplate ? "template" : "text",
          templateName,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        // Mark message as failed
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? { ...m, status: "failed", error_message: data.error || "Failed to send" }
              : m
          )
        );
        setErrorToast(data.error || "Failed to deliver message via WhatsApp Cloud API");
      } else {
        // Update message status to sent
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? { ...m, status: "sent", id: data.message?.id || optimisticId }
              : m
          )
        );
        setSuccessToast("Message sent successfully via WhatsApp Cloud API");

        // When human sends message, AI is paused
        setSelectedConversation((prev) =>
          prev
            ? {
                ...prev,
                ai_status: "paused_by_user",
                ai_paused_until: new Date(Date.now() + 30 * 60000).toISOString(),
              }
            : null
        );
      }
    } catch (err: unknown) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId
            ? { ...m, status: "failed", error_message: err instanceof Error ? err.message : "Network error" }
            : m
        )
      );
      setErrorToast("Connection error sending message.");
    } finally {
      setSending(false);
      setTimeout(() => {
        setErrorToast(null);
        setSuccessToast(null);
      }, 5000);
    }
  };

  // 4. Resume AI for this conversation
  const handleResumeAi = async () => {
    if (!selectedConversation) return;
    try {
      const supabase = createClient();
      await supabase
        .from("conversations")
        .update({ ai_status: "active", ai_paused_until: null })
        .eq("id", selectedConversation.id);

      setSelectedConversation((prev) =>
        prev ? { ...prev, ai_status: "active", ai_paused_until: null } : null
      );
      setSuccessToast("Atharva AI has been resumed for this conversation.");
    } catch {
      setSelectedConversation((prev) =>
        prev ? { ...prev, ai_status: "active", ai_paused_until: null } : null
      );
    }
  };

  // 5. Toggle Contact AI
  const handleToggleContactAi = async () => {
    if (!selectedConversation) return;
    const newAiState = !selectedConversation.contact.ai_enabled;

    try {
      const supabase = createClient();
      await supabase
        .from("contacts")
        .update({ ai_enabled: newAiState })
        .eq("id", selectedConversation.contact_id);

      setSelectedConversation((prev) =>
        prev
          ? {
              ...prev,
              contact: { ...prev.contact, ai_enabled: newAiState },
            }
          : null
      );
      setSuccessToast(
        newAiState ? "AI Assistant enabled for contact" : "AI Assistant disabled for contact"
      );
    } catch {}
  };

  // 6. 24-Hour Customer Service Window calculation
  const isInside24hWindow = () => {
    if (!selectedConversation?.last_incoming_message_at) return true; // optimistic
    const lastIncoming = new Date(selectedConversation.last_incoming_message_at).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return Date.now() - lastIncoming < twentyFourHours;
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase();
    const name = c.contact?.name?.toLowerCase() || "";
    const phone = c.contact?.phone_number?.toLowerCase() || "";
    return name.includes(q) || phone.includes(q);
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#080d1a] text-slate-100 overflow-hidden select-none">
      {/* Toast notifications */}
      {errorToast && (
        <div className="fixed top-5 right-5 z-50 p-4 rounded-xl bg-rose-500/90 text-white text-xs font-semibold shadow-2xl flex items-center space-x-2 backdrop-blur-md animate-in slide-in-from-top-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorToast}</span>
        </div>
      )}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 p-4 rounded-xl bg-emerald-500/90 text-slate-950 text-xs font-bold shadow-2xl flex items-center space-x-2 backdrop-blur-md animate-in slide-in-from-top-4">
          <Check className="w-4 h-4 flex-shrink-0 stroke-[3]" />
          <span>{successToast}</span>
        </div>
      )}

      {/* =========================================================================
          COLUMN 1: CONVERSATIONS LIST
         ========================================================================= */}
      <div className="w-full sm:w-80 md:w-96 bg-slate-950 border-r border-slate-800/80 flex flex-col flex-shrink-0">
        {/* Search header */}
        <div className="p-4 border-b border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-extrabold text-white tracking-tight">WhatsApp Chats</h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              {conversations.length} Active
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts or phone..."
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {filteredConversations.map((conv) => {
            const isSelected = selectedConversation?.id === conv.id;
            return (
              <div
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={`p-3.5 flex items-start space-x-3 cursor-pointer transition-all ${
                  isSelected
                    ? "bg-slate-900/90 border-l-4 border-emerald-400"
                    : "hover:bg-slate-900/40"
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600/30 to-teal-500/30 text-emerald-300 font-bold text-sm flex items-center justify-center border border-emerald-500/20">
                    {conv.contact?.name ? conv.contact.name.charAt(0) : "C"}
                  </div>
                  {conv.ai_status === "active" && (
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-teal-500 text-slate-950 flex items-center justify-center text-[9px] font-bold shadow">
                      <Bot className="w-2.5 h-2.5" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-bold text-white truncate">
                      {conv.contact?.name || formatPhoneNumber(conv.contact?.phone_number)}
                    </p>
                    <span className="text-[10px] text-slate-500 flex-shrink-0 ml-1">
                      {formatRelativeDate(conv.last_message_at)}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 truncate">
                    {formatPhoneNumber(conv.contact?.phone_number)}
                  </p>

                  <div className="flex items-center space-x-2 mt-1.5">
                    {conv.contact?.consent_status === "opted_out" ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20">
                        Opted Out
                      </span>
                    ) : (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                          conv.ai_status === "active"
                            ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {conv.ai_status === "active" ? "AI Auto" : "Human Hold"}
                      </span>
                    )}

                    {conv.unread_count > 0 && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-bold ml-auto">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          COLUMN 2: CENTER CHAT AREA
         ========================================================================= */}
      <div className="flex-1 flex flex-col bg-[#0b141a] relative overflow-hidden">
        {selectedConversation ? (
          <>
            {/* Chat Top Bar */}
            <div className="h-16 px-6 bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-md flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center border border-emerald-500/25">
                  {selectedConversation.contact?.name
                    ? selectedConversation.contact.name.charAt(0)
                    : "C"}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm font-bold text-white">
                      {selectedConversation.contact?.name || "Customer"}
                    </h2>
                    <span className="text-[10px] text-emerald-400 font-medium">
                      {formatPhoneNumber(selectedConversation.contact?.phone_number)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {selectedConversation.contact?.company || "WhatsApp Business Direct"}
                  </p>
                </div>
              </div>

              {/* Status pills */}
              <div className="flex items-center space-x-3">
                {selectedConversation.ai_status === "paused_by_user" ? (
                  <button
                    onClick={handleResumeAi}
                    className="px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center space-x-1.5 hover:bg-amber-500/25 transition-all"
                  >
                    <Play className="w-3 h-3 fill-amber-300" />
                    <span>AI Paused • Resume</span>
                  </button>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs font-semibold flex items-center space-x-1.5">
                    <Bot className="w-3.5 h-3.5" />
                    <span>Atharva AI Rep Active</span>
                  </span>
                )}
              </div>
            </div>

            {/* Human Takeover Notice banner */}
            {selectedConversation.ai_status === "paused_by_user" && (
              <div className="px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs text-amber-300">
                <div className="flex items-center space-x-2">
                  <Pause className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Human takeover mode: Atharva AI is paused for this conversation to prevent overlapping replies.
                  </span>
                </div>
                <button
                  onClick={handleResumeAi}
                  className="font-bold underline hover:text-white"
                >
                  Resume AI Now
                </button>
              </div>
            )}

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 wa-chat-pattern">
              {loadingMessages ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading message history...
                </div>
              ) : (
                messages.map((msg) => {
                  const isInbound = msg.direction === "inbound";
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isInbound ? "items-start" : "items-end"}`}
                    >
                      {/* Sender label badge */}
                      <span className="text-[10px] text-slate-500 mb-1 px-1">
                        {isInbound ? (
                          selectedConversation.contact?.name || "Customer"
                        ) : msg.sender_type === "ai_assistant" ? (
                          <span className="text-teal-400 font-semibold flex items-center space-x-1">
                            <Bot className="w-2.5 h-2.5 inline mr-1" />
                            Atharva AI Rep
                          </span>
                        ) : msg.sender_type === "system_campaign" ? (
                          <span className="text-purple-400 font-semibold">Campaign Broadcast</span>
                        ) : (
                          <span className="text-emerald-400 font-semibold">You (Atharva)</span>
                        )}
                      </span>

                      {/* Bubble */}
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-md relative ${
                          isInbound
                            ? "bg-[#202c33] text-slate-100 rounded-tl-sm border border-slate-700/40"
                            : msg.sender_type === "ai_assistant"
                            ? "bg-[#005c4b] text-white rounded-tr-sm border border-teal-500/30"
                            : "bg-[#065e52] text-white rounded-tr-sm border border-emerald-500/30"
                        }`}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                        {/* Status ticks & timestamp */}
                        <div className="flex items-center justify-end space-x-1.5 mt-1 text-[10px] text-slate-300/80">
                          <span>{formatMessageTime(msg.created_at)}</span>
                          {!isInbound && (
                            <span>
                              {msg.status === "read" ? (
                                <CheckCheck className="w-3.5 h-3.5 text-sky-400 stroke-[2.5]" />
                              ) : msg.status === "delivered" ? (
                                <CheckCheck className="w-3.5 h-3.5 text-slate-300 stroke-[2]" />
                              ) : msg.status === "sent" ? (
                                <Check className="w-3.5 h-3.5 text-slate-300 stroke-[2]" />
                              ) : msg.status === "failed" ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                              ) : (
                                <Clock className="w-3 h-3 text-slate-400" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {msg.status === "failed" && msg.error_message && (
                        <span className="text-[10px] text-rose-400 mt-1 max-w-xs text-right">
                          {msg.error_message}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-4 bg-slate-950 border-t border-slate-800/80 relative">
              {/* 24-hr Service Window Notice if expired */}
              {!isInside24hWindow() && (
                <div className="mb-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>
                      24-hour customer window expired. WhatsApp policy requires sending an approved template.
                    </span>
                  </div>
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 font-bold"
                  >
                    Select Template
                  </button>
                </div>
              )}

              {/* Opted out warning */}
              {selectedConversation.contact?.consent_status === "opted_out" && (
                <div className="mb-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Contact has opted out of WhatsApp messages. Sending is blocked until contact replies "START".
                  </span>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center space-x-2"
              >
                {/* Templates button */}
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(true)}
                  title="Send WhatsApp Template"
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                >
                  <FileCode className="w-4 h-4" />
                </button>

                {/* Input Text Box */}
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type a message (or reply as Atharva)..."
                  disabled={sending || selectedConversation.contact?.consent_status === "opted_out"}
                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={
                    sending ||
                    !inputText.trim() ||
                    selectedConversation.contact?.consent_status === "opted_out"
                  }
                  className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shadow-md shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center space-y-3">
            <Bot className="w-12 h-12 text-slate-700" />
            <h3 className="text-lg font-bold text-slate-300">Select a Conversation</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Choose an active WhatsApp chat from the left panel to read incoming messages and interact.
            </p>
          </div>
        )}
      </div>

      {/* =========================================================================
          COLUMN 3: RIGHT CONTACT DETAILS & AI MEMORY
         ========================================================================= */}
      {selectedConversation && (
        <div className="hidden xl:flex w-80 bg-slate-950 border-l border-slate-800/80 flex-col overflow-y-auto p-5 space-y-6 flex-shrink-0">
          {/* Profile header */}
          <div className="text-center pb-5 border-b border-slate-800/80">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-slate-950 font-extrabold text-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-3">
              {selectedConversation.contact?.name ? selectedConversation.contact.name.charAt(0) : "C"}
            </div>
            <h3 className="font-extrabold text-base text-white">
              {selectedConversation.contact?.name || "Customer"}
            </h3>
            <p className="text-xs text-emerald-400 font-medium mt-0.5">
              {formatPhoneNumber(selectedConversation.contact?.phone_number)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {selectedConversation.contact?.company || "Individual Contact"}
            </p>
          </div>

          {/* AI Control for this contact */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-2">
                <Bot className="w-4 h-4 text-teal-400" />
                <span>Atharva AI for Contact</span>
              </span>
              <button
                onClick={handleToggleContactAi}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  selectedConversation.contact?.ai_enabled ? "bg-teal-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                    selectedConversation.contact?.ai_enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              When enabled, Atharva AI automatically replies to incoming inquiries from this phone number.
            </p>
          </div>

          {/* Consent / Policy status */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              WhatsApp Policy & Consent
            </span>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-300">Consent Status</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  selectedConversation.contact?.consent_status === "opted_in"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                }`}
              >
                {selectedConversation.contact?.consent_status === "opted_in" ? "Opted In" : "Opted Out"}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">24-Hr Service Window</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isInside24hWindow()
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {isInside24hWindow() ? "Active Window" : "Expired (Template Req.)"}
              </span>
            </div>
          </div>

          {/* AI Memory / Key Facts */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>AI Memory & Facts</span>
              </span>
              <button
                onClick={() => setContactMemory(null)}
                title="Clear Memory"
                className="text-slate-500 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {contactMemory ? (
              <div className="space-y-2 text-[11px] text-slate-400">
                <p className="italic text-slate-300">"{contactMemory.summary}"</p>
                {contactMemory.key_facts && (
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    {contactMemory.key_facts.map((fact: string, idx: number) => (
                      <li key={idx}>{fact}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">No memory collected yet.</p>
            )}
          </div>

          {/* Tags */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tags</span>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(selectedConversation.contact?.tags || ["Prospect"]).map((t, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-medium border border-slate-700"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notes</span>
            <p className="text-xs text-slate-300 leading-relaxed">
              {selectedConversation.contact?.notes || "No notes added for this contact."}
            </p>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Select WhatsApp Template</h3>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {(templates.length > 0
                ? templates
                : [
                    {
                      name: "hello_world",
                      category: "MARKETING",
                      language: "en_US",
                      body_text: "Welcome and thank you for connecting with us! Reply to this message to chat.",
                    },
                    {
                      name: "meeting_followup",
                      category: "UTILITY",
                      language: "en_US",
                      body_text: "Hi {{1}}, this is Atharva following up regarding our discussion. Let me know when you're free.",
                    },
                  ]
              ).map((tpl, i) => (
                <div
                  key={i}
                  onClick={() => {
                    handleSendMessage(tpl.body_text, true, tpl.name);
                    setShowTemplateModal(false);
                  }}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-emerald-400">{tpl.name}</span>
                    <span className="text-[10px] uppercase font-bold text-slate-500">{tpl.category}</span>
                  </div>
                  <p className="text-xs text-slate-300">{tpl.body_text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
