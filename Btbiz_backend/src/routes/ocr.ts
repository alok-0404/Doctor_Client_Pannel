import express, { Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import fs from 'fs';
import path from 'path';
import ocrService from '../ocrService';

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

export default router;