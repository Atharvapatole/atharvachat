import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { cleanPhoneNumber, isValidPhoneNumber } from "@/lib/utils";

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
    const { contacts } = body;

    if (!contacts || !Array.isArray(contacts)) {
      return NextResponse.json({ error: "Contacts array is required" }, { status: 400 });
    }

    const imported: any[] = [];
    const rejected: Array<{ row: any; reason: string }> = [];

    for (const row of contacts) {
      const rawPhone = row.phone_number || row.phone || row.mobile || row.whatsapp || "";
      const cleaned = cleanPhoneNumber(String(rawPhone));

      if (!isValidPhoneNumber(cleaned)) {
        rejected.push({
          row,
          reason: `Invalid phone number format: "${rawPhone}". Must be 8-15 digits.`,
        });
        continue;
      }

      const tags = Array.isArray(row.tags)
        ? row.tags
        : typeof row.tags === "string"
        ? row.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];

      const contactPayload = {
        user_id: user.id,
        phone_number: cleaned,
        name: row.name ? String(row.name).trim() : null,
        email: row.email ? String(row.email).trim() : null,
        company: row.company ? String(row.company).trim() : null,
        tags,
        notes: row.notes ? String(row.notes).trim() : null,
        consent_status: "opted_in",
        ai_enabled: true,
      };

      const { data: upserted, error: upsertErr } = await supabase
        .from("contacts")
        .upsert(contactPayload, { onConflict: "user_id,phone_number" })
        .select()
        .single();

      if (upsertErr) {
        rejected.push({ row, reason: upsertErr.message });
      } else if (upserted) {
        imported.push(upserted);
      }
    }

    return NextResponse.json({
      success: true,
      totalProcessed: contacts.length,
      importedCount: imported.length,
      rejectedCount: rejected.length,
      rejected,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
