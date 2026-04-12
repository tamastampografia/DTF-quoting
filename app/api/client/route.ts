import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ client: null });

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ client: null });

  const { data, error } = await supabase
    .from("clients")
    .select("id, code, name, email, pricing_type, pricing_value")
    .eq("code", code.toUpperCase())
    .single();

  if (error || !data) return NextResponse.json({ client: null });
  return NextResponse.json({ client: data });
}
