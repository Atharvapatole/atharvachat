"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Send,
  Bot,
  User,
  Check,
  CheckCheck,
  AlertCircle,
  FileCode,
  Clock,
  Shield,
  Tag,
  Phone,
  Mail,
  Building,
  Sparkles,
  Loader2,
  Trash2,
  Play,
  Pause,
  Plus,
  MessageSquarePlus,
  X,
  Globe,
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
  whatsapp_message_id?: string | null;
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

const COUNTRY_CODES = [
  { code: "+91", country: "India (IN)" },
  { code: "+1", country: "USA / Canada (+1)" },
  { code: "+44", country: "UK (+44)" },
  { code: "+971", country: "UAE (+971)" },
  { code: "+65", country: "Singapore (+65)" },
  { code: "+61", country: "Australia (+61)" },
  { code: "+49", country: "Germany (+49)" },
  { code: "+33", country: "France (+33)" },
  { code: "+966", country: "Saudi Arabia (+966)" },
  { code: "+81", country: "Japan (+81)" },
];

export default function WhatsAppMessagingPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Modals & UI alerts
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [contactMemory, setContactMemory] = useState<any>(null);

  // New Chat Form State
  const [newChatCountry, setNewChatCountry] = useState("+91");
  const [newChatPhone, setNewChatPhone] = useState("");
  const [newChatName, setNewChatName] = useState("");
  const [newChatInitialMessage, setNewChatInitialMessage] = useState("");
  const [creatingChat, setCreatingChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Fetch Conversations from Supabase (Strictly Real Data)
  const fetchConversations = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingConversations(false);
        return;
      }

      const { data, error } = await supabase
        .from("conversations")
        .select("*, contact:contacts(*)")
        .eq("user_id", user.id)
        .order("last_message_at", { ascending: false });

      if (error) {
        console.error("Error fetching conversations:", error);
      } else {
        setConversations((data as Conversation[]) || []);
        if (data && data.length > 0 && !selectedConversation) {
          setSelectedConversation(data[0] as Conversation);
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoadingConversations(false);
    }
  }, [selectedConversation, supabase]);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      return headers;
    } catch {
      return { "Content-Type": "application/json" };
    }
  };

  useEffect(() => {
    fetchConversations();

    // Fetch message templates with auth header
    const loadTemplates = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/whatsapp/templates", { headers });
        const data = await res.json();
        if (data.templates) setTemplates(data.templates);
      } catch {}
    };
    loadTemplates();
  }, [fetchConversations]);

  // 2. Fetch Messages for Selected Conversation (Strictly Real Data)
  useEffect(() => {
    if (!selectedConversation) {
      setMessages([]);
      setContactMemory(null);
      return;
    }

    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", selectedConversation.id)
          .order("created_at", { ascending: true });

        if (!error && data) {
          setMessages(data as Message[]);
        } else {
          setMessages([]);
        }

        // Fetch AI memory for this contact
        const { data: mem } = await supabase
          .from("ai_conversation_memory")
          .select("*")
          .eq("conversation_id", selectedConversation.id)
          .maybeSingle();

        setContactMemory(mem || null);
      } catch (err) {
        console.error("Failed to load messages:", err);
        setMessages([]);
      } finally {
        setLoadingMessages(false);
        setTimeout(scrollToBottom, 100);
      }
    };

    fetchMessages();
  }, [selectedConversation, supabase]);

  // 3. Supabase Realtime Subscriptions (Live WhatsApp Chat Behavior)
  useEffect(() => {
    let channel: any = null;

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel(`whatsapp_realtime_${user.id}`)
        // Listen to Messages changes
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const newMsg = payload.new as Message;
              if (selectedConversation && newMsg.conversation_id === selectedConversation.id) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id || (newMsg.whatsapp_message_id && m.whatsapp_message_id === newMsg.whatsapp_message_id))) {
                    return prev;
                  }
                  return [...prev, newMsg];
                });
                setTimeout(scrollToBottom, 50);
              }
              // Update conversation snippet in list
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === newMsg.conversation_id
                    ? { ...c, last_message_at: newMsg.created_at }
                    : c
                )
              );
            } else if (payload.eventType === "UPDATE") {
              const updatedMsg = payload.new as Message;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === updatedMsg.id ||
                  (updatedMsg.whatsapp_message_id && m.whatsapp_message_id === updatedMsg.whatsapp_message_id)
                    ? { ...m, ...updatedMsg }
                    : m
                )
              );
            }
          }
        )
        // Listen to Conversations changes
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.eventType === "UPDATE") {
              const updatedConv = payload.new as Conversation;
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === updatedConv.id
                    ? { ...c, ...updatedConv, contact: c.contact }
                    : c
                )
              );
              if (selectedConversation && selectedConversation.id === updatedConv.id) {
                setSelectedConversation((prev) =>
                  prev ? { ...prev, ...updatedConv, contact: prev.contact } : null
                );
              }
            } else if (payload.eventType === "INSERT") {
              fetchConversations();
            }
          }
        )
        // Listen to Contacts changes
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "contacts",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.eventType === "UPDATE") {
              const updatedContact = payload.new as Contact;
              setConversations((prev) =>
                prev.map((c) =>
                  c.contact_id === updatedContact.id
                    ? { ...c, contact: updatedContact }
                    : c
                )
              );
              if (selectedConversation && selectedConversation.contact_id === updatedContact.id) {
                setSelectedConversation((prev) =>
                  prev ? { ...prev, contact: updatedContact } : null
                );
              }
            }
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [selectedConversation, supabase, fetchConversations]);

  // 4. Send Message Handler (Real WhatsApp Cloud API)
  const handleSendMessage = async (overrideText?: string, isTemplate = false, templateName?: string) => {
    const textToSend = overrideText || inputText;
    if (!textToSend.trim() && !isTemplate) return;
    if (!selectedConversation) return;

    setSending(true);
    setErrorToast(null);

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: selectedConversation.id,
      direction: "outbound",
      sender_type: "human_user",
      content: textToSend,
      template_name: templateName || null,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setInputText("");
    setTimeout(scrollToBottom, 50);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers,
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
        // Mark optimistic message as failed
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? { ...m, status: "failed", error_message: data.error || "Failed to send message via WhatsApp Cloud API" }
              : m
          )
        );
        setErrorToast(data.error || "Failed to send message");
        if (data.requiresTemplate) {
          setShowTemplateModal(true);
        }
      } else {
        // Updated with confirmed WhatsApp message ID
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  id: data.message?.id || tempId,
                  whatsapp_message_id: data.whatsappMessageId,
                  status: "sent",
                }
              : m
          )
        );
        setSuccessToast("Message sent via WhatsApp Cloud API");

        // Optimistically pause AI for takeover
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
          m.id === tempId
            ? { ...m, status: "failed", error_message: err instanceof Error ? err.message : "Network error" }
            : m
        )
      );
      setErrorToast("Connection error attempting to reach Meta Graph API.");
    } finally {
      setSending(false);
      setTimeout(() => {
        setErrorToast(null);
        setSuccessToast(null);
      }, 5000);
    }
  };

  // 5. Start New Chat Modal Handler
  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim()) return;

    setCreatingChat(true);
    setErrorToast(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/conversations/start", {
        method: "POST",
        headers,
        body: JSON.stringify({
          phoneNumber: newChatPhone,
          name: newChatName,
          countryCode: newChatCountry,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setErrorToast(data.error || "Failed to create conversation");
        setCreatingChat(false);
        return;
      }

      const newConv = data.conversation as Conversation;

      // Add to conversations list if not present, and select it
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === newConv.id);
        if (exists) {
          return prev.map((c) => (c.id === newConv.id ? newConv : c));
        }
        return [newConv, ...prev];
      });

      setSelectedConversation(newConv);
      setShowNewChatModal(false);
      setNewChatPhone("");
      setNewChatName("");

      // If initial message provided, send it
      if (newChatInitialMessage.trim()) {
        const initialText = newChatInitialMessage.trim();
        setNewChatInitialMessage("");
        setTimeout(() => {
          handleSendMessage(initialText);
        }, 300);
      }
    } catch (err: unknown) {
      setErrorToast(err instanceof Error ? err.message : "Error starting conversation");
    } finally {
      setCreatingChat(false);
    }
  };

  // 6. Resume AI takeover
  const handleResumeAi = async () => {
    if (!selectedConversation) return;
    try {
      await supabase
        .from("conversations")
        .update({ ai_status: "active", ai_paused_until: null })
        .eq("id", selectedConversation.id);

      setSelectedConversation((prev) =>
        prev ? { ...prev, ai_status: "active", ai_paused_until: null } : null
      );
      setSuccessToast("Atharva AI resumed for this conversation.");
      setTimeout(() => setSuccessToast(null), 3000);
    } catch {
      setSelectedConversation((prev) =>
        prev ? { ...prev, ai_status: "active", ai_paused_until: null } : null
      );
    }
  };

  // 7. Toggle Contact AI
  const handleToggleContactAi = async () => {
    if (!selectedConversation) return;
    const newAiState = !selectedConversation.contact.ai_enabled;

    try {
      await supabase
        .from("contacts")
        .update({ ai_enabled: newAiState })
        .eq("id", selectedConversation.contact_id);

      setSelectedConversation((prev) =>
        prev ? { ...prev, contact: { ...prev.contact, ai_enabled: newAiState } } : null
      );
      setSuccessToast(newAiState ? "Atharva AI enabled for contact" : "Atharva AI disabled for contact");
      setTimeout(() => setSuccessToast(null), 3000);
    } catch {}
  };

  // 8. 24-Hour Customer Service Window check
  const isInside24hWindow = () => {
    if (!selectedConversation?.last_incoming_message_at) return false;
    const lastIncoming = new Date(selectedConversation.last_incoming_message_at).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return Date.now() - lastIncoming < twentyFourHours;
  };

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase();
    const name = c.contact?.name?.toLowerCase() || "";
    const phone = c.contact?.phone_number?.toLowerCase() || "";
    return name.includes(q) || phone.includes(q);
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#080d1a] text-slate-100 overflow-hidden select-none">
      {/* Toast Alerts */}
      {errorToast && (
        <div className="fixed top-5 right-5 z-50 p-4 rounded-xl bg-rose-500/90 text-white text-xs font-semibold shadow-2xl flex items-center space-x-2 backdrop-blur-md animate-in slide-in-from-top-4 max-w-md">
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
        {/* Search & New Chat Header */}
        <div className="p-4 border-b border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-extrabold text-white tracking-tight">WhatsApp Chats</h1>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-md shadow-emerald-500/20 flex items-center space-x-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>New Chat</span>
            </button>
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
          {loadingConversations ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
              Loading conversations...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-600">
                <MessageSquarePlus className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-300">No conversations yet</p>
              <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs mx-auto">
                Click <strong>"New Chat"</strong> above to enter any WhatsApp phone number and start messaging.
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
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
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600/30 to-teal-500/30 text-emerald-300 font-bold text-sm flex items-center justify-center border border-emerald-500/20">
                      {conv.contact?.name ? conv.contact.name.charAt(0).toUpperCase() : "C"}
                    </div>
                    {conv.ai_status === "active" && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-teal-500 text-slate-950 flex items-center justify-center text-[9px] font-bold shadow">
                        <Bot className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>

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
            })
          )}
        </div>
      </div>

      {/* =========================================================================
          COLUMN 2: CHAT AREA
         ========================================================================= */}
      <div className="flex-1 flex flex-col bg-[#0b141a] relative overflow-hidden">
        {selectedConversation ? (
          <>
            {/* Top Bar */}
            <div className="h-16 px-6 bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-md flex items-center justify-between z-10">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center border border-emerald-500/25">
                  {selectedConversation.contact?.name
                    ? selectedConversation.contact.name.charAt(0).toUpperCase()
                    : "C"}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm font-bold text-white">
                      {selectedConversation.contact?.name || "Customer"}
                    </h2>
                    <span className="text-[10px] text-emerald-400 font-medium font-mono">
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
                  <Pause className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span>
                    Human takeover: Atharva AI is paused for this conversation to prevent overlapping replies.
                  </span>
                </div>
                <button
                  onClick={handleResumeAi}
                  className="font-bold underline hover:text-white ml-2 flex-shrink-0"
                >
                  Resume AI Now
                </button>
              </div>
            )}

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 wa-chat-pattern">
              {loadingMessages ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  <Loader2 className="w-5 h-5 animate-spin mr-2 text-emerald-500" />
                  Loading message history from database...
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 text-center p-6">
                  <Bot className="w-10 h-10 text-slate-700" />
                  <p className="text-sm font-bold text-slate-300">No messages yet in this conversation</p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    {isInside24hWindow()
                      ? "Send a message below to start chatting."
                      : "The 24-hour service window is closed. Choose an approved WhatsApp Message Template to initiate messaging."}
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isInbound = msg.direction === "inbound";
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isInbound ? "items-start" : "items-end"}`}
                    >
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

                        <div className="flex items-center justify-end space-x-1.5 mt-1 text-[10px] text-slate-300/80">
                          <span>{formatMessageTime(msg.created_at)}</span>
                          {!isInbound && (
                            <span title={msg.status}>
                              {msg.status === "read" ? (
                                <CheckCheck className="w-3.5 h-3.5 text-sky-400 stroke-[2.5]" />
                              ) : msg.status === "delivered" ? (
                                <CheckCheck className="w-3.5 h-3.5 text-slate-300 stroke-[2]" />
                              ) : msg.status === "sent" ? (
                                <Check className="w-3.5 h-3.5 text-slate-300 stroke-[2]" />
                              ) : msg.status === "failed" ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                              ) : (
                                <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
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
                      24-hour service window closed. WhatsApp requires an approved Message Template to send messages.
                    </span>
                  </div>
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 font-bold ml-2 flex-shrink-0"
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
                    Contact has opted out of WhatsApp messages. Messaging is blocked until the recipient replies "START".
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
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(true)}
                  title="Send Approved WhatsApp Template"
                  className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                >
                  <FileCode className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    isInside24hWindow()
                      ? "Type a WhatsApp message..."
                      : "Window closed. Select a template or type to attempt..."
                  }
                  disabled={sending || selectedConversation.contact?.consent_status === "opted_out"}
                  className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                />

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
          <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600">
              <Bot className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-300">No Conversation Selected</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Select an existing WhatsApp conversation from the left or start a new chat.
              </p>
            </div>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center space-x-2 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Start New WhatsApp Chat</span>
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          COLUMN 3: CONTACT DETAILS & AI MEMORY
         ========================================================================= */}
      {selectedConversation && (
        <div className="hidden xl:flex w-80 bg-slate-950 border-l border-slate-800/80 flex-col overflow-y-auto p-5 space-y-6 flex-shrink-0">
          <div className="text-center pb-5 border-b border-slate-800/80">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-slate-950 font-extrabold text-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-3">
              {selectedConversation.contact?.name
                ? selectedConversation.contact.name.charAt(0).toUpperCase()
                : "C"}
            </div>
            <h3 className="font-extrabold text-base text-white">
              {selectedConversation.contact?.name || "Customer"}
            </h3>
            <p className="text-xs text-emerald-400 font-medium font-mono mt-0.5">
              {formatPhoneNumber(selectedConversation.contact?.phone_number)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {selectedConversation.contact?.company || "Direct WhatsApp Contact"}
            </p>
          </div>

          {/* AI Control */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center space-x-2">
                <Bot className="w-4 h-4 text-teal-400" />
                <span>Atharva AI Auto-Reply</span>
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
              When enabled, Atharva AI answers customer inquiries automatically in your tone.
            </p>
          </div>

          {/* WhatsApp Window & Consent */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              WhatsApp Policy State
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
              <span className="text-slate-300">24-Hr Window</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isInside24hWindow()
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {isInside24hWindow() ? "Open (Free Text OK)" : "Closed (Template Req.)"}
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
              {contactMemory && (
                <button
                  onClick={() => setContactMemory(null)}
                  title="Clear Memory"
                  className="text-slate-500 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {contactMemory?.summary ? (
              <div className="space-y-2 text-[11px] text-slate-400">
                <p className="italic text-slate-300">"{contactMemory.summary}"</p>
                {contactMemory.key_facts && Array.isArray(contactMemory.key_facts) && (
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    {contactMemory.key_facts.map((fact: string, idx: number) => (
                      <li key={idx}>{fact}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">No memory collected yet.</p>
            )}
          </div>

          {/* Tags */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tags</span>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(selectedConversation.contact?.tags && selectedConversation.contact.tags.length > 0) ? (
                selectedConversation.contact.tags.map((t, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-medium border border-slate-700"
                  >
                    #{t}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-500 italic">No tags</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          NEW CHAT MODAL (LIKE REAL WHATSAPP)
         ========================================================================= */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <MessageSquarePlus className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">New WhatsApp Chat</h3>
              </div>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStartNewChat} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Country Code
                </label>
                <select
                  value={newChatCountry}
                  onChange={(e) => setNewChatCountry(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.country} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  WhatsApp Phone Number *
                </label>
                <div className="flex items-center space-x-2">
                  <span className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-emerald-400">
                    {newChatCountry}
                  </span>
                  <input
                    type="tel"
                    required
                    value={newChatPhone}
                    onChange={(e) => setNewChatPhone(e.target.value)}
                    placeholder="9876543210"
                    className="flex-1 px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Enter any mobile number. It will be normalized into international E.164 format.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Contact Name (Optional)
                </label>
                <input
                  type="text"
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  placeholder="e.g. John Doe / Business Client"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Initial Message (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newChatInitialMessage}
                  onChange={(e) => setNewChatInitialMessage(e.target.value)}
                  placeholder="Hey, how are you?..."
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewChatModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingChat || !newChatPhone.trim()}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {creatingChat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Start Conversation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          TEMPLATE PICKER MODAL
         ========================================================================= */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <FileCode className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Select Approved Template</h3>
              </div>
              <button onClick={() => setShowTemplateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {templates.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  <p>No templates synced yet from Meta.</p>
                  <p className="mt-1 text-[11px]">Go to the <strong>Message Templates</strong> page to sync your approved templates.</p>
                </div>
              ) : (
                templates.map((tpl, i) => (
                  <div
                    key={tpl.id || i}
                    onClick={() => {
                      handleSendMessage(tpl.body_text, true, tpl.name);
                      setShowTemplateModal(false);
                    }}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-emerald-400 font-mono">{tpl.name}</span>
                      <span className="text-[10px] uppercase font-bold text-slate-500">{tpl.category}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{tpl.body_text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
