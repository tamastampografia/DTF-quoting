import type { NestingResult, SubjectInput, ClientPricing } from "./nesting";

export interface OrderSubjectFile {
  name: string;
  type: string;
  size: number;
}

export interface OrderPayload {
  companyName: string;
  clientCode?: string;
  clientName?: string;
  pricing: ClientPricing;
  subjects: SubjectInput[];
  files: OrderSubjectFile[];
  quote: NestingResult;
  includeCut: boolean;
  includeShipping: boolean;
  isIslands: boolean;
  createdAt: string;
}
