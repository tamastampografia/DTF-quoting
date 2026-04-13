// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubjectInput {
  name: string;
  width: number;   // cm
  height: number;  // cm
  quantity: number;
}

export interface ClientPricing {
  type: "standard" | "fixed" | "discount";
  value: number; // fixed $/m or discount %
}

export interface SubjectResult {
  name: string;
  width: number;
  height: number;
  quantity: number;
  rotated: boolean;
  effectiveWidth: number;
  effectiveHeight: number;
  columns: number;
  rollLength: number;    // meters of roll used by this subject
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
}

export interface SVGColumnData {
  subjectName: string;
  subjectIndex: number;
  x: number;        // px from left of roll
  colWidth: number; // cm
  segments: SVGSegment[];
}

export interface SVGSegment {
  y: number;     // cm from top
  height: number; // cm
  count: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const ROLL_WIDTH_CM = 58;
export const GAP_CM = 1; // 0.5 per side
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
  { minMeters: 2,   maxMeters: 4,    pricePerMeter: 11.00 },  // 2-3m
  { minMeters: 4,   maxMeters: 10,   pricePerMeter: 11.00 },  // 4-9m
  { minMeters: 10,  maxMeters: 25,   pricePerMeter: 10.50 }, // 10-24m
  { minMeters: 25,  maxMeters: 50,   pricePerMeter: 10.00 }, // 25-49m
  { minMeters: 50,  maxMeters: 100,  pricePerMeter: 9.00 },  // 50-99m
  { minMeters: 100, maxMeters: null, pricePerMeter: 8.50 },  // 100+m
];

// Tier table as per spec (bracket applies to entire order)
const PRICE_BRACKETS = [
  { upTo: 0.5,  price: 20.00 },
  { upTo: 1,    price: 12.00 },
  { upTo: 2,    price: 11.50 }, // 1-2
  { upTo: 4,    price: 11.00 }, // 2-3 → use 4 as cutoff (spec says 2-3m €11.50, 4-9m €11.00)
  { upTo: 10,   price: 11.00 }, // 4-9
  { upTo: 25,   price: 10.50 }, // 10-24
  { upTo: 50,   price: 10.00 }, // 25-49
  { upTo: 100,  price: 9.00 },  // 50-99
  { upTo: Infinity, price: 8.50 }, // 100+
];

// Correct tier lookup matching the spec exactly
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
  if (pricing.type === "fixed") return pricing.value;
  if (pricing.type === "discount") return standard * (1 - pricing.value / 100);
  return standard;
}

// ─── Nesting algorithm ───────────────────────────────────────────────────────

interface SubjectOriented {
  index: number;
  name: string;
  quantity: number;
  effectiveWidth: number;
  effectiveHeight: number;
  rotated: boolean;
}

function colWidthFor(ew: number): number {
  return ew + GAP_CM;
}

// For a given ordered list of column widths (one per column slot),
// return total roll length in cm and per-subject roll usage (cm)
function computeRollLength(
  subjects: SubjectOriented[],
  colAssignments: number[][] // colAssignments[subjectIdx] = array of column indices assigned
): { rollLengthCm: number; subjectLengthsCm: number[] } {
  // Each column accumulates height from subjects assigned to it
  // We need to figure out total column height
  // For each column, compute the stacked height
  const columnHeights: Map<number, number> = new Map();

  subjects.forEach((s, si) => {
    const cols = colAssignments[si];
    if (!cols || cols.length === 0) return;
    const numCols = cols.length;
    const rowsPerCol = Math.ceil(s.quantity / numCols);
    const colHeight = rowsPerCol * (s.effectiveHeight + GAP_CM);
    cols.forEach(ci => {
      columnHeights.set(ci, (columnHeights.get(ci) ?? 0) + colHeight);
    });
  });

  const rollLengthCm = Math.max(0, ...Array.from(columnHeights.values()));

  // Per-subject contribution: proportion of their column slots height vs total
  const subjectLengthsCm = subjects.map((s, si) => {
    const cols = colAssignments[si];
    if (!cols || cols.length === 0) return 0;
    const numCols = cols.length;
    const rowsPerCol = Math.ceil(s.quantity / numCols);
    return numCols * rowsPerCol * (s.effectiveHeight + GAP_CM);
  });

  return { rollLengthCm, subjectLengthsCm };
}

