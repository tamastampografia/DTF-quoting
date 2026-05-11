import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getServiceClient } from "@/lib/supabase-service";
import { escapeHtml } from "@/lib/html-escape";
import { formatCurrency } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const payloadStr = formData.get("payload") as string;
    if (!payloadStr) {
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    const payload = JSON.parse(payloadStr);

    // Collect file names only — no base64 encoding to avoid timeout
    const fileNames: string[] = [];
    formData.forEach((value, key) => {
      if (key.startsWith("file_") && value instanceof File) {
        fileNames.push(value.name);
      }
    });

    // 1. Save to Supabase — always, before attempting email
    const supabase = getServiceClient();
    let orderId: string | null = null;
    if (supabase) {
      const { data, error } = await supabase
        .from("orders")
        .insert({ payload })
        .select("id")
        .single();
      if (error) console.error("[send-order] Supabase error:", error.message);
      if (!error && data) orderId = data.id;
    } else {
      console.log("[send-order] Supabase not configured");
    }

    // 2. Send email via Resend (no file attachments — filenames listed in body)
    const resendKey = process.env.RESEND_API_KEY;
    const orderEmails = (process.env.ORDER_EMAIL || "edoardo.modini@tamas.it")
      .split(",").map(e => e.trim()).filter(Boolean);
    const fromEmail = process.env.RESEND_FROM_EMAIL || "STAMPOO DTF <onboarding@resend.dev>";

    if (resendKey) {
      try {
        const resend = new Resend(resendKey);

        const subjectsRows = payload.subjects
          .map((s: any, i: number) => {
            const sr = payload.quote?.subjects?.[i];
            return `
              <tr>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(s.name)}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;">${s.width} &times; ${s.height} cm</td>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;">${s.quantity} pz</td>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;">${sr ? formatCurrency(sr.pricePerPiece) : "-"}</td>
                <td style="padding:6px 10px;border-bottom:1px solid #eee;">${sr ? formatCurrency(sr.totalPrice) : "-"}</td>
              </tr>`;
          })
          .join("");

        const filesHtml = fileNames.length > 0
          ? `<ul style="margin:4px 0;padding-left:20px;">${fileNames.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
          : "<p style='color:#888;'>Nessun file allegato</p>";

        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Nuovo ordine DTF</title></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:700px;margin:0 auto;padding:20px;">
  <h1 style="color:#1a1a2e;border-bottom:3px solid #3B82F6;padding-bottom:10px;">
    Nuovo ordine DTF &mdash; STAMPOO
  </h1>

  <h2 style="margin-top:24px;">Dati ordine</h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:4px 0;font-weight:bold;width:160px;">Azienda:</td><td>${escapeHtml(payload.companyName)}</td></tr>
    ${payload.clientName ? `<tr><td style="padding:4px 0;font-weight:bold;">Cliente:</td><td>${escapeHtml(payload.clientName)}</td></tr>` : ""}
    ${payload.clientCode ? `<tr><td style="padding:4px 0;font-weight:bold;">Codice cliente:</td><td>${escapeHtml(payload.clientCode)}</td></tr>` : ""}
    <tr><td style="padding:4px 0;font-weight:bold;">Fornitura:</td><td>${payload.includeCut ? "Pezzi pre-tagliati" : "Rullo intero"}</td></tr>
    <tr><td style="padding:4px 0;font-weight:bold;">Spedizione:</td><td>${payload.includeShipping ? (payload.isIslands ? "S&igrave; (Isole)" : "S&igrave;") : "No (ritiro in sede)"}</td></tr>
    <tr><td style="padding:4px 0;font-weight:bold;">Prezzo/m:</td><td>${formatCurrency(payload.quote?.pricePerMeter ?? 0)}/m</td></tr>
    <tr><td style="padding:4px 0;font-weight:bold;">Metri totali:</td><td>${(payload.quote?.totalRollMeters ?? 0).toFixed(2)} m</td></tr>
  </table>

  <h2 style="margin-top:24px;">Soggetti</h2>
  <table style="width:100%;border-collapse:collapse;border:1px solid #ddd;">
    <thead>
      <tr style="background:#f0f4ff;">
        <th style="padding:8px 10px;text-align:left;">Soggetto</th>
        <th style="padding:8px 10px;text-align:left;">Dimensioni</th>
        <th style="padding:8px 10px;text-align:left;">Quantit&agrave;</th>
        <th style="padding:8px 10px;text-align:left;">Prezzo/pz</th>
        <th style="padding:8px 10px;text-align:left;">Totale</th>
      </tr>
    </thead>
    <tbody>${subjectsRows}</tbody>
  </table>

  <h2 style="margin-top:24px;">Riepilogo economico</h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:4px 0;">Totale stampa:</td><td style="text-align:right;font-weight:bold;">${formatCurrency(payload.quote?.totalPrintPrice ?? 0)}</td></tr>
    ${payload.includeCut ? `<tr><td style="padding:4px 0;">Taglio pezzi:</td><td style="text-align:right;">${formatCurrency(payload.quote?.cutPrice ?? 0)}</td></tr>` : ""}
    ${payload.includeShipping ? `<tr><td style="padding:4px 0;">Spedizione:</td><td style="text-align:right;">${payload.quote?.shippingPrice === 0 ? "Gratuita" : formatCurrency(payload.quote?.shippingPrice ?? 0)}</td></tr>` : ""}
    <tr style="border-top:2px solid #333;">
      <td style="padding:8px 0;font-size:18px;font-weight:bold;">TOTALE ORDINE:</td>
      <td style="text-align:right;font-size:18px;font-weight:bold;color:#3B82F6;">${formatCurrency(payload.quote?.grandTotal ?? 0)}</td>
    </tr>
  </table>

  <h2 style="margin-top:24px;">File grafici (${fileNames.length})</h2>
  ${filesHtml}

  <p style="margin-top:24px;font-size:13px;color:#666;">
    ID ordine: ${orderId ?? "non salvato"}<br>
    Data: ${new Date(payload.createdAt).toLocaleString("it-IT")}
  </p>

  <hr style="margin-top:30px;border:none;border-top:1px solid #eee;">
  <p style="font-size:12px;color:#999;">
    STAMPOO &mdash; TAMAS SRL &mdash; Via Arzignano 10, 36070 Trissino (VI) &mdash; Tel. 0445 491417
  </p>
</body>
</html>`;

        await resend.emails.send({
          from: fromEmail,
          to: orderEmails,
          subject: `Nuovo ordine DTF - ${escapeHtml(payload.companyName)} - ${formatCurrency(payload.quote?.grandTotal ?? 0)}`,
          html,
        });
      } catch (emailErr: any) {
        // Email failure must not block the order — log and continue
        console.error("[send-order] Email error:", emailErr?.message);
      }
    }

    return NextResponse.json({ success: true, orderId });
  } catch (err: any) {
    console.error("[send-order] Error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
