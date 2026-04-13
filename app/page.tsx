"use client";

import React, { useState } from "react";
import QuotingApp from "@/components/QuotingApp";
import type { ClientPricing } from "@/lib/nesting";

interface ClientSession {
  code: string;
  name: string;
  pricing_type: "standard" | "fixed" | "discount";
  pricing_value: number;
}

export default function HomePage() {
  const [client, setClient] = useState<ClientSession | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Credenziali non valide");
        return;
      }
      setClient(data.client);
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setClient(null);
    setUsername("");
    setPassword("");
    setError("");
  };

  if (client) {
    const pricing: ClientPricing = {
      type: client.pricing_type,
      value: client.pricing_value,
    };
    return (
      <QuotingApp
        clientCode={client.code}
        clientName={client.name}
        pricing={pricing}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">STAMPOO</h1>
          <p className="text-sm text-gray-500 mt-1">Transfer DTF — Area clienti</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome utente</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nome utente"
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 text-sm"
          >
            {loading ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>
        <p className="text-xs text-gray-400 text-center mt-6">TAMAS SRL — Via Arzignano 10, 36070 Trissino (VI)</p>
      </div>
    </div>
  );
}