// Try a specific orientation combo and find best column layout
function tryOrientations(
  subjects: SubjectOriented[],
): { rollLengthCm: number; subjectLengthsCm: number[]; colAssignments: number[][]; totalColWidthCm: number } | null {
  // Group subjects by effective column width
  const widthGroups: Map<number, number[]> = new Map();
  subjects.forEach((s, i) => {
    const cw = colWidthFor(s.effectiveWidth);
    if (!widthGroups.has(cw)) widthGroups.set(cw, []);
    widthGroups.get(cw)!.push(i);
  });

  const groupKeys = Array.from(widthGroups.keys());
  const n = groupKeys.length;

  // For each group, try 1..N columns where total fits in roll
  // Enumerate via recursion
  let best: { rollLengthCm: number; subjectLengthsCm: number[]; colAssignments: number[][]; totalColWidthCm: number } | null = null;

  function enumerate(gi: number, usedWidth: number, colCounts: number[], nextColIdx: number) {
    if (gi === n) {
      // Build colAssignments
      const colAssignments: number[][] = subjects.map(() => []);
      let ci = 0;
      groupKeys.forEach((cw, gIdx) => {
        const subjectIndices = widthGroups.get(cw)!;
        const numCols = colCounts[gIdx];
        const assignedCols = Array.from({ length: numCols }, (_, j) => ci + j);
        ci += numCols;
        // Distribute subjects of this group across the assigned columns
        subjectIndices.forEach(si => {
          colAssignments[si] = assignedCols;
        });
      });

      const { rollLengthCm, subjectLengthsCm } = computeRollLength(subjects, colAssignments);
      if (best === null || rollLengthCm < best.rollLengthCm) {
        best = { rollLengthCm, subjectLengthsCm, colAssignments, totalColWidthCm: usedWidth };
      }
      return;
    }

    const cw = groupKeys[gi];
    const maxCols = Math.floor((ROLL_WIDTH_CM - usedWidth) / cw);
    if (maxCols < 1) return; // doesn't fit

    for (let nc = 1; nc <= maxCols; nc++) {
      colCounts[gi] = nc;
      enumerate(gi + 1, usedWidth + nc * cw, colCounts, nextColIdx + nc);
    }
  }

  enumerate(0, 0, new Array(n).fill(1), 0);
  return best;
}

