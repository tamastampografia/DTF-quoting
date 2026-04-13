import type { NestingResult, SubjectInput, ClientPricing } from "./nesting";

export type QuoteStatus = "draft" | "ordered";

export interface QuotePayload {
  clientCode: string;
  clientName?: string;
  pricing: ClientPricing;
  subjects: SubjectInput[];
  quote: NestingResult;
  includeCut: boolean;
  includeShipping: boolean;
  isIslands: boolean;
  createdAt: string;
}

export interface QuoteRow {
  id: string;
  created_at: string;
  updated_at: string;
  client_code: string;
  status: QuoteStatus;
  payload: QuotePayload;
}

/**
 * SQL to run in Supabase SQL Editor:
 *
 * CREATE TABLE quotes (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   created_at TIMESTAMPTZ DEFAULT NOW(),
 *   updated_at TIMESTAMPTZ DEFAULT NOW(),
 *   client_code TEXT NOT NULL,
 *   status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ordered')),
 *   payload JSONB NOT NULL
 * );
 * CREATE INDEX idx_quotes_client_code ON quotes (client_code);
 * CREATE INDEX idx_quotes_created_at ON quotes (created_at DESC);
 */
