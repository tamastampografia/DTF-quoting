/**
 * Client-side file proportion extractor.
 * Reads width/height from file headers/metadata without uploading to server.
 */

export interface FileProportions {
  ratio: number;         // width / height
  widthCm?: number;      // absolute dimension if available
  heightCm?: number;     // absolute dimension if available
  /** absolute: exact cm from file | proportional: pixel ratio | raster: pixel-only, not reliable for print | none: no data */
  source: "absolute" | "proportional" | "raster" | "none";
}

const POINTS_TO_CM = 0.0352778; // 1pt = 0.3528mm = 0.03528cm

// ─── Main entry point ────────────────────────────────────────────────────────

export async function extractProportions(file: File): Promise<FileProportions> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type.toLowerCase();

  try {
    if (ext === "pdf" || mime === "application/pdf") {
      return await extractFromPdf(file);
    }
    if (ext === "svg" || mime === "image/svg+xml") {
      return await extractFromSvg(file);
    }
    if (ext === "ai") {
      // Try PDF-header approach first
      return await extractFromPdf(file);
    }
    if (ext === "eps") {
      return await extractFromEps(file);
    }
    // Raster formats: pixel dimensions are NOT reliable for print sizing.
    // Return "raster" so the UI can warn the user to enter dimensions manually.
    if (
      ext === "png" || mime === "image/png" ||
      ext === "jpg" || ext === "jpeg" || mime === "image/jpeg" ||
      ext === "tif" || ext === "tiff" || mime === "image/tiff" ||
      ext === "psd" ||
      ext === "bmp" || mime === "image/bmp"
    ) {
      return { ratio: 1, source: "raster" };
    }
    // CDR and unknowns: no extraction
    return { ratio: 1, source: "none" };
  } catch {
    // Never throw — silently fall back to manual entry
    return { ratio: 1, source: "none" };
  }
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

async function extractFromPdf(file: File): Promise<FileProportions> {
  const { PDFDocument } = await import("pdf-lib");
  const buf = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const page = pdfDoc.getPage(0);
  const { width, height } = page.getSize(); // in points
  if (!width || !height || width <= 0 || height <= 0) {
    return { ratio: 1, source: "none" };
  }
  const widthCm = parseFloat((width * POINTS_TO_CM).toFixed(1));
  const heightCm = parseFloat((height * POINTS_TO_CM).toFixed(1));
  return {
    ratio: width / height,
    widthCm,
    heightCm,
    source: "absolute",
  };
}

// ─── SVG ─────────────────────────────────────────────────────────────────────

async function extractFromSvg(file: File): Promise<FileProportions> {
  const text = await readAsText(file);
  // Try viewBox first
  const viewBoxMatch = text.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
      const ratio = parts[2] / parts[3];
      // Try to get absolute dims from width/height attrs
      const dims = parseSvgDimensions(text);
      if (dims) {
        return { ratio, widthCm: dims.widthCm, heightCm: dims.heightCm, source: "absolute" };
      }
      return { ratio, source: "proportional" };
    }
  }
  // Fall back to width/height attributes
  const dims = parseSvgDimensions(text);
  if (dims) {
    return { ratio: dims.widthCm / dims.heightCm, widthCm: dims.widthCm, heightCm: dims.heightCm, source: "absolute" };
  }
  return { ratio: 1, source: "none" };
}

function parseSvgDimensions(text: string): { widthCm: number; heightCm: number } | null {
  // Match width/height on the svg element only (not nested)
  const svgTag = text.match(/<svg[^>]*>/i)?.[0] ?? "";
  const wMatch = svgTag.match(/\bwidth\s*=\s*["']([^"']+)["']/i);
  const hMatch = svgTag.match(/\bheight\s*=\s*["']([^"']+)["']/i);
  if (!wMatch || !hMatch) return null;
  const wCm = parseCssLength(wMatch[1]);
  const hCm = parseCssLength(hMatch[1]);
  if (!wCm || !hCm) return null;
  return { widthCm: parseFloat(wCm.toFixed(1)), heightCm: parseFloat(hCm.toFixed(1)) };
}

function parseCssLength(val: string): number | null {
  const num = parseFloat(val);
  if (isNaN(num) || num <= 0) return null;
  if (val.endsWith("mm")) return num / 10;
  if (val.endsWith("cm")) return num;
  if (val.endsWith("in")) return num * 2.54;
  if (val.endsWith("pt")) return num * POINTS_TO_CM;
  if (val.endsWith("px")) return null; // px unreliable
  // bare number with no unit = px in SVG
  return null;
}

// ─── EPS ─────────────────────────────────────────────────────────────────────