export function calculateNesting(
  inputs: SubjectInput[],
  pricing: ClientPricing,
  includeCut: boolean,
  includeShipping: boolean,
  isIslands: boolean = false
): NestingResult {
  if (inputs.length === 0) {
    return {
      subjects: [],
      totalRollMeters: 0,
      pricePerMeter: 0,
      totalPrintPrice: 0,
      cutPrice: 0,
      shippingPrice: 0,
      grandTotal: 0,
      svgPreviewData: [],
    };
  }

  const n = inputs.length;
  // Try all 2^n orientation combinations
  const totalCombos = 1 << n;
  let bestResult: {
    rollLengthCm: number;
    subjectLengthsCm: number[];
    colAssignments: number[][];
    oriented: SubjectOriented[];
  } | null = null;

  for (let mask = 0; mask < totalCombos; mask++) {
    const oriented: SubjectOriented[] = inputs.map((inp, i) => {
      const rotated = !!(mask & (1 << i));
      return {
        index: i,
        name: inp.name,
        quantity: inp.quantity,
        effectiveWidth: rotated ? inp.height : inp.width,
        effectiveHeight: rotated ? inp.width : inp.height,
        rotated,
      };
    });

    // Check if all subjects fit at minimum 1 column each
    const minWidth = oriented.reduce((sum, s) => sum + colWidthFor(s.effectiveWidth), 0);
    if (minWidth > ROLL_WIDTH_CM) continue;

    const result = tryOrientations(oriented);
    if (!result) continue;

    if (bestResult === null || result.rollLengthCm < bestResult.rollLengthCm) {
      bestResult = {
        rollLengthCm: result.rollLengthCm,
        subjectLengthsCm: result.subjectLengthsCm,
        colAssignments: result.colAssignments,
        oriented,
      };
    }
  }

  if (!bestResult) {
    // Fallback: each subject in a single column, no rotation, stacked vertically
    const oriented = inputs.map((inp, i) => ({
      index: i, name: inp.name, quantity: inp.quantity,
      effectiveWidth: inp.width, effectiveHeight: inp.height, rotated: false,
    }));
    const colAssignments = oriented.map((_, i) => [i]);
    const { rollLengthCm, subjectLengthsCm } = computeRollLength(oriented, colAssignments);
    bestResult = { rollLengthCm, subjectLengthsCm, colAssignments, oriented };
  }

  // Convert cm to meters, apply minimum, then round up to nearest 0.5m if > 1m
  const rawMeters = bestResult.rollLengthCm / 100;
  const clampedMeters = Math.max(MIN_ROLL_METERS, rawMeters);
  const totalRollMeters = clampedMeters > 1.0
    ? Math.ceil(clampedMeters / 0.5) * 0.5
    : clampedMeters;

  const pricePerMeter = getPricePerMeter(totalRollMeters, pricing);
  const totalArea = bestResult.subjectLengthsCm.reduce((a, b) => a + b, 0);

  // Build subjects results
  const subjects: SubjectResult[] = bestResult.oriented.map((s, i) => {
    const proportion = totalArea > 0 ? bestResult!.subjectLengthsCm[i] / totalArea : 1 / n;
    const subjectRollMeters = proportion * totalRollMeters;
    const totalPrice = subjectRollMeters * pricePerMeter;
    const pricePerPiece = s.quantity > 0 ? totalPrice / s.quantity : 0;
    const numCols = bestResult!.colAssignments[i]?.length ?? 1;
    const rowsPerCol = Math.ceil(s.quantity / numCols);
    const rollLengthM = (rowsPerCol * numCols * (s.effectiveHeight + GAP_CM)) / 100;

    return {
      name: s.name,
      width: inputs[i].width,
      height: inputs[i].height,
      quantity: s.quantity,
      rotated: s.rotated,
      effectiveWidth: s.effectiveWidth,
      effectiveHeight: s.effectiveHeight,
      columns: numCols,
      rollLength: rollLengthM,
      pricePerPiece,
      totalPrice,
    };
  });

  const totalPrintPrice = subjects.reduce((sum, s) => sum + s.totalPrice, 0);
  const cutPrice = includeCut ? inputs.reduce((sum, inp) => sum + inp.quantity * CUT_PRICE_PER_PIECE, 0) : 0;

  let shippingPrice = 0;
  if (includeShipping) {
    const baseForShipping = totalPrintPrice + cutPrice;
    if (baseForShipping >= FREE_SHIPPING_THRESHOLD) {
      shippingPrice = 0;
    } else {
      shippingPrice = isIslands ? SHIPPING_ISLANDS_PRICE : SHIPPING_PRICE;
    }
  }

  const grandTotal = totalPrintPrice + cutPrice + shippingPrice;

  // Build SVG preview data
  const svgPreviewData = buildSVGPreviewData(bestResult.oriented, bestResult.colAssignments);

  return {
    subjects,
    totalRollMeters,
    pricePerMeter,
    totalPrintPrice,
    cutPrice,
    shippingPrice,
    grandTotal,
    svgPreviewData,
  };
}

// ─── SVG Preview data builder ─────────────────────────────────────────────────

function buildSVGPreviewData(
  oriented: SubjectOriented[],
  colAssignments: number[][]
): SVGColumnData[] {
  // Build a map: colIdx -> list of (subjectIdx, effectiveWidth, effectiveHeight, quantity)
  const colMap: Map<number, { si: number; s: SubjectOriented }[]> = new Map();
  oriented.forEach((s, si) => {
    colAssignments[si]?.forEach(ci => {
      if (!colMap.has(ci)) colMap.set(ci, []);
      colMap.get(ci)!.push({ si, s });
    });
  });

  // Sort columns
  const sortedCols = Array.from(colMap.entries()).sort((a, b) => a[0] - b[0]);

  // Compute x positions
  const result: SVGColumnData[] = [];
  let xCm = 0;

  sortedCols.forEach(([ci, entries]) => {
    // All entries in same column have same width (by design)
    const colWidth = entries[0].s.effectiveWidth;
    const colWidthWithGap = colWidth + GAP_CM;

    // Stack segments vertically
    let yCm = 0;
    entries.forEach(({ si, s }) => {
      const numCols = colAssignments[si]?.length ?? 1;
      const rowsPerCol = Math.ceil(s.quantity / numCols);

      const existingCol = result.find(c => c.subjectIndex === si && c.x === xCm);
      if (!existingCol) {
        result.push({
          subjectName: s.name,
          subjectIndex: si,
          x: xCm,
          colWidth: colWidth,
          segments: [{
            y: yCm,
            height: s.effectiveHeight,
            count: rowsPerCol,
          }],
        });
      } else {
        existingCol.segments.push({
          y: yCm,
          height: s.effectiveHeight,
          count: rowsPerCol,
        });
      }
      yCm += rowsPerCol * (s.effectiveHeight + GAP_CM);
    });

    xCm += colWidthWithGap;
  });

  return result;
}
