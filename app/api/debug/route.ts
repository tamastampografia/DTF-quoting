import { NextRequest, NextResponse } from "next/server";

// TEMPORARY debug endpoint — remove after diagnosis
export async function GET(req: NextRequest) {
  const password = req.headers.get("x-admin-password");
  if (password !== (process.env.ADMIN_PASSWORD || "stampoo2025")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: {
      set: url.length > 0,
      startsWithHttps: url.startsWith("https://"),
      length: url.length,
      preview: url.length > 0 ? url.slice(0, 20) + "..." : "(empty)",
    },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: {
      set: anon.length > 0,
      length: anon.length,
      preview: anon.length > 0 ? anon.slice(0, 10) + "..." : "(empty)",
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      set: service.length > 0,
      longEnough: service.length > 10,
      length: service.length,
      preview: service.length > 0 ? service.slice(0, 10) + "..." : "(empty)",
    },
    ADMIN_PASSWORD: {
      set: (process.env.ADMIN_PASSWORD ?? "").length > 0,
    },
    ORDER_EMAIL: process.env.ORDER_EMAIL ?? "(not set)",
  });
}
