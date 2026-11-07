import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanPhoneNumber, isValidPhoneNumber } from "@/lib/utils";

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
    const { phoneNumber, name, countryCode = "+91" } = body;

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // Normalize phone number
    let rawPhone = phoneNumber.trim();
    if (!rawPhone.startsWith("+") && countryCode) {
      const cleanCode = countryCode.replace(/\D/g, "");
      const cleanNum = rawPhone.replace(/\D/g, "");
      if (!cleanNum.startsWith(cleanCode)) {
        rawPhone = `${cleanCode}${cleanNum}`;
      } else {
        rawPhone = cleanNum;
      }
    }

    const cleaned = cleanPhoneNumber(rawPhone);

    if (!isValidPhoneNumber(cleaned)) {
      return NextResponse.json(
        { error: "Invalid WhatsApp phone number format. Must be 8 to 15 digits with country code." },
        { status: 400 }
      );
    }

    // 1. Get or create contact
    let { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", user.id)
      .eq("phone_number", cleaned)
      .maybeSingle();

    if (!contact) {
      const { data: newContact, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          user_id: user.id,
          phone_number: cleaned,
          name: name?.trim() || null,
          consent_status: "opted_in",
          ai_enabled: true,
        })
        .select()
        .single();

      if (contactErr || !newContact) {
        return NextResponse.json({ error: contactErr?.message || "Failed to create contact" }, { status: 500 });
      }
      contact = newContact;
    } else if (name?.trim() && !contact.name) {
      // Update name if previously blank
      await supabase.from("contacts").update({ name: name.trim() }).eq("id", contact.id);
      contact.name = name.trim();
    }

    // 2. Get connected WhatsApp account ID if any
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "connected")
      .maybeSingle();

    // 3. Get or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*, contact:contacts(*)")
      .eq("user_id", user.id)
      .eq("contact_id", contact.id)
      .maybeSingle();

    if (!conversation) {
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          user_id: user.id,
          contact_id: contact.id,
          whatsapp_account_id: waAccount?.id || null,
          status: "open",
          ai_status: "active",
          last_message_at: new Date().toISOString(),
          unread_count: 0,
        })
        .select("*, contact:contacts(*)")
        .single();

      if (convErr || !newConv) {
        return NextResponse.json({ error: convErr?.message || "Failed to start conversation" }, { status: 500 });
      }
      conversation = newConv;
    }

    return NextResponse.json({
      success: true,
      conversation,
    });
  } catch (err: unknown) {
    console.error("Start conversation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
