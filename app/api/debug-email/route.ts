import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export async function GET(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== (process.env.ADMIN_PASSWORD || "stampoo2025")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.RESEND_API_KEY;
  const orderEmail = process.env.ORDER_EMAIL || "edoardo.modini@tamas.it";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "STAMPOO DTF <onboarding@resend.dev>";

  if (!key) {
    return NextResponse.json({ error: "RESEND_API_KEY non impostata" });
  }

  try {
    const resend = new Resend(key);
    const result = await resend.emails.send({
      from: fromEmail,
      to: [orderEmail],
      subject: "Test STAMPOO — verifica configurazione email",
      html: "<p>Se ricevi questa mail, Resend è configurato correttamente ✅</p>",
    });
    return NextResponse.json({
      success: true,
      resendId: result.data?.id,
      to: orderEmail,
      from: fromEmail,
      error: result.error,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message });
  }
}
