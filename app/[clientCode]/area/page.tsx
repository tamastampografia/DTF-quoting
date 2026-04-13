"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ClientArea from "@/components/ClientArea";
import QuotingApp from "@/components/QuotingApp";
import type { QuoteRow } from "@/lib/quotes";
import type { ClientPricing } from "@/lib/nesting";

interface ClientInfo {
  code: string;
  name: string;
  pricing_type: "standard" | "fixed" | "discount";
  pricing_value: number;
}

export default function AreaPage() {
  const params = useParams();
  const router = useRouter();
  const clientCode = (params.clientCode as string).toUpperCase();

  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [loadedQuote, setLoadedQuote] = useState<QuoteRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/client?code=${clientCode}`)
      .then(r => r.json())
      .then(data => {
        if (!data.client) {
          // Unknown code — redirect to homepage
          router.replace("/");
          return;
        }
        setClientInfo(data.client);
      })
      .catch(() => router.replace("/"))
      .finally(() => setLoading(false));
  }, [clientCode, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Caricamento…</p>
      </div>
    );
  }

  if (!clientInfo) return null;

  const pricing: ClientPricing = {
    type: clientInfo.pricing_type,
    value: clientInfo.pricing_value,
  };

  // If a saved quote was selected to be converted to an order,
  // show QuotingApp pre-loaded at step 2 with all data from the quote
  if (loadedQuote) {
    return (
      <QuotingApp
        clientCode={clientCode}
        clientName={clientInfo.name}
        pricing={pricing}
        preloadedQuote={loadedQuote}
        onBackToArea={() => setLoadedQuote(null)}
      />
    );
  }

  return (
    <ClientArea
      clientCode={clientCode}
      clientName={clientInfo.name}
      onLoadQuote={setLoadedQuote}
    />
  );
}
