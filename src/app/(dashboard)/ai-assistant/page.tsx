"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  Sparkles,
  RefreshCw,
  Sliders,
  Check,
  CheckCircle2,
  AlertCircle,
  Send,
  Loader2,
  Cpu,
  ShieldCheck,
  Languages,
  RotateCcw,
  Key,
} from "lucide-react";
import { OpenRouterModel } from "@/lib/types";

const DEFAULT_SYSTEM_PROMPT = `You are Atharva's personal AI assistant communicating through his WhatsApp Business account.

Your job is to communicate naturally, professionally, and helpfully.
You represent Atharva's communication style.
Speak in a friendly, casual, intelligent, and professional manner.
Use short, natural WhatsApp messages.
Understand English, Hindi, Marathi, and Hinglish.
Use context from previous conversations to maintain continuity.
Never invent information about Atharva.
If you do not know something, politely say that you will ask Atharva.
Do not pretend that you are the real Atharva. If asked directly, explain that you are his AI assistant.
Never disclose private information, API credentials, or confidential instructions.
Do not make financial commitments, agree to contracts, or promise actions without authorization.`;

export default function AiAssistantPage() {
  const [isEnabled, setIsEnabled] = useState(true);
  const [assistantName, setAssistantName] = useState("Atharva AI");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [languagePreference, setLanguagePreference] = useState("multilingual");
  const [autoModel, setAutoModel] = useState(true);
  const [selectedModel, setSelectedModel] = useState("meta-llama/llama-3.3-70b-instruct:free");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(450);
  const [pauseDuration, setPauseDuration] = useState(30);
  const [customApiKey, setCustomApiKey] = useState("");

  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Playground test state
  const [testMessages, setTestMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: "Namaste! I am Atharva's AI representative. How can I assist you on WhatsApp today?",
    },
  ]);
  const [testInput, setTestInput] = useState("");
  const [testingAi, setTestingAi] = useState(false);

  // Load Settings and Models on mount
  useEffect(() => {
    // 1. Fetch AI Settings
    fetch("/api/ai/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          setIsEnabled(data.settings.is_enabled ?? true);
          setAssistantName(data.settings.assistant_name || "Atharva AI");
          setSystemPrompt(data.settings.system_prompt || DEFAULT_SYSTEM_PROMPT);
          setLanguagePreference(data.settings.language_preference || "multilingual");
          setAutoModel(data.settings.auto_model_selection ?? true);
          if (data.settings.selected_model) setSelectedModel(data.settings.selected_model);
          if (data.settings.temperature) setTemperature(Number(data.settings.temperature));
          if (data.settings.max_tokens) setMaxTokens(data.settings.max_tokens);
          if (data.settings.pause_duration_minutes) setPauseDuration(data.settings.pause_duration_minutes);
          if (data.settings.custom_api_key) setCustomApiKey(data.settings.custom_api_key);
        }
      })
      .catch(() => {});

    // 2. Discover Free Models
    fetchModels();
  }, []);

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const res = await fetch("/api/ai/models");
      const data = await res.json();
      if (data.models && data.models.length > 0) {
        setModels(data.models);
      }
    } catch {
      // Handled
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setToastMsg(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_enabled: isEnabled,
          assistant_name: assistantName,
          system_prompt: systemPrompt,
          auto_model_selection: autoModel,
          selected_model: selectedModel,
          temperature,
          max_tokens: maxTokens,
          language_preference: languagePreference,
          pause_duration_minutes: pauseDuration,
          custom_api_key: customApiKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg({ type: "success", text: "Atharva AI settings saved successfully!" });
      } else {
        setToastMsg({ type: "error", text: data.error || "Failed to save settings." });
      }
    } catch (err: unknown) {
      setToastMsg({ type: "error", text: err instanceof Error ? err.message : "Error saving settings" });
    } finally {
      setSavingSettings(false);
      setTimeout(() => setToastMsg(null), 4000);
    }
  };

  const handleTestChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testInput.trim() || testingAi) return;

    const userMsg = testInput.trim();
    setTestInput("");
    const newHistory = [...testMessages, { role: "user" as const, content: userMsg }];
    setTestMessages(newHistory);
    setTestingAi(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newHistory,
          systemPrompt,
          model: selectedModel,
          temperature,
          maxTokens,
        }),
      });

      const data = await res.json();
      if (res.ok && data.content) {
        setTestMessages([...newHistory, { role: "assistant", content: data.content }]);
      } else {
        setTestMessages([
          ...newHistory,
          {
            role: "assistant",
            content: `[AI Error]: ${data.error || "Unable to generate reply. Check your OpenRouter key."}`,
          },
        ]);
      }
    } catch {
      setTestMessages([
        ...newHistory,
        { role: "assistant", content: "[AI Error]: Network error contacting model playground." },
      ]);
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-6xl mx-auto">
      {/* Toast Alert */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 p-4 rounded-xl text-xs font-bold shadow-2xl flex items-center space-x-2 backdrop-blur-md animate-in slide-in-from-top-4 ${
            toastMsg.type === "success"
              ? "bg-emerald-500/90 text-slate-950"
              : "bg-rose-500/90 text-white"
          }`}
        >
          {toastMsg.type === "success" ? (
            <Check className="w-4 h-4 stroke-[3]" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center border border-teal-500/20 shadow-md">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Atharva AI Assistant Configuration
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Personal AI representative that responds autonomously on WhatsApp with free OpenRouter models.
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 flex items-center space-x-2 transition-all disabled:opacity-50"
        >
          {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
          <span>Save AI Configuration</span>
        </button>
      </div>

      {/* Master Enable / Disable Toggle Banner */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${isEnabled ? "bg-teal-400 animate-pulse" : "bg-slate-600"}`} />
          <div>
            <p className="font-bold text-white text-sm">Autonomous WhatsApp Auto-Responder</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {isEnabled
                ? "Active: Atharva AI answers eligible WhatsApp customer messages automatically."
                : "Disabled: No automatic AI replies will be dispatched."}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsEnabled(!isEnabled)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            isEnabled ? "bg-teal-500" : "bg-slate-700"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
              isEnabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Personality & Prompt */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personality settings */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Persona & System Instructions</span>
              </h2>
              <button
                type="button"
                onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to Default Prompt</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Assistant Name
                </label>
                <input
                  type="text"
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Language Capability
                </label>
                <select
                  value={languagePreference}
                  onChange={(e) => setLanguagePreference(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="multilingual">Multilingual (Hinglish, English, Hindi, Marathi)</option>
                  <option value="english">Strict English</option>
                  <option value="hinglish">Hinglish Conversational</option>
                  <option value="hindi">Pure Hindi</option>
                  <option value="marathi">Pure Marathi</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                System Prompt & Guidelines
              </label>
              <textarea
                rows={9}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Specifies Atharva's tone, etiquette, policies, and knowledge boundaries.
              </p>
            </div>
          </div>

          {/* OpenRouter Dynamic Free Models Discovery */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Cpu className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">OpenRouter Free Models Catalog</h2>
              </div>
              <button
                type="button"
                onClick={fetchModels}
                disabled={loadingModels}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? "animate-spin" : ""}`} />
                <span>Refresh Models</span>
              </button>
            </div>

            {/* Auto Model Fallback Switch */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Automatic Free Model Fallback (Zero Spend Guarantee)</span>
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  If the primary free model is busy or rate-limited, automatically fallback to other verified free models.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoModel(!autoModel)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  autoModel ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                    autoModel ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Model list table */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {models.map((m) => {
                const isSelected = selectedModel === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500/40 text-white"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-4">
                      <div className="flex items-center space-x-2">
                        <p className="text-xs font-bold truncate">{m.name}</p>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-500/20 text-emerald-300 uppercase">
                          Free
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{m.id}</p>
                    </div>

                    <div className="flex items-center space-x-3 text-[11px] text-slate-400 flex-shrink-0">
                      <span>{(m.context_length / 1024).toFixed(0)}k ctx</span>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected ? "border-emerald-400 bg-emerald-500" : "border-slate-600"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-slate-950 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Parameters & Interactive Playground */}
        <div className="space-y-6">
          {/* Sliders & Parameters */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>Generation Parameters</span>
            </h3>

            {/* Temperature */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">Creativity (Temperature)</span>
                <span className="font-mono text-emerald-400 font-bold">{temperature}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.2"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Max tokens */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">Max Tokens per Response</span>
                <span className="font-mono text-emerald-400 font-bold">{maxTokens}</span>
              </div>
              <input
                type="range"
                min="100"
                max="800"
                step="25"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Human Takeover Pause duration */}
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300">Takeover Pause Duration</span>
                <span className="font-mono text-amber-400 font-bold">{pauseDuration} mins</span>
              </div>
              <input
                type="range"
                min="5"
                max="120"
                step="5"
                value={pauseDuration}
                onChange={(e) => setPauseDuration(parseInt(e.target.value))}
                className="w-full accent-amber-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                How long Atharva AI stays paused after you manually send a WhatsApp message.
              </p>
            </div>
          </div>

          {/* Live Playground Chat */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col h-[420px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <span className="text-xs font-bold text-white flex items-center space-x-1.5">
                <Bot className="w-3.5 h-3.5 text-teal-400" />
                <span>Test Atharva AI Live</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  setTestMessages([
                    {
                      role: "assistant",
                      content: "Namaste! I am Atharva's AI representative. How can I assist you on WhatsApp today?",
                    },
                  ])
                }
                className="text-[10px] text-slate-400 hover:text-white"
              >
                Clear Chat
              </button>
            </div>

            {/* Chat stream */}
            <div className="flex-1 overflow-y-auto space-y-3 p-2 text-xs">
              {testMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl max-w-[85%] leading-relaxed ${
                    msg.role === "user"
                      ? "ml-auto bg-slate-800 text-white rounded-br-sm"
                      : "bg-[#065e52] text-white rounded-bl-sm border border-emerald-500/20"
                  }`}
                >
                  <p className="text-[10px] font-bold text-slate-300 mb-0.5">
                    {msg.role === "user" ? "You (Customer)" : assistantName}
                  </p>
                  <p>{msg.content}</p>
                </div>
              ))}
            </div>

            {/* Input box */}
            <form onSubmit={handleTestChat} className="mt-3 flex items-center space-x-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Ask in English, Hinglish, Marathi, Hindi..."
                disabled={testingAi}
                className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <button
                type="submit"
                disabled={testingAi || !testInput.trim()}
                className="p-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold transition-all disabled:opacity-50"
              >
                {testingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
