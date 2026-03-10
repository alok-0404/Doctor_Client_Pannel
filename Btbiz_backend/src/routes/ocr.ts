import express, { Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import fs from 'fs';
import path from 'path';
import ocrService from '../ocrService';
import { authenticateDoctor } from '../middleware/authMiddleware';

const router = express.Router();

// Multer config
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.') as any, false);
    }
  }
});

/** Parse OCR text into medicine-like lines for bot Option A. */
function textToMedicines(text: string): string[] {
  if (!text || !text.trim()) return [];
  const raw = text
    .split(/\n|[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  const seen = new Set<string>();
  return raw.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Heuristic: pick lines that look like diagnostic/test names (e.g. CBC, X-Ray, HbA1c). */
function textToDiagnostics(text: string): string[] {
  if (!text || !text.trim()) return [];
  const diagnosticsKeywords = /^(cbc|hb|hba1c|x-?ray|ultrasound|ecg|ct|mri|urine|blood|lipid|tsh|lft|kft|serum|test|panel)/i;
  const raw = text
    .split(/\n|[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && diagnosticsKeywords.test(s));
  const seen = new Set<string>();
  return raw.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 📤 POST /api/ocr/extract
router.post('/extract', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Image file is required.' });
      return;
    }

    const imagePath = req.file.path;
    
    // 🔥 OCR Call - Handwriting extract
    const result = await ocrService.extractTextFromImage(imagePath);
    
    // 🗑️ Temp file delete kar
    fs.unlinkSync(imagePath);
    
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    // 📀 Data save kar (File ya DB)
    const outputDir = 'outputs';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }
    
    const outputPath = path.join(outputDir, `extracted_${Date.now()}.txt`);
    fs.writeFileSync(outputPath, result.text);
    
    // 📨 Response bhej
    res.json({
      success: true,
      text: result.text,
      confidence: result.confidence,
      savedAt: outputPath,
      wordCount: result.text.split(/\s+/).filter(word => word.length > 0).length
    });

  } catch (error: any) {
    console.error('🔥 Server Error:', error);
    res.status(500).json({ error: error.message || 'Something went wrong while processing OCR.' });
  }
});

// ——— Bot prescription OCR (WhatsApp flow) ———
// POST /api/ocr/prescription — field: file, auth: Bearer <doctor token>
// Response: { text?, medicines?, diagnostics? } — at least text or medicines required for bot
// Errors: 4xx/5xx with JSON { message } or { error } so bot can show "Backend: …"
router.post(
  '/prescription',
  authenticateDoctor,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'Image file is required. Field name must be "file".' });
        return;
      }
      const imagePath = req.file.path;
      const result = await ocrService.extractTextFromImage(imagePath);
      fs.unlinkSync(imagePath);

      const text = (result.text || '').trim();
      const medicines = textToMedicines(text);
      const diagnostics = textToDiagnostics(text);

      // At least text or medicines so bot has something to show
      res.status(200).json({
        text: text || undefined,
        medicines: medicines.length ? medicines : undefined,
        diagnostics: diagnostics.length ? diagnostics : undefined
      });
    } catch (error: any) {
      console.error('Prescription OCR error:', error);
      res.status(500).json({
        message: error?.message || 'Failed to extract text from image.'
      });
    }
  }
);

export default router;