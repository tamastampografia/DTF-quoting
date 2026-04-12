import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";

export async function GET(req: NextRequest) {
  const password = req.headers.get("x-admin-password");
  const adminPassword = process.env.ADMIN_PASSWORD || "stampoo2025";

  if (password !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ orders: [], warning: "Supabase not configured" });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data ?? [] });
}
