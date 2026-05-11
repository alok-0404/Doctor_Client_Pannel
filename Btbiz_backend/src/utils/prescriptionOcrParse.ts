export type ConfidenceTag = "HIGH" | "MEDIUM" | "LOW";

const TEST_KEYWORDS = [
  "cbc",
  "hba1c",
  "lipid",
  "thyroid",
  "tsh",
  "lft",
  "kft",
  "sugar",
  "xray",
  "x-ray",
  "ecg",
  "ultrasound",
  "urine",
  "blood test",
  "test",
  "lab",
  "crp",
  "dengue",
  "ns1",
  "malaria",
  "widal",
  "culture",
  "antigen",
  "antibody",
  "parasite",
  "serology",
  "pcr",
  "vitamin d",
  "b12",
  "ferritin",
];

const MEDICINE_HINTS = [
  "tab",
  "tablet",
  "cap",
  "capsule",
  "syp",
  "syrup",
  "inj",
  "injection",
  "mg",
  "ml",
  "od",
  "bd",
  "tds",
  "hs",
  "after food",
  "before food",
];

export function detectLineType(line: string): "MEDICINE" | "TEST" | "UNKNOWN" {
  const lower = line.toLowerCase();
  if (TEST_KEYWORDS.some((k) => lower.includes(k))) return "TEST";
  if (MEDICINE_HINTS.some((k) => lower.includes(k))) return "MEDICINE";
  return "UNKNOWN";
}

function computeLineConfidence(
  line: string,
  lineType: "MEDICINE" | "TEST" | "UNKNOWN",
  ocrConfidence?: number
): ConfidenceTag {
  const norm = line.trim();
  if (!norm) return "LOW";

  let score = typeof ocrConfidence === "number" ? Math.max(0, Math.min(100, ocrConfidence)) : 55;
  if (lineType !== "UNKNOWN") score += 20;
  if (/\d/.test(norm)) score += 8;
  if (norm.length >= 12) score += 5;
  if (/[^a-zA-Z0-9\s.,:+\-()/]/.test(norm)) score -= 12;
  if (norm.length <= 4) score -= 15;

  if (score >= 78) return "HIGH";
  if (score >= 55) return "MEDIUM";
  return "LOW";
}

export function parsePrescriptionOcr(
  rawOcrText: string,
  ocrConfidence?: number
): {
  medicines: Array<{ text: string; confidence: ConfidenceTag }>;
  tests: Array<{ text: string; confidence: ConfidenceTag }>;
  unknown: Array<{ text: string; confidence: ConfidenceTag }>;
  lowConfidenceLines: string[];
} {
  const lines = rawOcrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 250);

  const medicines: Array<{ text: string; confidence: ConfidenceTag }> = [];
  const tests: Array<{ text: string; confidence: ConfidenceTag }> = [];
  const unknown: Array<{ text: string; confidence: ConfidenceTag }> = [];
  const lowConfidenceLines: string[] = [];

  for (const line of lines) {
    const lineType = detectLineType(line);
    const confidence = computeLineConfidence(line, lineType, ocrConfidence);
    if (confidence === "LOW") lowConfidenceLines.push(line);

    if (lineType === "MEDICINE") medicines.push({ text: line, confidence });
    else if (lineType === "TEST") tests.push({ text: line, confidence });
    else unknown.push({ text: line, confidence });
  }

  return { medicines, tests, unknown, lowConfidenceLines };
}

export interface VerifiedMedicineLine {
  medicineName: string;
  dosage?: string;
  quantity?: string;
  notes?: string;
}

export interface VerifiedTestLine {
  testName: string;
  notes?: string;
}

export interface VerifiedExtractPayload {
  medicines: VerifiedMedicineLine[];
  tests: VerifiedTestLine[];
  clinicalNotes?: string;
  importantNotes?: string;
}

export function formatVerifiedMedicineLine(m: VerifiedMedicineLine): string {
  const name = (m.medicineName ?? "").trim();
  const parts = [
    name,
    (m.dosage ?? "").trim() || undefined,
    (m.quantity ?? "").trim() ? `Qty ${String(m.quantity).trim()}` : undefined,
    (m.notes ?? "").trim() || undefined,
  ].filter(Boolean) as string[];
  return parts.join(" · ");
}
