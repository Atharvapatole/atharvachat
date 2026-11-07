import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { discoverFreeModels, getFallbackFreeCatalog } from "@/lib/openrouter";

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

    // Check if user has a custom OpenRouter key configured in ai_settings
    const { data: aiSettings } = await supabase
      .from("ai_settings")
      .select("custom_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    const result = await discoverFreeModels(aiSettings?.custom_api_key);

    return NextResponse.json({
      success: true,
      models: result.models,
      source: result.error ? "fallback" : "openrouter_api",
      error: result.error,
    });
  } catch (err: unknown) {
    return NextResponse.json({
      success: true,
      models: getFallbackFreeCatalog(),
      source: "fallback",
      error: err instanceof Error ? err.message : "Error discovering models",
    });
  }
}
