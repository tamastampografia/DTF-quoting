// ─── Types ───────────────────────────────────────────────────────────────────

export type SubjectType = "single" | "precomposed";

export interface SubjectInput {
  name: string;
  width: number;    // cm
  height: number;   // cm
  quantity: number;
  type: SubjectType;
}

export interface ClientPricing {
  type: "standard" | "fixed" | "discount";
  value: number;
}

export interface SubjectResult {
  name: string;
  width: number;
  height: number;
  quantity: number;
  type: SubjectType;
  portraitColumns: number;
  landscapeColumns: number;
  columns: number;
  rollLength: number;    // meters — this subject's section only
  pricePerPiece: number;
  totalPrice: number;
}

export interface NestingResult {
  subjects: SubjectResult[];
  totalRollMeters: number;
  pricePerMeter: number;
  totalPrintPrice: number;
  cutPrice: number;
  shippingPrice: number;
  grandTotal: number;
  svgPreviewData: SVGColumnData[];
  subjectSectionStarts: number[]; // cm from top where each subject's section begins
}

export interface SVGColumnData {
  subjectName: string;
  subjectIndex: number;
  x: number;           // cm from left edge of roll
  colWidth: number;    // cm
  orientation: "portrait" | "landscape";
  segments: SVGSegment[];
}

