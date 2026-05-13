import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Enough embedded text to skip rasterization (digital PDFs). */
const STRONG_EMBEDDED_MIN = 80;
/** Minimum chars to treat combined result as usable OCR. */
const USABLE_TEXT_MIN = 35;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
/** First N pages for Poppler + Tesseract (keeps latency bounded). */
const MAX_RASTER_PAGES = 3;
const PDFTOPPM_RES_DPI = "144";

export type PdfOcrSource = "embedded" | "pdftoppm" | "embedded+pdftoppm" | "none";

export type PdfOcrPipelineResult = {
  success: boolean;
  text: string;
  confidence?: number;
  error?: string;
  source?: PdfOcrSource;
};

type ImageOcrFn = (imagePath: string) => Promise<{
  success: boolean;
  text: string;
  confidence?: number;
  error?: string;
}>;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function readEmbeddedPdfText(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse is CommonJS; keep require to avoid ESM/CJS friction in dist.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (data: Buffer) => Promise<{ text?: string }>;
    const data = await pdfParse(buffer);
    return normalizeWhitespace(String(data?.text ?? ""));
  } catch {
    return "";
  }
}

function pdftoppmCommand(): string {
  const fromEnv = process.env.PDFTOPPM_PATH?.trim();
  if (fromEnv) return fromEnv;
  return "pdftoppm";
}

/**
 * Rasterize first pages with Poppler (pdftoppm) when available on PATH or PDFTOPPM_PATH.
 * No Node native addons — optional on Windows via full path to pdftoppm.exe.
 */
async function rasterizePdfPagesToPng(pdfPath: string): Promise<string[]> {
  const outBase = path.join(os.tmpdir(), `btbiz-pdf-${process.pid}-${Date.now()}`);
  const bin = pdftoppmCommand();
  const args = [
    "-png",
    "-f",
    "1",
    "-l",
    String(MAX_RASTER_PAGES),
    "-r",
    PDFTOPPM_RES_DPI,
    pdfPath,
    outBase,
  ];
  await execFileAsync(bin, args, { timeout: 90_000, windowsHide: true });
  const paths: string[] = [];
  for (let i = 1; i <= MAX_RASTER_PAGES; i++) {
    const pagePath = `${outBase}-${i}.png`;
    try {
      await fs.access(pagePath);
      paths.push(pagePath);
    } catch {
      break;
    }
  }
  return paths;
}

async function unlinkQuiet(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch {
    /* ignore */
  }
}

/**
 * Extract text from a PDF: embedded text first, then optional Poppler raster + image OCR.
 * Safe: never throws — callers keep upload success even when this returns failure.
 */
export async function extractPdfTextForOcr(
  filePath: string,
  ocrImage: ImageOcrFn
): Promise<PdfOcrPipelineResult> {
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Could not read PDF";
    return { success: false, text: "", error: msg, source: "none" };
  }

  if (buffer.length > MAX_PDF_BYTES) {
    return {
      success: false,
      text: "",
      error: `PDF too large for OCR pipeline (max ${MAX_PDF_BYTES / (1024 * 1024)} MB)`,
      source: "none",
    };
  }

  const embedded = await readEmbeddedPdfText(buffer);
  if (embedded.length >= STRONG_EMBEDDED_MIN) {
    return {
      success: true,
      text: embedded,
      confidence: 0.92,
      source: "embedded",
    };
  }

  let pagePaths: string[] = [];
  try {
    pagePaths = await rasterizePdfPagesToPng(filePath);
  } catch {
    pagePaths = [];
  }

  const chunks: string[] = [];
  if (embedded) chunks.push(embedded);

  for (const pngPath of pagePaths) {
    try {
      const r = await ocrImage(pngPath);
      if (r.success && r.text.trim()) {
        chunks.push(r.text.trim());
      }
    } catch {
      /* page OCR failed — continue */
    } finally {
      await unlinkQuiet(pngPath);
    }
  }

  const combined = normalizeWhitespace(chunks.join("\n\n"));
  const usedRasterOcr = pagePaths.length > 0 && chunks.length > (embedded ? 1 : 0);

  if (combined.length >= USABLE_TEXT_MIN) {
    let source: PdfOcrSource;
    if (embedded && usedRasterOcr) source = "embedded+pdftoppm";
    else if (usedRasterOcr) source = "pdftoppm";
    else source = "embedded";
    const confidence = source === "embedded" ? 0.88 : source === "pdftoppm" ? 0.58 : 0.72;
    return {
      success: true,
      text: combined,
      confidence,
      source,
    };
  }

  if (combined.length > 0) {
    const source: PdfOcrSource = embedded && !usedRasterOcr ? "embedded" : usedRasterOcr ? "pdftoppm" : "embedded";
    return {
      success: true,
      text: combined,
      confidence: 0.45,
      source,
    };
  }

  const hint =
    process.env.PDFTOPPM_PATH?.trim() || process.platform !== "win32"
      ? "Could not read text from this PDF (scanned image PDFs need Poppler pdftoppm on the server, or upload a clear photo)."
      : "Could not read text from this PDF. For scanned PDFs on Windows, install Poppler and set PDFTOPPM_PATH to pdftoppm.exe, or upload a JPG/PNG photo.";

  return {
    success: false,
    text: "",
    error: hint,
    source: "none",
  };
}
