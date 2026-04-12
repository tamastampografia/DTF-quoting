import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Guard against placeholder values that would cause runtime errors
const isConfigured =
  supabaseUrl.startsWith("https://") && supabaseAnonKey.length > 10;

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type ClientRow = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  pricing_type: "standard" | "fixed" | "discount";
  pricing_value: number;
  created_at: string;
};
