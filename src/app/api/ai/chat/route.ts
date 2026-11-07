import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { executeChatCompletion, OpenRouterChatMessage } from "@/lib/openrouter";

export async function POST(req: NextRequest) {
  try {
    const { user, supabase, error: authError } = await getAuthenticatedUser(req);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Supabase authentication required. Please log in to your Atharva Chat account." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { messages, systemPrompt, model, temperature, maxTokens } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages array" }, { status: 400 });
    }

    const { data: aiSettings } = await supabase
      .from("ai_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const promptMessages: OpenRouterChatMessage[] = [
      {
        role: "system",
        content: systemPrompt || aiSettings?.system_prompt || "You are Atharva's personal AI assistant.",
      },
      ...messages,
    ];

    const result = await executeChatCompletion(promptMessages, {
      apiKey: aiSettings?.custom_api_key,
      model: model || aiSettings?.selected_model,
      autoModel: true,
      fallbackModels: aiSettings?.fallback_models,
      temperature: temperature ?? (aiSettings?.temperature ? Number(aiSettings.temperature) : 0.7),
      maxTokens: maxTokens ?? (aiSettings?.max_tokens || 400),
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error, attemptedModels: result.attemptedModels }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      content: result.content,
      modelUsed: result.modelUsed,
      attemptedModels: result.attemptedModels,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
