import { OpenRouterModel } from "./types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  apiKey?: string | null;
  model?: string;
  autoModel?: boolean;
  fallbackModels?: string[];
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResponse {
  success: boolean;
  content: string;
  modelUsed: string;
  attemptedModels: Array<{ model: string; error?: string }>;
  error?: string;
}

/**
 * Fetch and discover all available free models directly from OpenRouter Catalog API
 */
export async function discoverFreeModels(apiKey?: string | null): Promise<{
  success: boolean;
  models: OpenRouterModel[];
  error?: string;
}> {
  const token = apiKey || process.env.OPENROUTER_API_KEY;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://atharva-chat.local",
      "X-Title": "Atharva Chat WhatsApp Business Platform",
    };

    if (token && !token.includes("placeholder")) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      method: "GET",
      headers,
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!res.ok) {
      return {
        success: false,
        models: getFallbackFreeCatalog(),
        error: `OpenRouter returned HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    const rawModels: Array<{
      id: string;
      name?: string;
      description?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
    }> = data.data || [];

    // Filter strictly free models: id ends with ':free' or prompt & completion pricing is '0'
    const freeModels: OpenRouterModel[] = rawModels
      .filter((m) => {
        const hasFreeSuffix = m.id.toLowerCase().endsWith(":free");
        const promptCost = parseFloat(m.pricing?.prompt || "1");
        const completionCost = parseFloat(m.pricing?.completion || "1");
        const isZeroCost = promptCost === 0 && completionCost === 0;
        return hasFreeSuffix || isZeroCost;
      })
      .map((m) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description,
        context_length: m.context_length || 8192,
        pricing: {
          prompt: m.pricing?.prompt || "0",
          completion: m.pricing?.completion || "0",
        },
        is_free: true,
      }));

    if (freeModels.length === 0) {
      return {
        success: true,
        models: getFallbackFreeCatalog(),
      };
    }

    // Sort to put reputable fast models at top
    freeModels.sort((a, b) => {
      const preferred = ["gemini", "llama", "deepseek", "qwen", "mistral"];
      const aIndex = preferred.findIndex((p) => a.id.toLowerCase().includes(p));
      const bIndex = preferred.findIndex((p) => b.id.toLowerCase().includes(p));
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    return {
      success: true,
      models: freeModels,
    };
  } catch (err: unknown) {
    return {
      success: false,
      models: getFallbackFreeCatalog(),
      error: err instanceof Error ? err.message : "Network error discovering OpenRouter models",
    };
  }
}

/**
 * Built-in safety fallback catalog when offline or in setup mode
 */
export function getFallbackFreeCatalog(): OpenRouterModel[] {
  return [
    {
      id: "meta-llama/llama-3.3-70b-instruct:free",
      name: "Meta: Llama 3.3 70B Instruct (free)",
      context_length: 131072,
      pricing: { prompt: "0", completion: "0" },
      is_free: true,
    },
    {
      id: "google/gemini-2.0-flash-exp:free",
      name: "Google: Gemini 2.0 Flash Experimental (free)",
      context_length: 1048576,
      pricing: { prompt: "0", completion: "0" },
      is_free: true,
    },
    {
      id: "deepseek/deepseek-r1:free",
      name: "DeepSeek: R1 (free)",
      context_length: 64000,
      pricing: { prompt: "0", completion: "0" },
      is_free: true,
    },
    {
      id: "qwen/qwen-2.5-72b-instruct:free",
      name: "Qwen: Qwen 2.5 72B Instruct (free)",
      context_length: 32768,
      pricing: { prompt: "0", completion: "0" },
      is_free: true,
    },
    {
      id: "mistralai/mistral-small-24b-instruct-2501:free",
      name: "Mistral: Mistral Small 24B Instruct (free)",
      context_length: 32768,
      pricing: { prompt: "0", completion: "0" },
      is_free: true,
    },
  ];
}

/**
 * Robust chat completion with automatic free-model fallback sequencing.
 * Guarantees zero-cost execution and prevents infinite retry loops.
 */
export async function executeChatCompletion(
  messages: OpenRouterChatMessage[],
  options: CompletionOptions = {}
): Promise<CompletionResponse> {
  const token = options.apiKey || process.env.OPENROUTER_API_KEY;
  if (!token || token.includes("placeholder")) {
    return {
      success: false,
      content: "",
      modelUsed: "",
      attemptedModels: [],
      error: "OpenRouter API Key is not configured. Please enter your API key in Settings.",
    };
  }

  // Determine eligible free models list
  const primaryModel = options.model || "meta-llama/llama-3.3-70b-instruct:free";
  const candidateModels: string[] = [primaryModel];

  if (options.autoModel !== false) {
    const fallbacks = options.fallbackModels?.length
      ? options.fallbackModels
      : getFallbackFreeCatalog().map((m) => m.id);

    for (const fb of fallbacks) {
      if (!candidateModels.includes(fb) && fb.endsWith(":free")) {
        candidateModels.push(fb);
      }
    }
  }

  const attemptedModels: Array<{ model: string; error?: string }> = [];

  // Try candidate models in order, up to 3 fallback attempts
  const maxAttempts = Math.min(candidateModels.length, 3);

  for (let i = 0; i < maxAttempts; i++) {
    const currentModel = candidateModels[i];

    // Enforce safety: never call a non-free model if auto-selecting
    if (!currentModel.endsWith(":free")) {
      continue;
    }

    try {
      const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://atharva-chat.local",
          "X-Title": "Atharva Chat AI Assistant",
        },
        body: JSON.stringify({
          model: currentModel,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 450,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        const errorMsg = data.error?.message || `HTTP ${res.status} from ${currentModel}`;
        attemptedModels.push({ model: currentModel, error: errorMsg });
        // Proceed to next fallback model
        continue;
      }

      const generatedContent = data.choices?.[0]?.message?.content?.trim();
      if (!generatedContent) {
        attemptedModels.push({ model: currentModel, error: "Empty completion returned" });
        continue;
      }

      // Success!
      attemptedModels.push({ model: currentModel });
      return {
        success: true,
        content: generatedContent,
        modelUsed: currentModel,
        attemptedModels,
      };
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : "Request failed";
      attemptedModels.push({ model: currentModel, error: errText });
    }
  }

  return {
    success: false,
    content: "",
    modelUsed: "",
    attemptedModels,
    error: `All candidate free models failed. Last error: ${
      attemptedModels[attemptedModels.length - 1]?.error || "Unknown"
    }`,
  };
}
