import QuotingApp from "@/components/QuotingApp";
import type { ClientPricing } from "@/lib/nesting";

interface Props {
  params: Promise<{ clientCode: string }>;
}

async function fetchClient(code: string) {
  try {
    const { getServiceClient } = await import("@/lib/supabase-service");
    const supabase = getServiceClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("clients")
      .select("id, code, name, email, pricing_type, pricing_value")
      .eq("code", code.toUpperCase())
      .single();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export default async function ClientPage({ params }: Props) {
  const { clientCode } = await params;
  const client = await fetchClient(clientCode);

  const pricing: ClientPricing = client
    ? { type: client.pricing_type as ClientPricing["type"], value: client.pricing_value }
    : { type: "standard", value: 0 };

  return (
    <QuotingApp
      clientCode={client ? client.code : undefined}
      clientName={client ? client.name : undefined}
      pricing={pricing}
    />
  );
}