async function extractFromEps(file: File): Promise<FileProportions> {
  // Only read first 4KB — BoundingBox is always near the top
  const slice = file.slice(0, 4096);
  const text = await readAsText(slice);
  const bbMatch = text.match(/%%BoundingBox:\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/i);
  if (!bbMatch) return { ratio: 1, source: "none" };
  const x1 = parseFloat(bbMatch[1]);
  const y1 = parseFloat(bbMatch[2]);
  const x2 = parseFloat(bbMatch[3]);
  const y2 = parseFloat(bbMatch[4]);
  const wPts = x2 - x1;
  const hPts = y2 - y1;
  if (wPts <= 0 || hPts <= 0) return { ratio: 1, source: "none" };
  const widthCm = parseFloat((wPts * POINTS_TO_CM).toFixed(1));
  const heightCm = parseFloat((hPts * POINTS_TO_CM).toFixed(1));
  return { ratio: wPts / hPts, widthCm, heightCm, source: "absolute" };
}

// ─── PNG ─────────────────────────────────────────────────────────────────────

async function extractFromPng(file: File): Promise<FileProportions> {
  // PNG signature: 8 bytes, then IHDR chunk (4 bytes length, 4 bytes "IHDR", 4 bytes width, 4 bytes height)
  const buf = await readSlice(file, 24);
  const view = new DataView(buf);
  // PNG signature is 8 bytes, then chunk length (4), then "IHDR" (4), then width (4), then height (4)
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== sig[i]) return { ratio: 1, source: "none" };
  }
  const w = view.getUint32(16, false); // big-endian
  const h = view.getUint32(20, false);
  if (!w || !h) return { ratio: 1, source: "none" };
  return { ratio: w / h, source: "proportional" };
}

// ─── JPEG ─────────────────────────────────────────────────────────────────────

async function extractFromJpg(file: File): Promise<FileProportions> {
  // Read enough bytes to find SOF0/SOF1/SOF2 marker
  const buf = await readSlice(file, Math.min(file.size, 65536));
  const view = new DataView(buf);
  let offset = 2; // skip FF D8

  while (offset < view.byteLength - 4) {
    if (view.getUint8(offset) !== 0xFF) break;
    const marker = view.getUint8(offset + 1);
    // SOF markers: 0xC0–0xC3, 0xC5–0xC7, 0xC9–0xCB, 0xCD–0xCF
    if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7)) {
      // SOF: length(2) + precision(1) + height(2) + width(2)
      if (offset + 9 < view.byteLength) {
        const h = view.getUint16(offset + 5, false);
        const w = view.getUint16(offset + 7, false);
        if (w > 0 && h > 0) return { ratio: w / h, source: "proportional" };
      }
    }
    // Skip this segment
    if (marker === 0xD9 || marker === 0xD8 || marker === 0xDA) break;
    const segLen = view.getUint16(offset + 2, false);
    offset += 2 + segLen;
  }
  return { ratio: 1, source: "none" };
}

// ─── TIFF ─────────────────────────────────────────────────────────────────────

async function extractFromTiff(file: File): Promise<FileProportions> {
  const buf = await readSlice(file, Math.min(file.size, 65536));
  const view = new DataView(buf);
  if (view.byteLength < 8) return { ratio: 1, source: "none" };

  // Determine byte order
  const byteOrder = view.getUint16(0, false);
  const littleEndian = byteOrder === 0x4949; // "II"
  const bigEndian = byteOrder === 0x4D4D;   // "MM"
  if (!littleEndian && !bigEndian) return { ratio: 1, source: "none" };

  const ifdOffset = view.getUint32(4, littleEndian);
  if (ifdOffset + 2 > view.byteLength) return { ratio: 1, source: "none" };
  const entryCount = view.getUint16(ifdOffset, littleEndian);

  let width = 0, height = 0;
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const val = type === 3
      ? view.getUint16(entryOffset + 8, littleEndian)
      : view.getUint32(entryOffset + 8, littleEndian);
    if (tag === 256) width = val;  // ImageWidth
    if (tag === 257) height = val; // ImageLength
  }

  if (!width || !height) return { ratio: 1, source: "none" };
  return { ratio: width / height, source: "proportional" };
}

// ─── PSD ─────────────────────────────────────────────────────────────────────

async function extractFromPsd(file: File): Promise<FileProportions> {
  // PSD header: "8BPS" (4) + version (2) + reserved (6) + channels (2) + height (4) + width (4)
  const buf = await readSlice(file, 26);
  const view = new DataView(buf);
  if (view.byteLength < 26) return { ratio: 1, source: "none" };
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (sig !== "8BPS") return { ratio: 1, source: "none" };
  const h = view.getUint32(14, false); // big-endian
  const w = view.getUint32(18, false);
  if (!w || !h) return { ratio: 1, source: "none" };
  return { ratio: w / h, source: "proportional" };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

async function readSlice(file: File, bytes: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file.slice(0, bytes));
  });
}
