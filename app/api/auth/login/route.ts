import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username e password obbligatori" }, { status: 400 });
    }

    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ error: "Servizio non disponibile" }, { status: 503 });
    }

    const { data, error } = await supabase
      .from("clients")
      .select("code, name, pricing_type, pricing_value, password_hash")
      .eq("username", username)
      .single();

    if (error || !data || !data.password_hash) {
      return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, data.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
    }

    return NextResponse.json({
      client: {
        code: data.code,
        name: data.name,
        pricing_type: data.pricing_type,
        pricing_value: data.pricing_value,
      },
    });
  } catch (err: any) {
    console.error("[auth/login]", err);
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
