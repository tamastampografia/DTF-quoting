import { NextRequest, NextResponse } from "next/server";
import { calculateNesting } from "@/lib/nesting";
import type { ClientPricing, SubjectInput } from "@/lib/nesting";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subjects, pricing, includeCut, includeShipping, isIslands } = body as {
      subjects: SubjectInput[];
      pricing: ClientPricing;
      includeCut: boolean;
      includeShipping: boolean;
      isIslands: boolean;
    };

    const result = calculateNesting(subjects, pricing, includeCut, includeShipping, isIslands);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
