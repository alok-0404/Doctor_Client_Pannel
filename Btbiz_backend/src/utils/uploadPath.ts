import fs from "fs";
import path from "path";

/**
 * Multer may store either a relative path under cwd (e.g. uploads/xyz) or an absolute path.
 * path.resolve(cwd, absolutePath) on Windows can produce wrong paths in edge cases; normalize first.
 */
export function resolveUploadFilePath(storedPath: string | undefined | null): string {
  if (!storedPath || typeof storedPath !== "string") return "";
  const trimmed = storedPath.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\\/g, path.sep);
  if (path.isAbsolute(normalized)) {
    return path.normalize(normalized);
  }
  return path.resolve(process.cwd(), normalized);
}

export function uploadFileExists(fullPath: string): boolean {
  return !!(fullPath && fs.existsSync(fullPath));
}
