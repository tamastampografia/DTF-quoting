import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import type { QuotePayload } from "@/lib/quotes";

export async function POST(req: NextRequest) {
  try {
    const payload: QuotePayload = await req.json();

    if (!payload.clientCode) {
      return NextResponse.json({ error: "clientCode obbligatorio" }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      // Fallback: log and return a fake ID for testing without DB
      console.log("[save-quote] Supabase not configured:", JSON.stringify(payload, null, 2));
      return NextResponse.json({ id: "local-" + Date.now() });
    }

    const { data, error } = await supabase
      .from("quotes")
      .insert({
        client_code: payload.clientCode,
        status: "draft",
        payload,
      })
      .select("id")
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (err: any) {
    console.error("[save-quote]", err);
    return NextResponse.json({ error: err?.message ?? "Errore" }, { status: 500 });
  }
}
