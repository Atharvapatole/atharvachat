"use client";

import { useState, useEffect } from "react";
import {
  Radio,
  Key,
  Shield,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  PowerOff,
  PhoneCall,
  CheckCircle2,
  Loader2,
  Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { generateVerifyToken } from "@/lib/utils";
import { getWebhookUrl } from "@/lib/config";

export default function WhatsAppConnectionPage() {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");

  const [hasSavedToken, setHasSavedToken] = useState(false);
  const [hasSavedSecret, setHasSavedSecret] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<"connected" | "disconnected" | "error">("disconnected");
  const [displayPhone, setDisplayPhone] = useState<string | null>(null);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [qualityRating, setQualityRating] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const webhookUrl = getWebhookUrl();

  // Helper to get authenticated headers for API routes
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    return headers;
  };

  useEffect(() => {
    // Load existing account configuration via authenticated API
    const loadAccount = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/whatsapp/test-connection", {
          method: "GET",
          headers,
        });

        const data = await res.json();

        if (res.ok && data.success && data.configured) {
          setPhoneNumberId(data.phoneNumberId || "");
          setWabaId(data.wabaId || "");
          setVerifyToken(data.verifyToken || generateVerifyToken());
          setConnectionStatus(data.status || "disconnected");
          setDisplayPhone(data.displayPhone || null);
          setVerifiedName(data.verifiedName || null);
          setQualityRating(data.qualityRating || null);
          setHasSavedToken(Boolean(data.hasAccessToken));
          setHasSavedSecret(Boolean(data.hasAppSecret));

          if (data.errorMessage) {
            setErrorMsg(data.errorMessage);
          }
        } else {
          setVerifyToken(generateVerifyToken());
        }
      } catch {
        setVerifyToken(generateVerifyToken());
      }
    };

    loadAccount();
  }, []);

  const handleGenerateVerifyToken = () => {
    const newToken = generateVerifyToken();
    setVerifyToken(newToken);
    setSuccessMsg("Generated new cryptographic verify token.");
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const copyToClipboard = (text: string, type: "webhook" | "token") => {
    navigator.clipboard.writeText(text);
    if (type === "webhook") {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  // Test Connection
  const handleTestConnection = async () => {
    const phoneToTest = phoneNumberId.trim();
    const tokenToTest = accessToken.trim();

    if (!phoneToTest && !hasSavedToken) {
      setErrorMsg("Please enter Phone Number ID and Permanent Access Token to test.");
      return;
    }

    setTesting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/whatsapp/test-connection", {
        method: "POST",
        headers,
        body: JSON.stringify({
          phoneNumberId: phoneToTest || undefined,
          accessToken: tokenToTest || undefined,
          wabaId: wabaId.trim() || undefined,
          save: false,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setConnectionStatus("error");
        setErrorMsg(data.error || "Failed to connect to Meta WhatsApp Cloud API.");
      } else {
        setConnectionStatus("connected");
        setDisplayPhone(data.profile?.display_phone_number || null);
        setVerifiedName(data.profile?.verified_name || null);
        setQualityRating(data.profile?.quality_rating || "GREEN");
        setSuccessMsg("Connection successful! Meta WhatsApp Cloud API verified.");
      }
    } catch (err: unknown) {
      setConnectionStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Network error testing connection.");
    } finally {
      setTesting(false);
    }
  };

  // Connect WhatsApp & Save Credentials (AES-256-GCM Encrypted)
  const handleConnectWhatsApp = async () => {
    const cleanPhone = phoneNumberId.trim();
    const cleanWaba = wabaId.trim();
    const cleanSecret = appSecret.trim();
    const cleanToken = accessToken.trim();
    const cleanVerify = verifyToken.trim();

    if (!cleanPhone || !cleanWaba) {
      setErrorMsg("WhatsApp Phone Number ID and WABA ID are required.");
      return;
    }

    if (!cleanToken && !hasSavedToken) {
      setErrorMsg("Permanent System User Access Token is required to connect.");
      return;
    }

    if (!cleanSecret && !hasSavedSecret) {
      setErrorMsg("Meta App Secret is required for HMAC webhook signature verification.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/whatsapp/test-connection", {
        method: "POST",
        headers,
        body: JSON.stringify({
          phoneNumberId: cleanPhone,
          wabaId: cleanWaba,
          appSecret: cleanSecret || undefined,
          accessToken: cleanToken || undefined,
          verifyToken: cleanVerify || undefined,
          save: true,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setConnectionStatus("error");
        setErrorMsg(data.error || "Failed to verify and save WhatsApp credentials.");
      } else {
        setConnectionStatus("connected");
        setDisplayPhone(data.profile?.display_phone_number || null);
        setVerifiedName(data.profile?.verified_name || null);
        setQualityRating(data.profile?.quality_rating || "GREEN");
        setHasSavedToken(true);
        setHasSavedSecret(true);
        setAccessToken("");
        setAppSecret("");
        setSuccessMsg("WhatsApp connected successfully! Credentials verified and encrypted with AES-256-GCM.");
      }
    } catch (err: unknown) {
      setConnectionStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Error connecting WhatsApp.");
    } finally {
      setLoading(false);
    }
  };

  // Disconnect WhatsApp
  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your WhatsApp Cloud API account?")) return;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("whatsapp_accounts")
          .update({ status: "disconnected" })
          .eq("user_id", user.id);
      }
      setConnectionStatus("disconnected");
      setSuccessMsg("WhatsApp account disconnected.");
    } catch {
      setConnectionStatus("disconnected");
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              WhatsApp Cloud API Connection
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Connect your Meta WhatsApp Business Cloud API account to send & receive live messages.
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Connection Error:</span>
            <p className="text-xs leading-relaxed text-rose-300">{errorMsg}</p>
          </div>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-start space-x-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Connection Status Card */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
              connectionStatus === "connected"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : connectionStatus === "error"
                ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            {connectionStatus === "connected" ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : connectionStatus === "error" ? (
              <AlertCircle className="w-6 h-6" />
            ) : (
              <PowerOff className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white text-base">Account Status:</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                  connectionStatus === "connected"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                    : connectionStatus === "error"
                    ? "bg-rose-500/15 text-rose-400 border border-rose-500/25"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {connectionStatus}
              </span>
            </div>
            {displayPhone && (
              <p className="text-xs text-slate-400 mt-1 flex items-center space-x-2">
                <span>
                  Number: <strong className="text-white">{displayPhone}</strong>
                </span>
                {verifiedName && (
                  <span>
                    • Name: <strong className="text-white">{verifiedName}</strong>
                  </span>
                )}
                {qualityRating && (
                  <span>
                    • Quality: <span className="text-emerald-400 font-bold">{qualityRating}</span>
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {connectionStatus === "connected" && (
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold transition-colors"
          >
            Disconnect Account
          </button>
        )}
      </div>

      {/* Credentials Form */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-4">
          <Key className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-white">Meta WhatsApp Cloud API Credentials</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Phone Number ID */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              1. WhatsApp Phone Number ID
            </label>
            <input
              type="text"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="e.g. 104859628549102"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </div>

          {/* WABA ID */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              2. WhatsApp Business Account ID (WABA ID)
            </label>
            <input
              type="text"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="e.g. 109283746501928"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </div>

          {/* App Secret */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              3. Meta App Secret (For HMAC Webhook Signature Verification)
            </label>
            <input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={
                hasSavedSecret
                  ? "•••••••••••••••• (Encrypted in DB - leave blank to keep)"
                  : "Enter your 32-character Meta App Secret"
              }
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            />
          </div>

          {/* Verify Token */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                4. Webhook Verify Token
              </label>
              <button
                type="button"
                onClick={handleGenerateVerifyToken}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center space-x-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Generate Random</span>
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(verifyToken, "token")}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Permanent Access Token */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
            5. Permanent System User Access Token (Graph API Authorization)
          </label>
          <textarea
            rows={3}
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={
              hasSavedToken
                ? "•••••••••••••••• (Encrypted with AES-256-GCM in DB - leave blank to keep)"
                : "EAAG... (Generated from Meta Business Manager > System Users with whatsapp_business_messaging and whatsapp_business_management permissions)"
            }
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 flex items-center space-x-2 transition-colors disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4 text-emerald-400" />}
            <span>Test Connection</span>
          </button>

          <button
            type="button"
            onClick={handleConnectWhatsApp}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 flex items-center space-x-2 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            <span>Connect WhatsApp (Save & Encrypt)</span>
          </button>
        </div>
      </div>

      {/* Meta Webhook Configuration Instructions Card */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
          <Shield className="w-5 h-5 text-teal-400" />
          <h2 className="text-base font-bold text-white">Meta Webhook Setup Instructions</h2>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Configure these in your <strong>Meta App Dashboard</strong> &gt; <strong>WhatsApp</strong> &gt; <strong>Configuration</strong> &gt; <strong>Webhook</strong>:
        </p>

        {/* Webhook URL display */}
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Callback URL</span>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={webhookUrl}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-emerald-400 font-mono select-all"
            />
            <button
              onClick={() => copyToClipboard(webhookUrl, "webhook")}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              {copiedWebhook ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Verify Token display */}
        <div className="space-y-1">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Verify Token</span>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              readOnly
              value={verifyToken}
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-emerald-400 font-mono select-all"
            />
            <button
              onClick={() => copyToClipboard(verifyToken, "token")}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs text-slate-400">
          <p className="font-bold text-slate-200">Webhook Web Subscription Fields:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Check <strong>messages</strong> (Required to receive incoming customer messages and delivery statuses)</li>
            <li>Click <strong>Verify and Save</strong> in Meta developer portal</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
