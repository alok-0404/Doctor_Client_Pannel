import Tesseract from "tesseract.js";

interface OCRResult {
  success: boolean;
  text: string;
  confidence?: number;
  error?: string;
  raw?: any;
}

class OCRService {
  async extractTextFromImage(imagePath: string): Promise<OCRResult> {
    try {
      console.log(`🔍 Running Tesseract OCR for: ${imagePath}`);

      const { data } = await Tesseract.recognize(imagePath, "eng");
      const text = (data.text || "").trim();

      return {
        success: text.length > 0,
        text,
        // Tesseract confidence is typically 0–100; normalise to 0–1 to match old API
        confidence: data.confidence != null ? data.confidence / 100 : undefined,
        raw: data
      };
    } catch (error: any) {
      console.error("❌ OCR Error:", error);
      return {
        success: false,
        text: "",
        error: error.message
      };
    }
  }

  async destroy(): Promise<void> {
    // No special cleanup needed for tesseract.js in this wrapper
  }
}

// Singleton instance
const ocrService = new OCRService();
export default ocrService;