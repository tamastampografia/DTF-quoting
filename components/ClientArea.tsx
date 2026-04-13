"use client";

import React, { useState, useEffect } from "react";
import type { QuoteRow } from "@/lib/quotes";
import { formatCurrency } from "@/lib/utils";

interface Props {
  clientCode: string;
  clientName?: string;
  onLoadQuote: (quote: QuoteRow) => void;
}

export default function ClientArea({ clientCode, clientName, onLoadQuote }: Props) {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes?clientCode=${encodeURIComponent(clientCode)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Errore");
      setQuotes(data.quotes ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [clientCode]);

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questo preventivo?")) return;
    await fetch(`/api/quotes?id=${id}`, { method: "DELETE" });
    load();
  };

  const drafts = quotes.filter(q => q.status === "draft");
  const ordered = quotes.filter(q => q.status === "ordered");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">STAMPOO</h1>
            <p className="text-sm text-gray-500">Area preventivi — {clientName ?? clientCode}</p>
          </div>
          <a
            href={`/${clientCode}`}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            + Nuovo preventivo
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {loading && (
          <div className="text-center py-16 text-gray-400">Caricamento…</div>
        )}

        {!loading && quotes.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-400 text-lg mb-2">Nessun preventivo salvato</p>
            <p className="text-gray-400 text-sm mb-6">Crea il tuo primo preventivo per poi salvarlo qui</p>
            <a
              href={`/${clientCode}`}
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
            >
              Crea preventivo
            </a>
          </div>
        )}

        {/* Draft quotes */}
        {drafts.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              Preventivi in attesa ({drafts.length})
            </h2>
            <div className="space-y-3">
              {drafts.map(q => (
                <QuoteCard
                  key={q.id}
                  quote={q}
                  onOrder={() => onLoadQuote(q)}
                  onDelete={() => handleDelete(q.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Ordered quotes */}
        {ordered.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Ordini confermati ({ordered.length})
            </h2>
            <div className="space-y-3">
              {ordered.map(q => (
                <QuoteCard
                  key={q.id}
                  quote={q}
                  onDelete={() => handleDelete(q.id)}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="mt-12 pb-8 text-center text-xs text-gray-400">
        STAMPOO — TAMAS SRL — Via Arzignano 10, 36070 Trissino (VI) — Tel. 0445 491417
      </footer>
    </div>
  );
}

// ─── QuoteCard ─────────────────────────────────────────────────────────────

interface CardProps {
  quote: QuoteRow;
  onOrder?: () => void;
  onDelete: () => void;
}

function QuoteCard({ quote, onOrder, onDelete }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const p = quote.payload;
  const q = p.quote;
  const date = new Date(quote.created_at).toLocaleDateString("it-IT", {
    day: "2-digit", month: "short", year: "numeric"
  });
  const isDraft = quote.status === "draft";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Summary row */}
      <div className="px-5 py-4 flex items-center justify-between gap-4">
        <button
          className="flex-1 text-left flex items-start gap-3 min-w-0"
          onClick={() => setExpanded(v => !v)}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm">
                {p.subjects.map(s => s.name).join(", ")}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDraft ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
                {isDraft ? "In attesa" : "Ordinato"}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {date} — {q.totalRollMeters.toFixed(2)} m — {formatCurrency(q.pricePerMeter)}/m
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {p.subjects.map(s => `${s.quantity} pz ${s.width}×${s.height}cm`).join(" · ")}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-lg font-bold text-blue-600">{formatCurrency(q.grandTotal)}</span>
          {isDraft && onOrder && (
            <button
              onClick={onOrder}
              className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
            >
              Converti in ordine
            </button>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-gray-300 hover:text-gray-500 text-sm px-1"
            title="Dettaglio"
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50">
          {/* Subjects */}
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left py-1">Soggetto</th>
                <th className="text-left py-1">Dim.</th>
                <th className="text-right py-1">Pz</th>
                <th className="text-right py-1">Prezzo/pz</th>
                <th className="text-right py-1">Subtotale</th>
              </tr>
            </thead>
            <tbody>
              {q.subjects.map((s, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="py-1.5 font-medium">{s.name}</td>
                  <td className="py-1.5 text-gray-500">{s.width}×{s.height} cm</td>
                  <td className="py-1.5 text-right">{s.quantity}</td>
                  <td className="py-1.5 text-right">{formatCurrency(s.pricePerPiece)}</td>
                  <td className="py-1.5 text-right font-medium">{formatCurrency(s.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="text-sm space-y-1 border-t border-gray-200 pt-2">
            <div className="flex justify-between text-gray-600">
              <span>Stampa ({q.totalRollMeters.toFixed(2)} m × {formatCurrency(q.pricePerMeter)}/m)</span>
              <span>{formatCurrency(q.totalPrintPrice)}</span>
            </div>
            {p.includeCut && (
              <div className="flex justify-between text-gray-600">
                <span>Taglio pezzi</span>
                <span>{formatCurrency(q.cutPrice)}</span>
              </div>
            )}
            {p.includeShipping && (
              <div className="flex justify-between text-gray-600">
                <span>Spedizione{p.isIslands ? " (Isole)" : ""}</span>
                <span>{q.shippingPrice === 0 ? "Gratuita" : formatCurrency(q.shippingPrice)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1">
              <span>Totale</span>
              <span className="text-blue-600">{formatCurrency(q.grandTotal)}</span>
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded border ${p.includeCut ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-100 border-gray-200 text-gray-500"}`}>
              {p.includeCut ? "Pre-tagliati" : "Rullo intero"}
            </span>
            <span className={`px-2 py-0.5 rounded border ${p.includeShipping ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-gray-100 border-gray-200 text-gray-500"}`}>
              {p.includeShipping ? (p.isIslands ? "Spedizione (Isole)" : "Spedizione") : "Ritiro in sede"}
            </span>
          </div>

          {/* Delete */}
          <div className="pt-1">
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Elimina preventivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
