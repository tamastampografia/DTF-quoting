"use client";

import React, { useState, useRef, useCallback } from "react";
import { calculateNesting } from "@/lib/nesting";
import type { NestingResult, SubjectInput, ClientPricing, SubjectType } from "@/lib/nesting";
import { formatCurrency, getSubjectName, getSubjectColor } from "@/lib/utils";
import { extractProportions } from "@/lib/extract-proportions";
import type { FileProportions } from "@/lib/extract-proportions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubjectForm {
  name: string;
  type: SubjectType;
  width: string;
  height: string;
  quantity: string;
  file: File | null;
  ratio: number | null;
  lockRatio: boolean;
  proportionSource: FileProportions["source"] | null;
  extracting: boolean;
}

type Step = 1 | 2 | 3 | "confirmed";

interface Props {
  clientCode?: string;
  clientName?: string;
  pricing: ClientPricing;
  onLogout?: () => void;
}

const ACCEPTED_FORMATS = ".pdf,.ai,.eps,.svg,.png,.jpg,.jpeg,.tif,.tiff,.psd,.cdr";
const MAX_FILE_SIZE_MB = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptySubject(index: number): SubjectForm {
  return {
    name: getSubjectName(index),
    type: "single",
    width: "", height: "", quantity: "",
    file: null,
    ratio: null, lockRatio: false,
    proportionSource: null, extracting: false,
  };
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function validateSubjects(subjects: SubjectForm[]): string | null {
  for (const s of subjects) {
    const w = parseFloat(s.width);
    const h = parseFloat(s.height);
    const q = parseInt(s.quantity);
    if (!s.width || isNaN(w) || w <= 0)  return `${s.name}: larghezza non valida`;
    if (!s.height || isNaN(h) || h <= 0) return `${s.name}: altezza non valida`;
    if (!s.quantity || isNaN(q) || q < 1) return `${s.name}: quantità non valida`;
    // Width must always fit within the roll
    if (w > 57) return `${s.name}: larghezza massima 57 cm`;
    // For precomposed files the height can be up to 300 cm; for single logos both dims ≤ 57 cm
    if (s.type === "single"      && h > 57)  return `${s.name}: altezza massima 57 cm (logo singolo)`;
    if (s.type === "precomposed" && h > 300) return `${s.name}: altezza massima 300 cm (file impaginato)`;
  }
  return null;
}

// ─── Lock icon ────────────────────────────────────────────────────────────────

function LockIcon({ locked }: { locked: boolean }) {
  return locked ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function QuotingApp({ clientCode, clientName, pricing, onLogout }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [subjects, setSubjects] = useState<SubjectForm[]>([emptySubject(0)]);
  const [includeCut, setIncludeCut] = useState(false);
  const [includeShipping, setIncludeShipping] = useState(true);
  const [isIslands, setIsIslands] = useState(false);
  const [quote, setQuote] = useState<NestingResult | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Subject updater ──────────────────────────────────────────────────────

  function patchSubject(index: number, patch: Partial<SubjectForm>) {
    setSubjects(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  // ── Width / Height with lock ─────────────────────────────────────────────

  const handleWidthChange = (index: number, val: string) => {
    const s = subjects[index];
    if (s.lockRatio && s.ratio !== null) {
      const w = parseFloat(val);
      patchSubject(index, { width: val, height: isNaN(w) || w <= 0 ? s.height : round1(w / s.ratio) });
    } else {
      patchSubject(index, { width: val });
    }
  };

  const handleHeightChange = (index: number, val: string) => {
    const s = subjects[index];
    if (s.lockRatio && s.ratio !== null) {
      const h = parseFloat(val);
      patchSubject(index, { height: val, width: isNaN(h) || h <= 0 ? s.width : round1(h * s.ratio) });
    } else {
      patchSubject(index, { height: val });
    }
  };

  const toggleLock = (index: number) => patchSubject(index, { lockRatio: !subjects[index].lockRatio });

  // ── File change ──────────────────────────────────────────────────────────
  // IMPORTANTE: tutte le operazioni sullo stato usano functional updater
  // (prev => ...) per evitare stale closure su soggetti B, C, D ... H.

  const handleFileChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`File troppo grande. Massimo ${MAX_FILE_SIZE_MB} MB.`);
      e.target.value = "";
      return;
    }

    // Fase 1: segna come "in analisi" — functional updater, mai closure
    setSubjects(prev => {
      if (index >= prev.length) return prev;
      const next = [...prev];
      next[index] = { ...next[index], file, extracting: true, ratio: null, lockRatio: false, proportionSource: null };
      return next;
    });

    let result: import("@/lib/extract-proportions").FileProportions;
    try {
      result = await extractProportions(file);
    } catch {
      setSubjects(prev => {
        if (index >= prev.length) return prev;
        const next = [...prev];
        next[index] = { ...next[index], extracting: false, proportionSource: "none" };
        return next;
      });
      return;
    }

    // Fase 2: applica il risultato — functional updater, stato sempre fresco
    setSubjects(prev => {
      if (index >= prev.length) return prev;
      const next = [...prev];
      const s = prev[index];

      if (result.source === "absolute" && result.widthCm && result.heightCm) {
        next[index] = { ...s, extracting: false, ratio: result.ratio, lockRatio: true, proportionSource: "absolute", width: String(result.widthCm), height: String(result.heightCm) };
      } else if (result.source === "proportional" && result.ratio > 0) {
        const existingW = parseFloat(s.width);
        const existingH = parseFloat(s.height);
        const updated: SubjectForm = { ...s, extracting: false, ratio: result.ratio, lockRatio: true, proportionSource: "proportional" };
        if (!isNaN(existingW) && existingW > 0) updated.height = round1(existingW / result.ratio);
        else if (!isNaN(existingH) && existingH > 0) updated.width = round1(existingH * result.ratio);
        next[index] = updated;
      } else if (result.source === "raster") {
        // File raster: non proponiamo dimensioni, solo avvisiamo l'utente
        next[index] = { ...s, extracting: false, ratio: null, lockRatio: false, proportionSource: "raster" };
      } else {
        next[index] = { ...s, extracting: false, proportionSource: "none" };
      }

      return next;
    });
  };

  // ── Subject list ─────────────────────────────────────────────────────────

  const addSubject = () => {
    if (subjects.length >= 8) return;
    setSubjects(prev => [...prev, emptySubject(prev.length)]);
  };

  const removeSubject = (index: number) => {
    setSubjects(prev => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((s, i) => ({ ...s, name: getSubjectName(i) }));
    });
  };

  // ── Calculate ────────────────────────────────────────────────────────────

  const handleCalculate = () => {
    setError(null);
    const err = validateSubjects(subjects);
    if (err) { setError(err); return; }
    const missingFiles = subjects.filter(s => !s.file).map(s => s.name);
    if (missingFiles.length > 0) {
      setError(`Carica il file grafica per: ${missingFiles.join(", ")}`);
      return;
    }
    const inputs: SubjectInput[] = subjects.map(s => ({ name: s.name, type: s.type, width: parseFloat(s.width), height: parseFloat(s.height), quantity: parseInt(s.quantity) }));
    setQuote(calculateNesting(inputs, pricing, includeCut, includeShipping, isIslands));
    setStep(2);
  };

  // ── Step 2 recalculate ───────────────────────────────────────────────────

  const recalculate = useCallback((cut: boolean, shipping: boolean, islands: boolean) => {
    const inputs: SubjectInput[] = subjects.map(s => ({ name: s.name, type: s.type, width: parseFloat(s.width), height: parseFloat(s.height), quantity: parseInt(s.quantity) }));
    setQuote(calculateNesting(inputs, pricing, cut, shipping, islands));
  }, [subjects, pricing]);

  const handleCutChange = (val: boolean) => { setIncludeCut(val); recalculate(val, includeShipping, isIslands); };
  const handleShippingChange = (val: boolean) => { setIncludeShipping(val); recalculate(includeCut, val, isIslands); };
  const handleIslandsChange = (val: boolean) => { setIsIslands(val); recalculate(includeCut, includeShipping, val); };

  // ── Send order ───────────────────────────────────────────────────────────

  const handleSendOrder = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const inputs: SubjectInput[] = subjects.map(s => ({ name: s.name, type: s.type, width: parseFloat(s.width), height: parseFloat(s.height), quantity: parseInt(s.quantity) }));
      const payload = {
        companyName: clientName ?? clientCode ?? "",
        clientCode: clientCode ?? null,
        clientName: clientName ?? null,
        pricing,
        subjects: inputs,
        files: subjects.map(s => s.file ? { name: s.file.name, type: s.file.type, size: s.file.size } : null).filter(Boolean),
        quote,
        includeCut,
        includeShipping,
        isIslands,
        createdAt: new Date().toISOString(),
      };
      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      subjects.forEach((s, i) => { if (s.file) formData.append(`file_${i}`, s.file); });

      const res = await fetch("/api/send-order", { method: "POST", body: formData });
      if (!res.ok) {
        let msg = "Errore nell'invio";
        try { const d = await res.json(); msg = d.error ?? msg; } catch {}
        throw new Error(msg);
      }

      setStep("confirmed");
    } catch (err: any) {
      setError(err.message ?? "Errore nell'invio dell'ordine");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewQuote = () => {
    setStep(1);
    setSubjects([emptySubject(0)]);
    setIncludeCut(false);
    setIncludeShipping(true);
    setIsIslands(false);
    setQuote(null);
    setCompanyName("");
    setError(null);
  };

  // ── Derived state ────────────────────────────────────────────────────────

  // Cut option is unavailable when any subject is a precomposed file
  const hasPrecomposed = subjects.some(s => s.type === "precomposed");

  // ── Progress bar helpers ─────────────────────────────────────────────────

  const stepNumber = step === 1 ? 1 : step === 2 ? 2 : step === 3 ? 3 : 4;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">STAMPOO</h1>
            <p className="text-sm text-gray-500">Transfer DTF — Preventivo online</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full tracking-wide">versione BETA</span>
            {(pricing.type === "fixed" || pricing.type === "discount") && (
              <span className="bg-green-100 text-green-800 text-sm font-semibold px-3 py-1 rounded-full border border-green-200">
                {pricing.type === "fixed" ? `Prezzo riservato: ${formatCurrency(pricing.value)}/m` : `Sconto riservato: -${pricing.value}%`}
              </span>
            )}
            {clientName && (
              <span className="text-sm text-gray-600 hidden sm:block">{clientName}</span>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Esci
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map(s => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1.5 ${stepNumber >= s ? "text-blue-600" : "text-gray-400"}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold border-2 ${stepNumber > s ? "bg-blue-600 border-blue-600 text-white" : stepNumber === s ? "border-blue-600 text-blue-600" : "border-gray-300 text-gray-400"}`}>
                    {stepNumber > s ? "✓" : s}
                  </div>
                  <span className="text-sm font-medium hidden sm:inline">
                    {s === 1 ? "Soggetti" : s === 2 ? "Preventivo" : s === 3 ? "Ordine" : "Conferma"}
                  </span>
                </div>
                {s < 4 && <div className={`flex-1 h-0.5 ${stepNumber > s ? "bg-blue-600" : "bg-gray-200"}`} />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        {/* ── STEP 1 ─────────────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Inserisci i soggetti</h2>
              <p className="text-sm text-gray-500 mb-6">
                Larghezza massima rullo: <strong>57 cm</strong> — Ordine minimo: <strong>50 cm</strong> di rullo
              </p>
              <div className="space-y-4">
                {subjects.map((s, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: getSubjectColor(i) }} />
                        <span className="font-semibold text-gray-800">{s.name}</span>
                        {/* Type selector */}
                        <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs">
                          <button
                            type="button"
                            onClick={() => patchSubject(i, { type: "single" })}
                            className={`px-2.5 py-1 font-medium transition-colors ${s.type === "single" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                          >
                            Logo singolo
                          </button>
                          <button
                            type="button"
                            onClick={() => patchSubject(i, { type: "precomposed" })}
                            className={`px-2.5 py-1 font-medium border-l border-gray-300 transition-colors ${s.type === "precomposed" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                          >
                            File già impaginato
                          </button>
                        </div>
                        {s.extracting && <span className="text-xs text-blue-500 animate-pulse">Lettura file…</span>}
                        {!s.extracting && s.proportionSource === "absolute" && (
                          <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">✓ Dimensioni rilevate dal file</span>
                        )}
                        {!s.extracting && s.proportionSource === "proportional" && (
                          <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">Proporzioni rilevate</span>
                        )}
                        {!s.extracting && s.proportionSource === "raster" && (
                          <span className="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded">File raster</span>
                        )}
                      </div>
                      {subjects.length > 1 && (
                        <button onClick={() => removeSubject(i)} className="text-red-400 hover:text-red-600 text-sm font-medium">Rimuovi</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_1fr_1fr] gap-3 items-end">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Larghezza (cm)</label>
                        <input type="number" min="1" max="57" step="0.1" value={s.width} onChange={e => handleWidthChange(i, e.target.value)} placeholder="es. 20" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="flex items-end justify-center pb-2">
                        {s.ratio !== null ? (
                          <button type="button" title={s.lockRatio ? "Proporzioni vincolate" : "Clicca per vincolare"} onClick={() => toggleLock(i)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center border transition-colors ${s.lockRatio ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700" : "bg-white border-gray-300 text-gray-400 hover:border-gray-500"}`}>
                            <LockIcon locked={s.lockRatio} />
                          </button>
                        ) : <div className="w-7 h-7" />}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Altezza (cm)
                          {s.type === "precomposed" && <span className="text-gray-400 font-normal"> max 300</span>}
                        </label>
                        <input
                          type="number" min="1" max={s.type === "precomposed" ? 300 : 57} step="0.1"
                          value={s.height} onChange={e => handleHeightChange(i, e.target.value)}
                          placeholder={s.type === "precomposed" ? "es. 100" : "es. 30"}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {s.type === "precomposed" ? "N° copie" : "Quantità (pz)"}
                        </label>
                        <input type="number" min="1" step="1" value={s.quantity} onChange={e => patchSubject(i, { quantity: e.target.value })} placeholder="es. 50" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">File grafica <span className="text-red-500">*</span></label>
                        <input type="file" accept={ACCEPTED_FORMATS} ref={el => { fileInputRefs.current[i] = el; }} onChange={e => handleFileChange(i, e)} className="hidden" />
                        <button type="button" onClick={() => fileInputRefs.current[i]?.click()}
                          className={`w-full border rounded-md px-3 py-2 text-sm text-left truncate ${s.file ? "border-green-400 bg-green-50 text-green-700" : "border-gray-300 bg-white text-gray-500 hover:border-gray-400"}`}>
                          {s.extracting ? "Analisi…" : s.file ? s.file.name : "Carica file…"}
                        </button>
                        <p className="text-xs text-gray-400 mt-1">PDF, AI, SVG, PNG, JPG… max 20MB</p>
                      </div>
                    </div>
                    {/* Info: file già impaginato */}
                    {s.type === "precomposed" && (
                      <p className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                        ℹ️ <strong>File già impaginato:</strong> inserisci le dimensioni dell'intero file e quante copie ti servono. Il taglio non sarà disponibile.
                      </p>
                    )}
                    {/* Messaggio: inserisci una dimensione */}
                    {!s.extracting && s.proportionSource === "proportional" && s.ratio !== null && !s.width && !s.height && (
                      <p className="mt-2 text-xs text-blue-600">Inserisci larghezza o altezza — l'altra verrà calcolata automaticamente</p>
                    )}
                    {/* Messaggio: verifica dimensioni rilevate automaticamente */}
                    {!s.extracting && (s.proportionSource === "absolute" || (s.proportionSource === "proportional" && (s.width || s.height))) && (
                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        ⚠️ Verifica che larghezza e altezza corrispondano alle dimensioni reali di stampa desiderate e correggile se necessario.
                      </p>
                    )}
                    {/* Messaggio: file raster, nessuna dimensione proposta */}
                    {!s.extracting && s.proportionSource === "raster" && (
                      <p className="mt-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
                        ⚠️ File raster (PNG/JPG/TIFF/PSD): le dimensioni in pixel non corrispondono necessariamente alle dimensioni di stampa. Inserisci larghezza e altezza in cm manualmente.
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {subjects.length < 8 ? (
                <button onClick={addSubject} className="mt-4 flex items-center gap-1.5 text-blue-600 hover:text-blue-800 text-sm font-medium">
                  <span className="text-lg leading-none">+</span> Aggiungi soggetto
                </button>
              ) : (
                <p className="mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠️ Hai raggiunto il numero massimo di <strong>8 soggetti</strong> per ordine. Per aggiungerne altri, crea un nuovo ordine separato.
                </p>
              )}
            </div>
            <button onClick={handleCalculate} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors text-base shadow">
              Calcola preventivo
            </button>
          </div>
        )}

        {/* ── STEP 2 ─────────────────────────────────────────────────────── */}
        {step === 2 && quote && (
          <div className="space-y-4">
            {/* Options */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Opzioni fornitura</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Tipo fornitura</p>
                  <div className="flex gap-2">
                    <button onClick={() => handleCutChange(false)} className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${!includeCut ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"}`}>Rullo intero</button>
                    <button
                      onClick={() => !hasPrecomposed && handleCutChange(true)}
                      disabled={hasPrecomposed}
                      title={hasPrecomposed ? "Non disponibile per file già impaginati" : undefined}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${includeCut && !hasPrecomposed ? "bg-blue-600 text-white border-blue-600" : hasPrecomposed ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed" : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"}`}
                    >Pre-tagliati (+€0,10/pz)</button>
                  </div>
                  {hasPrecomposed && (
                    <p className="text-xs text-gray-500 mt-1.5">Il taglio non è disponibile per file già impaginati</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Consegna</p>
                  <div className="flex gap-2">
                    <button onClick={() => handleShippingChange(true)} className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${includeShipping ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"}`}>Con spedizione</button>
                    <button onClick={() => handleShippingChange(false)} className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${!includeShipping ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"}`}>Ritiro in sede</button>
                  </div>
                </div>
              </div>
              {includeShipping && (
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer w-fit">
                    <input type="checkbox" checked={isIslands} onChange={e => handleIslandsChange(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    Destinazione Isole (+€5,00)
                  </label>
                </div>
              )}
            </div>

            {/* Subjects table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Dettaglio soggetti</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Prezzo/m: <strong>{formatCurrency(quote.pricePerMeter)}/m</strong> — Metri rullo: <strong>{quote.totalRollMeters.toFixed(2)} m</strong>
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3">Soggetto</th>
                      <th className="text-left px-4 py-3">Dimensioni</th>
                      <th className="text-right px-4 py-3">Pezzi</th>
                      <th className="text-right px-4 py-3">Prezzo/pz</th>
                      <th className="text-right px-4 py-3">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.subjects.map((s, i) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getSubjectColor(i) }} />
                            <span className="font-medium text-gray-800">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{s.width} × {s.height} cm</td>
                        <td className="px-4 py-3 text-right text-gray-700">{s.quantity}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">{formatCurrency(s.pricePerPiece)}</td>
                        <td className="px-4 py-3 text-right text-gray-800">{formatCurrency(s.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Riepilogo economico</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-700"><span>Totale stampa</span><span className="font-medium">{formatCurrency(quote.totalPrintPrice)}</span></div>
                {includeCut && <div className="flex justify-between text-sm text-gray-700"><span>Taglio pezzi ({subjects.reduce((a, s) => a + parseInt(s.quantity || "0"), 0)} pz × €0,10)</span><span className="font-medium">{formatCurrency(quote.cutPrice)}</span></div>}
                {includeShipping && <div className="flex justify-between text-sm text-gray-700"><span>Spedizione</span><span className={`font-medium ${quote.shippingPrice === 0 ? "text-green-600" : ""}`}>{quote.shippingPrice === 0 ? "Gratuita" : formatCurrency(quote.shippingPrice)}</span></div>}
                {includeShipping && quote.shippingPrice === 0 && <p className="text-xs text-green-600">Spedizione gratuita per ordini ≥ €200</p>}
                <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between items-center">
                  <span className="text-base font-bold text-gray-900">Totale ordine</span>
                  <span className="text-2xl font-bold text-blue-600">{formatCurrency(quote.grandTotal)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">Spedizione pronta in 48h dall'ordine</p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setStep(1)}
                className="sm:flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-5 rounded-xl transition-colors"
              >
                Modifica soggetti
              </button>
              <button
                onClick={() => { setError(null); setStep(3); }}
                className="sm:flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-5 rounded-xl transition-colors shadow"
              >
                Conferma ordine →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3 ─────────────────────────────────────────────────────── */}
        {step === 3 && quote && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Riepilogo ordine</h2>
              <div className="text-sm text-gray-600 space-y-1 mb-4">
                <p><span className="font-medium">Fornitura:</span> {includeCut ? "Pezzi pre-tagliati" : "Rullo intero"}</p>
                <p><span className="font-medium">Consegna:</span> {includeShipping ? (isIslands ? "Spedizione (Isole)" : "Spedizione standard") : "Ritiro in sede"}</p>
                <p><span className="font-medium">Prezzo/m:</span> {formatCurrency(quote.pricePerMeter)}/m — <span className="font-medium">Metri:</span> {quote.totalRollMeters.toFixed(2)} m</p>
              </div>
              <table className="w-full text-sm mb-4">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2">Soggetto</th>
                    <th className="text-left px-3 py-2">Dim.</th>
                    <th className="text-right px-3 py-2">Pz</th>
                    <th className="text-right px-3 py-2">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.subjects.map((s, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-gray-500">{s.width}×{s.height}</td>
                      <td className="px-3 py-2 text-right">{s.quantity}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(s.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-gray-200 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600"><span>Stampa</span><span>{formatCurrency(quote.totalPrintPrice)}</span></div>
                {includeCut && <div className="flex justify-between text-gray-600"><span>Taglio</span><span>{formatCurrency(quote.cutPrice)}</span></div>}
                {includeShipping && <div className="flex justify-between text-gray-600"><span>Spedizione</span><span>{quote.shippingPrice === 0 ? "Gratuita" : formatCurrency(quote.shippingPrice)}</span></div>}
                <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-200">
                  <span>TOTALE</span>
                  <span className="text-blue-600 text-xl">{formatCurrency(quote.grandTotal)}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-colors">Torna al preventivo</button>
              <button
                onClick={handleSendOrder}
                disabled={submitting}
                className="flex-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors shadow disabled:opacity-50"
              >
                {submitting ? "Invio in corso…" : "Invia ordine"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: CONFIRMED ─────────────────────────────────────────────── */}
        {step === "confirmed" && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-green-600 text-3xl">✓</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Ordine inviato!</h2>
            <p className="text-gray-600 mb-1">Il tuo ordine è stato inviato a <strong>dtf@tamas.it</strong></p>
            <p className="text-gray-600 mb-6">Spedizione pronta in <strong>48 ore</strong> dall'ordine</p>
            <div className="text-sm text-gray-500 mb-8 bg-gray-50 rounded-lg p-4">
              <p className="font-medium text-gray-700">TAMAS SRL — STAMPOO DTF</p>
              <p>Via Arzignano 10, 36070 Trissino (VI)</p>
              <p>Tel. 0445 491417</p>
            </div>
            <button onClick={handleNewQuote} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors shadow">
              Nuovo preventivo
            </button>
          </div>
        )}
      </main>

      <footer className="mt-12 pb-8 text-center text-xs text-gray-400">
        STAMPOO — TAMAS SRL — Via Arzignano 10, 36070 Trissino (VI) — Tel. 0445 491417
      </footer>
    </div>
  );
}
