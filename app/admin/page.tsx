"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { calculateNesting, STANDARD_TIERS, getStandardPricePerMeter } from "@/lib/nesting";
import type { ClientPricing, SubjectInput, NestingResult } from "@/lib/nesting";
import { formatCurrency, generateClientCode } from "@/lib/utils";

const NestingRollPreview = dynamic(() => import("@/components/NestingRollPreview"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string;
  code: string;
  name: string;
  email: string | null;
  pricing_type: "standard" | "fixed" | "discount";
  pricing_value: number;
  username: string | null;
  created_at: string;
}

interface EditClientForm {
  id: string;
  name: string;
  email: string;
  pricing_type: ClientRow["pricing_type"];
  pricing_value: string;
  username: string;
  password: string;
}

interface OrderRow {
  id: string;
  created_at: string;
  payload: any;
}

type AdminTab = "orders" | "clients" | "pricing" | "preview";

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<AdminTab>("orders");

  // Orders
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Clients
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", pricing_type: "standard" as ClientRow["pricing_type"], pricing_value: "", username: "", password: "" });
  const [clientError, setClientError] = useState("");
  const [clientSuccess, setClientSuccess] = useState("");
  const [editClient, setEditClient] = useState<EditClientForm | null>(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Preview
  const [previewJson, setPreviewJson] = useState(`[
  { "name": "Soggetto A", "width": 20, "height": 30, "quantity": 80 },
  { "name": "Soggetto B", "width": 15, "height": 10, "quantity": 150 }
]`);
  const [previewResult, setPreviewResult] = useState<NestingResult | null>(null);
  const [previewCut, setPreviewCut] = useState(false);
  const [previewShipping, setPreviewShipping] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // ── Auth ────────────────────────────────────────────────────────────────

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Client-side check only; server APIs re-validate
    if (password === "stampoo2025" || password.length >= 6) {
      setAuthenticated(true);
      setAuthError("");
      loadOrders(password);
      loadClients(password);
    } else {
      setAuthError("Password non valida");
    }
  };

  // ── Orders ──────────────────────────────────────────────────────────────

  const loadOrders = async (pwd?: string) => {
    const p = pwd ?? password;
    setOrdersLoading(true);
    try {
      const res = await fetch("/api/orders", { headers: { "x-admin-password": p } });
      const data = await res.json();
      if (data.orders) setOrders(data.orders);
    } catch {}
    setOrdersLoading(false);
  };

  // ── Clients ─────────────────────────────────────────────────────────────

  const loadClients = async (pwd?: string) => {
    const p = pwd ?? password;
    setClientsLoading(true);
    try {
      const res = await fetch("/api/clients", { headers: { "x-admin-password": p } });
      const data = await res.json();
      if (data.clients) setClients(data.clients);
    } catch {}
    setClientsLoading(false);
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError("");
    setClientSuccess("");

    if (!newClient.name.trim()) { setClientError("Nome azienda obbligatorio"); return; }

    const pricing_value = newClient.pricing_type !== "standard" ? parseFloat(newClient.pricing_value) : 0;
    if (newClient.pricing_type !== "standard" && isNaN(pricing_value)) {
      setClientError("Valore pricing non valido");
      return;
    }

    if (!newClient.username.trim()) { setClientError("Username obbligatorio"); return; }
    if (!newClient.password.trim()) { setClientError("Password obbligatoria"); return; }

    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-password": password },
        body: JSON.stringify({
          code: generateClientCode(),
          name: newClient.name.trim(),
          email: newClient.email.trim() || null,
          pricing_type: newClient.pricing_type,
          pricing_value,
          username: newClient.username.trim(),
          password: newClient.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setClientError(data.error ?? "Errore"); return; }
      setClientSuccess("Cliente aggiunto con successo");
      setNewClient({ name: "", email: "", pricing_type: "standard", pricing_value: "", username: "", password: "" });
      loadClients();
    } catch (err: any) {
      setClientError(err.message);
    }
  };

  const handleEditClient = (c: ClientRow) => {
    setEditClient({
      id: c.id,
      name: c.name,
      email: c.email ?? "",
      pricing_type: c.pricing_type,
      pricing_value: c.pricing_value !== 0 ? String(c.pricing_value) : "",
      username: c.username ?? "",
      password: "",
    });
    setEditError("");
  };

  const handleSaveEdit = async () => {
    if (!editClient) return;
    setEditError("");
    setEditSaving(true);
    try {
      const body: Record<string, any> = {
        id: editClient.id,
        name: editClient.name.trim(),
        email: editClient.email.trim() || null,
        pricing_type: editClient.pricing_type,
        pricing_value: editClient.pricing_type !== "standard" ? parseFloat(editClient.pricing_value) : 0,
        username: editClient.username.trim(),
      };
      if (editClient.password) body.password = editClient.password;

      const res = await fetch("/api/clients", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-admin-password": password },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error ?? "Errore"); return; }
      setEditClient(null);
      loadClients();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm("Eliminare questo cliente?")) return;
    await fetch(`/api/clients?id=${id}`, { method: "DELETE", headers: { "x-admin-password": password } });
    loadClients();
  };

  // ── Preview ─────────────────────────────────────────────────────────────

  const handlePreview = () => {
    setPreviewError("");
    try {
      const subjects: SubjectInput[] = JSON.parse(previewJson);
      const pricing: ClientPricing = { type: "standard", value: 0 };
      const result = calculateNesting(subjects, pricing, previewCut, previewShipping, false);
      setPreviewResult(result);
    } catch (err: any) {
      setPreviewError("JSON non valido: " + err.message);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-md p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin STAMPOO</h1>
          <p className="text-sm text-gray-500 mb-6">Pannello di gestione</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Password admin"
                autoFocus
              />
            </div>
            {authError && <p className="text-red-500 text-sm">{authError}</p>}
            <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors">
              Accedi
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">STAMPOO — Admin</h1>
            <p className="text-xs text-gray-500">TAMAS SRL</p>
          </div>
          <a href="/" className="text-sm text-blue-600 hover:underline">← Vista cliente</a>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {(["orders", "clients", "pricing", "preview"] as AdminTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
            >
              {t === "orders" ? "Ordini" : t === "clients" ? "Clienti" : t === "pricing" ? "Listino standard" : "Preview impaginazione"}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">

        {/* ── ORDERS ────────────────────────────────────────────────── */}
        {tab === "orders" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Ordini ricevuti ({orders.length})</h2>
              <button
                onClick={() => loadOrders()}
                className="text-sm bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
              >
                {ordersLoading ? "Caricamento…" : "Aggiorna"}
              </button>
            </div>

            {orders.length === 0 && !ordersLoading && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                Nessun ordine ricevuto
              </div>
            )}

            <div className="space-y-3">
              {orders.map(order => {
                const p = order.payload;
                const isExpanded = expandedOrder === order.id;
                return (
                  <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <button
                      className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-gray-50"
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-semibold text-gray-900">{p?.companyName ?? "—"}</p>
                          <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString("it-IT")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-blue-600">{formatCurrency(p?.quote?.grandTotal ?? 0)}</span>
                        <span className="text-gray-400 text-lg">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div><p className="text-gray-500 text-xs">Azienda</p><p className="font-medium">{p?.companyName}</p></div>
                          <div><p className="text-gray-500 text-xs">Codice cliente</p><p className="font-medium">{p?.clientCode ?? "standard"}</p></div>
                          <div><p className="text-gray-500 text-xs">Fornitura</p><p className="font-medium">{p?.includeCut ? "Pre-tagliati" : "Rullo intero"}</p></div>
                          <div><p className="text-gray-500 text-xs">Spedizione</p><p className="font-medium">{p?.includeShipping ? (p?.isIslands ? "Sì (Isole)" : "Sì") : "Ritiro"}</p></div>
                          <div><p className="text-gray-500 text-xs">Prezzo/m</p><p className="font-medium">{formatCurrency(p?.quote?.pricePerMeter ?? 0)}</p></div>
                          <div><p className="text-gray-500 text-xs">Metri</p><p className="font-medium">{(p?.quote?.totalRollMeters ?? 0).toFixed(2)} m</p></div>
                          <div><p className="text-gray-500 text-xs">Stampa</p><p className="font-medium">{formatCurrency(p?.quote?.totalPrintPrice ?? 0)}</p></div>
                          <div><p className="text-gray-500 text-xs">Totale</p><p className="font-bold text-blue-600">{formatCurrency(p?.quote?.grandTotal ?? 0)}</p></div>
                        </div>

                        {/* Subjects */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Soggetti</p>
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs text-gray-500">
                              <tr>
                                <th className="text-left px-3 py-2">Nome</th>
                                <th className="text-left px-3 py-2">Dim.</th>
                                <th className="text-right px-3 py-2">Pz</th>
                                <th className="text-right px-3 py-2">Prezzo/pz</th>
                                <th className="text-right px-3 py-2">Totale</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(p?.quote?.subjects ?? []).map((s: any, i: number) => (
                                <tr key={i} className="border-t border-gray-100">
                                  <td className="px-3 py-1.5">{s.name}</td>
                                  <td className="px-3 py-1.5 text-gray-500">{s.width}×{s.height} cm</td>
                                  <td className="px-3 py-1.5 text-right">{s.quantity}</td>
                                  <td className="px-3 py-1.5 text-right">{formatCurrency(s.pricePerPiece)}</td>
                                  <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(s.totalPrice)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Files */}
                        {p?.files?.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">File allegati</p>
                            <div className="flex flex-wrap gap-2">
                              {p.files.map((f: any, i: number) => (
                                <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded border border-blue-100">
                                  {f.name} ({(f.size / 1024).toFixed(0)} KB)
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Nesting preview */}
                        {p?.quote?.svgPreviewData && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Anteprima impaginazione</p>
                            <div className="border border-gray-200 rounded-lg overflow-auto bg-gray-50 p-2">
                              <NestingRollPreview result={p.quote} />
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-gray-400">ID: {order.id}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CLIENTS ───────────────────────────────────────────────── */}
        {tab === "clients" && (
          <div className="space-y-6">
            {/* Add client form */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Aggiungi cliente</h2>
              <form onSubmit={handleAddClient} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nome azienda *</label>
                  <input
                    type="text"
                    value={newClient.name}
                    onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Es. Mario Rossi SRL"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="cliente@esempio.it"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo pricing</label>
                  <select
                    value={newClient.pricing_type}
                    onChange={e => setNewClient(p => ({ ...p, pricing_type: e.target.value as ClientRow["pricing_type"] }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="standard">Standard (scaglioni normali)</option>
                    <option value="fixed">Prezzo fisso (€/m costante)</option>
                    <option value="discount">Sconto % sullo standard</option>
                  </select>
                </div>
                {newClient.pricing_type !== "standard" && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {newClient.pricing_type === "fixed" ? "Prezzo fisso (€/m)" : "Sconto (%)"}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={newClient.pricing_value}
                      onChange={e => setNewClient(p => ({ ...p, pricing_value: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={newClient.pricing_type === "fixed" ? "es. 9.50" : "es. 15"}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Username *</label>
                  <input
                    type="text"
                    value={newClient.username}
                    onChange={e => setNewClient(p => ({ ...p, username: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Es. mariorossi"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
                  <input
                    type="password"
                    value={newClient.password}
                    onChange={e => setNewClient(p => ({ ...p, password: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Password accesso cliente"
                    autoComplete="new-password"
                  />
                </div>

                {clientError && <p className="col-span-2 text-red-500 text-sm">{clientError}</p>}
                {clientSuccess && <p className="col-span-2 text-green-600 text-sm">{clientSuccess}</p>}

                <div className="col-span-2">
                  <button type="submit" className="bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm">
                    Aggiungi cliente
                  </button>
                </div>
              </form>
            </div>

            {/* Clients list */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Clienti ({clients.length})</h2>
                <button onClick={() => loadClients()} className="text-sm text-blue-600 hover:underline">
                  {clientsLoading ? "…" : "Aggiorna"}
                </button>
              </div>
              {clients.length === 0 ? (
                <p className="p-8 text-center text-gray-400 text-sm">Nessun cliente</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-left px-4 py-3">Azienda</th>
                        <th className="text-left px-4 py-3">Email</th>
                        <th className="text-left px-4 py-3">Username</th>
                        <th className="text-left px-4 py-3">Pricing</th>
                        <th className="text-center px-4 py-3">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map(c => (
                        <React.Fragment key={c.id}>
                          <tr className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{c.name}</td>
                            <td className="px-4 py-3 text-gray-500">{c.email ?? "—"}</td>
                            <td className="px-4 py-3 font-mono text-xs">{c.username ?? "—"}</td>
                            <td className="px-4 py-3">
                              {c.pricing_type === "standard" && <span className="text-gray-500">Standard</span>}
                              {c.pricing_type === "fixed" && <span className="text-blue-600 font-medium">Fisso {formatCurrency(c.pricing_value)}/m</span>}
                              {c.pricing_type === "discount" && <span className="text-green-600 font-medium">-{c.pricing_value}%</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => handleEditClient(c)}
                                  className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100"
                                >
                                  Modifica
                                </button>
                                <button
                                  onClick={() => handleDeleteClient(c.id)}
                                  className="text-xs bg-red-50 text-red-500 px-2 py-1 rounded hover:bg-red-100"
                                >
                                  Elimina
                                </button>
                              </div>
                            </td>
                          </tr>
                          {editClient?.id === c.id && (
                            <tr className="border-t border-blue-100 bg-blue-50">
                              <td colSpan={5} className="px-4 py-4">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome azienda</label>
                                    <input type="text" value={editClient.name} onChange={e => setEditClient(p => p ? { ...p, name: e.target.value } : p)}
                                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                                    <input type="email" value={editClient.email} onChange={e => setEditClient(p => p ? { ...p, email: e.target.value } : p)}
                                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Tipo pricing</label>
                                    <select value={editClient.pricing_type} onChange={e => setEditClient(p => p ? { ...p, pricing_type: e.target.value as ClientRow["pricing_type"] } : p)}
                                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                      <option value="standard">Standard</option>
                                      <option value="fixed">Prezzo fisso</option>
                                      <option value="discount">Sconto %</option>
                                    </select>
                                  </div>
                                  {editClient.pricing_type !== "standard" && (
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">
                                        {editClient.pricing_type === "fixed" ? "Prezzo fisso (€/m)" : "Sconto (%)"}
                                      </label>
                                      <input type="number" min="0" step="0.01" value={editClient.pricing_value}
                                        onChange={e => setEditClient(p => p ? { ...p, pricing_value: e.target.value } : p)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                  )}
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
                                    <input type="text" value={editClient.username} onChange={e => setEditClient(p => p ? { ...p, username: e.target.value } : p)}
                                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoComplete="off" />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Nuova password <span className="text-gray-400">(lascia vuoto per non cambiare)</span></label>
                                    <input type="password" value={editClient.password} onChange={e => setEditClient(p => p ? { ...p, password: e.target.value } : p)}
                                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoComplete="new-password" placeholder="Nuova password…" />
                                  </div>
                                </div>
                                {editError && <p className="text-red-500 text-sm mb-2">{editError}</p>}
                                <div className="flex gap-2">
                                  <button onClick={handleSaveEdit} disabled={editSaving}
                                    className="bg-blue-600 text-white text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                    {editSaving ? "Salvataggio…" : "Salva"}
                                  </button>
                                  <button onClick={() => setEditClient(null)}
                                    className="bg-gray-100 text-gray-700 text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-200 transition-colors">
                                    Annulla
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PRICING ───────────────────────────────────────────────── */}
        {tab === "pricing" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Listino standard DTF</h2>
              <p className="text-xs text-gray-500 mt-0.5">Lo scaglione si applica sull'intera metratura dell'ordine</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-3">Scaglione</th>
                  <th className="text-right px-5 py-3">Prezzo al metro</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "0,5 m (minimo)", meters: 0.3 },
                  { label: "1 m", meters: 1 },
                  { label: "2 – 3 m", meters: 2 },
                  { label: "4 – 9 m", meters: 4 },
                  { label: "10 – 24 m", meters: 10 },
                  { label: "25 – 49 m", meters: 25 },
                  { label: "50 – 99 m", meters: 50 },
                  { label: "100+ m", meters: 100 },
                ].map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-5 py-3">{row.label}</td>
                    <td className="px-5 py-3 text-right font-semibold text-blue-700">
                      {formatCurrency(getStandardPricePerMeter(row.meters))}/m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-4 border-t border-gray-100 text-xs text-gray-500 space-y-1">
              <p>Larghezza utile rullo: <strong>58 cm</strong></p>
              <p>Gap tra pezzi: <strong>1 cm</strong> (0,5 cm per lato)</p>
              <p>Ordine minimo: <strong>50 cm di rullo</strong></p>
              <p>Taglio pre-tagliato: <strong>€0,10/pz</strong></p>
              <p>Spedizione: <strong>€10,00</strong> (gratuita ≥ €200)</p>
              <p>Isole: <strong>€15,00</strong></p>
            </div>
          </div>
        )}

        {/* ── PREVIEW ───────────────────────────────────────────────── */}
        {tab === "preview" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Preview impaginazione (uso interno)</h2>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">JSON soggetti</label>
                <textarea
                  value={previewJson}
                  onChange={e => setPreviewJson(e.target.value)}
                  rows={8}
                  className="w-full font-mono text-xs border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={previewCut} onChange={e => setPreviewCut(e.target.checked)} className="rounded" />
                  Pre-tagliati
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={previewShipping} onChange={e => setPreviewShipping(e.target.checked)} className="rounded" />
                  Con spedizione
                </label>
                <button
                  onClick={handlePreview}
                  className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Genera preview
                </button>
                {previewResult && (
                  <button
                    onClick={() => window.print()}
                    className="bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Export PDF
                  </button>
                )}
              </div>
              {previewError && <p className="text-red-500 text-sm">{previewError}</p>}
            </div>

            {previewResult && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <div className="border border-gray-200 rounded-lg overflow-auto bg-gray-50 p-2">
                  <NestingRollPreview result={previewResult} />
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Dettaglio tecnico colonne</p>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="text-left px-3 py-2">Soggetto</th>
                        <th className="text-left px-3 py-2">Dim. effettive</th>
                        <th className="text-right px-3 py-2">Colonne</th>
                        <th className="text-right px-3 py-2">Pz</th>
                        <th className="text-right px-3 py-2">Prezzo/pz</th>
                        <th className="text-right px-3 py-2">Totale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewResult.subjects.map((s, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 font-medium">{s.name}{s.rotated ? " (ruotato)" : ""}</td>
                          <td className="px-3 py-1.5 text-gray-500">{s.effectiveWidth}×{s.effectiveHeight} cm</td>
                          <td className="px-3 py-1.5 text-right">{s.columns}</td>
                          <td className="px-3 py-1.5 text-right">{s.quantity}</td>
                          <td className="px-3 py-1.5 text-right">{formatCurrency(s.pricePerPiece)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(s.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Prezzo/m:</span><span>{formatCurrency(previewResult.pricePerMeter)}/m</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Metri rullo:</span><span>{previewResult.totalRollMeters.toFixed(2)} m</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Stampa:</span><span>{formatCurrency(previewResult.totalPrintPrice)}</span></div>
                  {previewCut && <div className="flex justify-between"><span className="text-gray-500">Taglio:</span><span>{formatCurrency(previewResult.cutPrice)}</span></div>}
                  {previewShipping && <div className="flex justify-between"><span className="text-gray-500">Spedizione:</span><span>{previewResult.shippingPrice === 0 ? "Gratuita" : formatCurrency(previewResult.shippingPrice)}</span></div>}
                  <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2">
                    <span>Totale</span>
                    <span className="text-blue-600">{formatCurrency(previewResult.grandTotal)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