export interface SVGSegment {
  y: number;      // cm from top of roll
  height: number; // cm — piece height in this orientation
  count: number;  // number of rows in this column
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const ROLL_WIDTH_CM = 57;
export const ROLL_MAX_LENGTH_CM = 300;    // visual section boundary every 300 cm
export const GAP_CM = 1;                  // gap between pieces (0.5 cm per side)
export const INTER_SUBJECT_GAP_CM = 10;  // gap between subject sections on the roll
export const MIN_ROLL_METERS = 0.5;
export const CUT_PRICE_PER_PIECE = 0.10;
export const SHIPPING_PRICE = 10.00;
export const SHIPPING_ISLANDS_PRICE = 15.00;
export const FREE_SHIPPING_THRESHOLD = 200.00;

// ─── Pricing tiers ───────────────────────────────────────────────────────────

export const STANDARD_TIERS: Array<{ minMeters: number; maxMeters: number | null; pricePerMeter: number }> = [
  { minMeters: 0,   maxMeters: 0.5,  pricePerMeter: 20.00 },
  { minMeters: 0.5, maxMeters: 1,    pricePerMeter: 12.00 },
  { minMeters: 1,   maxMeters: 2,    pricePerMeter: 11.50 },
  { minMeters: 2,   maxMeters: 4,    pricePerMeter: 11.00 },
  { minMeters: 4,   maxMeters: 10,   pricePerMeter: 11.00 },
  { minMeters: 10,  maxMeters: 25,   pricePerMeter: 10.50 },
  { minMeters: 25,  maxMeters: 50,   pricePerMeter: 10.00 },
  { minMeters: 50,  maxMeters: 100,  pricePerMeter: 9.00  },
  { minMeters: 100, maxMeters: null, pricePerMeter: 8.50  },
];

export function getStandardPricePerMeter(meters: number): number {
  if (meters <= 0.5) return 20.00;
  if (meters <= 1)   return 12.00;
  if (meters <= 3)   return 11.50;
  if (meters <= 9)   return 11.00;
  if (meters <= 24)  return 10.50;
  if (meters <= 49)  return 10.00;
  if (meters <= 99)  return 9.00;
  return 8.50;
}

export function getPricePerMeter(meters: number, pricing: ClientPricing): number {
  const standard = getStandardPricePerMeter(meters);
  if (pricing.type === "fixed")    return pricing.value;
  if (pricing.type === "discount") return standard * (1 - pricing.value / 100);
  return standard;
}

// ─── Single-subject section layout ───────────────────────────────────────────

interface SectionLayout {
  portraitCols: number;
  landscapeCols: number;
  rowsPortrait: number;   // rows per portrait column
  rowsLandscape: number;  // rows per landscape column
  sectionHeightCm: number;
}

/**
 * For a logo of W×H cm printed Q times, find the column mix
 * (portrait and/or landscape) that minimises total section height
 * while fitting within ROLL_WIDTH_CM.
 *
 * Portrait column : W cm wide, piece height = H cm.
 * Landscape column: H cm wide, piece height = W cm.
 */
function nestSingleSubject(W: number, H: number, Q: number): SectionLayout {
  let best: SectionLayout | null = null;

  // Landscape only helps when logo is not square and H fits in roll width.
  const canLandscape = Math.abs(H - W) > 0.01 && H + GAP_CM <= ROLL_WIDTH_CM + 0.001;

  const portraitColW  = W + GAP_CM;
  const landscapeColW = H + GAP_CM;
  const maxNp = portraitColW <= ROLL_WIDTH_CM
    ? Math.floor(ROLL_WIDTH_CM / portraitColW)
    : 0;

  for (let np = 0; np <= maxNp; np++) {
    const usedW      = np * portraitColW;
    const remainingW = ROLL_WIDTH_CM - usedW;
    const maxNl      = canLandscape && landscapeColW <= remainingW + 0.001
      ? Math.floor((remainingW + 0.001) / landscapeColW)
      : 0;

    for (let nl = 0; nl <= maxNl; nl++) {
      if (np === 0 && nl === 0) continue;

      let rowsP = 0, rowsL = 0, sectionH: number;

      if (np === 0) {
        // All landscape
        rowsL    = Math.ceil(Q / nl);
        sectionH = rowsL * (W + GAP_CM); // landscape piece height = original W
      } else if (nl === 0) {
        // All portrait
        rowsP    = Math.ceil(Q / np);
        sectionH = rowsP * (H + GAP_CM);
      } else {
        // Mixed: iterate rowsP to find the split that minimises section height
        const maxRowsP = Math.ceil(Q / np);
        let bestH = Infinity;
        for (let rp = 0; rp <= maxRowsP; rp++) {
          const piecesPortrait  = rp * np;
          const piecesRemaining = Q - piecesPortrait;
          const rl = piecesRemaining <= 0 ? 0 : Math.ceil(piecesRemaining / nl);
          if (piecesPortrait + rl * nl < Q) continue; // all Q must be covered
          const h = Math.max(rp * (H + GAP_CM), rl * (W + GAP_CM));
          if (h < bestH) { bestH = h; rowsP = rp; rowsL = rl; }
        }
        sectionH = bestH;
      }

      if (best === null || sectionH < best.sectionHeightCm) {
        best = { portraitCols: np, landscapeCols: nl, rowsPortrait: rowsP, rowsLandscape: rowsL, sectionHeightCm: sectionH };
      }
    }
  }

  // Fallback — should not be reached if W ≤ ROLL_WIDTH_CM
  if (!best) {
    const rp = Math.ceil(Q / 1);
    return { portraitCols: 1, landscapeCols: 0, rowsPortrait: rp, rowsLandscape: 0, sectionHeightCm: rp * (H + GAP_CM) };
  }

  return best;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function calculateNesting(
  inputs: SubjectInput[],
  pricing: ClientPricing,
  includeCut: boolean,
  includeShipping: boolean,
  isIslands: boolean = false
): NestingResult {
  const empty: NestingResult = {
    subjects: [], totalRollMeters: 0, pricePerMeter: 0,
    totalPrintPrice: 0, cutPrice: 0, shippingPrice: 0, grandTotal: 0,
    svgPreviewData: [], subjectSectionStarts: [],
  };
  if (inputs.length === 0) return empty;

  // 1. Find optimal column layout for each subject independently
  const sections: SectionLayout[] = inputs.map(inp =>
    nestSingleSubject(inp.width, inp.height, inp.quantity)
  );

  // 2. Total roll length = Σ section heights + 10 cm gap between each pair
  const totalSectionHeightCm = sections.reduce((s, sec) => s + sec.sectionHeightCm, 0);
  const gapTotalCm            = (inputs.length - 1) * INTER_SUBJECT_GAP_CM;
  const totalLengthCm         = totalSectionHeightCm + gapTotalCm;

  // Round up to nearest 0.5 m, enforce minimum
  const rawMeters       = totalLengthCm / 100;
  const clampedMeters   = Math.max(MIN_ROLL_METERS, rawMeters);
  const totalRollMeters = Math.ceil(clampedMeters / 0.5) * 0.5;

  const pricePerMeter = getPricePerMeter(totalRollMeters, pricing);

  // 3. Distribute cost proportionally by section height
  const subjects: SubjectResult[] = inputs.map((inp, i) => {
    const section    = sections[i];
    const proportion = totalSectionHeightCm > 0
      ? section.sectionHeightCm / totalSectionHeightCm
      : 1 / inputs.length;
    const subjectRollMeters = proportion * totalRollMeters;
    const totalPrice        = subjectRollMeters * pricePerMeter;
    const pricePerPiece     = inp.quantity > 0 ? totalPrice / inp.quantity : 0;

    return {
      name: inp.name,
      width: inp.width,
      height: inp.height,
      quantity: inp.quantity,
      type: inp.type,
      portraitColumns: section.portraitCols,
      landscapeColumns: section.landscapeCols,
      columns: section.portraitCols + section.landscapeCols,
      rollLength: section.sectionHeightCm / 100,
      pricePerPiece,
      totalPrice,
    };
  });

  const totalPrintPrice = subjects.reduce((sum, s) => sum + s.totalPrice, 0);

  // Cut applies only to "single" subjects (precomposed files cannot be cut individually)
  const cutPrice = includeCut
    ? inputs
        .filter(inp => inp.type === "single")
        .reduce((sum, inp) => sum + inp.quantity * CUT_PRICE_PER_PIECE, 0)
    : 0;

  let shippingPrice = 0;
  if (includeShipping) {
    const base = totalPrintPrice + cutPrice;
    shippingPrice = base >= FREE_SHIPPING_THRESHOLD
      ? 0
      : isIslands ? SHIPPING_ISLANDS_PRICE : SHIPPING_PRICE;
  }

  const grandTotal = totalPrintPrice + cutPrice + shippingPrice;

  // 4. Build SVG preview data
  const { svgPreviewData, subjectSectionStarts } = buildSVGPreviewData(inputs, sections);

  return {
    subjects,
    totalRollMeters,
    pricePerMeter,
    totalPrintPrice,
    cutPrice,
    shippingPrice,
    grandTotal,
    svgPreviewData,
    subjectSectionStarts,
  };
}

// ─── SVG preview builder ──────────────────────────────────────────────────────

function buildSVGPreviewData(
  inputs: SubjectInput[],
  sections: SectionLayout[]
): { svgPreviewData: SVGColumnData[]; subjectSectionStarts: number[] } {
  const svgPreviewData: SVGColumnData[]  = [];
  const subjectSectionStarts: number[]   = [];
  let yCm = 0;

  for (let si = 0; si < inputs.length; si++) {
    const inp    = inputs[si];
    const layout = sections[si];
    const W      = inp.width;
    const H      = inp.height;

    subjectSectionStarts.push(yCm);
    let xCm = 0;

    // Portrait columns
    for (let ci = 0; ci < layout.portraitCols; ci++) {
      svgPreviewData.push({
        subjectName: inp.name,
        subjectIndex: si,
        x: xCm,
        colWidth: W,
        orientation: "portrait",
        segments: [{ y: yCm, height: H, count: layout.rowsPortrait }],
      });
      xCm += W + GAP_CM;
    }

    // Landscape columns (column width = H, piece height = W)
    for (let ci = 0; ci < layout.landscapeCols; ci++) {
      svgPreviewData.push({
        subjectName: inp.name,
        subjectIndex: si,
        x: xCm,
        colWidth: H,
        orientation: "landscape",
        segments: [{ y: yCm, height: W, count: layout.rowsLandscape }],
      });
      xCm += H + GAP_CM;
    }

    yCm += layout.sectionHeightCm;

    // Add inter-subject gap (not after the last subject)
    if (si < inputs.length - 1) {
      yCm += INTER_SUBJECT_GAP_CM;
    }
  }

  return { svgPreviewData, subjectSectionStarts };
}
