import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: settings } = await supabase
      .from("ai_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({ settings });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const {
      is_enabled,
      assistant_name,
      system_prompt,
      auto_model_selection,
      selected_model,
      fallback_models,
      temperature,
      max_tokens,
      language_preference,
      pause_duration_minutes,
      custom_api_key,
    } = body;

    const payload: Record<string, any> = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };

    if (typeof is_enabled === "boolean") payload.is_enabled = is_enabled;
    if (assistant_name) payload.assistant_name = assistant_name;
    if (system_prompt) payload.system_prompt = system_prompt;
    if (typeof auto_model_selection === "boolean") payload.auto_model_selection = auto_model_selection;
    if (selected_model) payload.selected_model = selected_model;
    if (Array.isArray(fallback_models)) payload.fallback_models = fallback_models;
    if (temperature !== undefined) payload.temperature = Number(temperature);
    if (max_tokens !== undefined) payload.max_tokens = Number(max_tokens);
    if (language_preference) payload.language_preference = language_preference;
    if (pause_duration_minutes !== undefined) payload.pause_duration_minutes = Number(pause_duration_minutes);
    if (custom_api_key !== undefined) payload.custom_api_key = custom_api_key || null;

    const { data: updated, error: upsertErr } = await supabase
      .from("ai_settings")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, settings: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
