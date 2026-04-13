import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";

// GET /api/quotes?clientCode=XXX  — list quotes for a client
// PATCH /api/quotes               — update quote status (body: { id, status })
// DELETE /api/quotes?id=XXX       — delete a quote

export async function GET(req: NextRequest) {
  const clientCode = req.nextUrl.searchParams.get("clientCode");
  if (!clientCode) {
    return NextResponse.json({ error: "clientCode obbligatorio" }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ quotes: [], warning: "Supabase not configured" });
  }

  const { data, error } = await supabase
    .from("quotes")
    .select("id, created_at, updated_at, client_code, status, payload")
    .eq("client_code", clientCode.toUpperCase())
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ quotes: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id e status obbligatori" }, { status: 400 });

  const { error } = await supabase
    .from("quotes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obbligatorio" }, { status: 400 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
