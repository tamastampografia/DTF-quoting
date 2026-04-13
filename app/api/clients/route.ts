import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import bcrypt from "bcryptjs";

function checkAuth(req: NextRequest): boolean {
  const password = req.headers.get("x-admin-password");
  const adminPassword = process.env.ADMIN_PASSWORD || "stampoo2025";
  return password === adminPassword;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ clients: [], warning: "Supabase not configured" });

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clients: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await req.json();
  const { code, name, email, pricing_type, pricing_value, username, password } = body;

  if (!code || !name) return NextResponse.json({ error: "code e name obbligatori" }, { status: 400 });
  if (!username) return NextResponse.json({ error: "username obbligatorio" }, { status: 400 });
  if (!password) return NextResponse.json({ error: "password obbligatoria" }, { status: 400 });

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from("clients")
    .insert({ code, name, email, pricing_type: pricing_type ?? "standard", pricing_value: pricing_value ?? 0, username, password_hash })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await req.json();
  const { id, name, email, pricing_type, pricing_value, username, password } = body;

  if (!id) return NextResponse.json({ error: "id obbligatorio" }, { status: 400 });

  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (pricing_type !== undefined) updates.pricing_type = pricing_type;
  if (pricing_value !== undefined) updates.pricing_value = pricing_value;
  if (username !== undefined) updates.username = username;
  if (password) updates.password_hash = await bcrypt.hash(password, 10);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("clients")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obbligatorio" }, { status: 400 });

  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
