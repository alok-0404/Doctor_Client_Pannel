import React, { useState } from 'react';
import type { ChangeEvent } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

interface ExtractedData {
  text: string;
  confidence?: number;
  savedAt?: string;
  wordCount?: number;
}

const HandwritingExtractor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractedData | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setExtractedText('');
    setResult(null);
    
    // Preview dikha
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const extractData = async (): Promise<void> => {
    if (!file) {
      toast.error('Please select an image first.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      // 🔥 API Call
      const response = await axios.post<ExtractedData & { success: boolean }>(
        'http://localhost:4000/api/ocr/extract', 
        formData, 
        {
          headers: { 'Content-Type': 'multipart/form-data' }
        }
      );

      const { text, savedAt, confidence, wordCount } = response.data;
      
      setExtractedText(text);
      setResult({ text, savedAt, confidence, wordCount });
      
      // 📥 Download option
      const blob = new Blob([text], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `handwriting_${Date.now()}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);

    } catch (error: any) {
      console.error('❌ Error:', error);
      toast.error(error.response?.data?.error || 'Something went wrong. Please check the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">📝 Handwriting OCR - TypeScript</h2>
      
      {/* Upload Area */}
      <div className="border-2 border-dashed p-6 rounded-lg mb-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="mb-2"
        />
        {preview && (
          <img 
            src={preview} 
            alt="Preview" 
            className="max-h-64 mx-auto border rounded"
          />
        )}
      </div>

      {/* Extract Button */}
      <button
        onClick={extractData}
        disabled={loading || !file}
        className="bg-blue-600 text-white px-6 py-2 rounded disabled:bg-gray-400 hover:bg-blue-700 transition"
      >
        {loading ? '⏳ Processing...' : '🔍 Extract Handwriting'}
      </button>

      {/* Result Card */}
      {result && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded">
          <h3 className="font-bold text-green-800 mb-2">✅ Success!</h3>
          <p className="text-sm">Confidence: {(result.confidence! * 100).toFixed(2)}%</p>
          <p className="text-sm">Words: {result.wordCount}</p>
          <p className="text-sm">Saved: {result.savedAt}</p>
        </div>
      )}

      {/* Extracted Text Display */}
      {extractedText && (
        <div className="mt-6 p-4 bg-gray-100 rounded">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold">📄 Extracted Data:</h3>
            <button
              onClick={() => navigator.clipboard.writeText(extractedText)}
              className="text-sm bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
            >
              📋 Copy
            </button>
          </div>
          <p className="whitespace-pre-wrap font-mono text-sm bg-white p-3 rounded border">
            {extractedText}
          </p>
        </div>
      )}
    </div>
  );
};

export default HandwritingExtractor;