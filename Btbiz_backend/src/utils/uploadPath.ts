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

export function getUploadsRootDir(): string {
  return path.resolve(__dirname, "../../uploads");
}

export function toStoredUploadPath(filePath: string | undefined | null, filename?: string): string {
  if (filename && typeof filename === "string" && filename.trim()) {
    return `uploads/${filename.trim()}`;
  }
  const raw = String(filePath ?? "").trim();
  if (!raw) return "";
  const normalizedRaw = raw.replace(/\\/g, "/");
  const uploadsIdx = normalizedRaw.lastIndexOf("/uploads/");
  if (uploadsIdx >= 0) {
    return normalizedRaw.slice(uploadsIdx + 1);
  }
  if (normalizedRaw.startsWith("uploads/")) return normalizedRaw;
  const base = path.basename(normalizedRaw);
  return base ? `uploads/${base}` : normalizedRaw;
}

export function isRemoteUploadPath(storedPath: string | undefined | null): boolean {
  const raw = String(storedPath ?? "").trim();
  return /^https?:\/\//i.test(raw);
}

/**
 * Resolve upload paths stored in mixed formats:
 * - absolute path
 * - relative `uploads/<file>`
 * - legacy paths containing `/uploads/...`
 * - windows-style separators on non-windows hosts
 */
export function findExistingUploadFilePath(storedPath: string | undefined | null): string {
  const raw = String(storedPath ?? "").trim();
  if (!raw) return "";

  const baseResolved = resolveUploadFilePath(raw);
  const normalizedRaw = raw.replace(/\\/g, "/");
  const baseName = path.basename(normalizedRaw);
  const uploadsSuffix = normalizedRaw.includes("/uploads/")
    ? normalizedRaw.slice(normalizedRaw.lastIndexOf("/uploads/") + 1)
    : "";
  const relativeFromUploads = uploadsSuffix.startsWith("uploads/")
    ? uploadsSuffix.replace(/^uploads\//, "")
    : normalizedRaw.startsWith("uploads/")
      ? normalizedRaw.replace(/^uploads\//, "")
      : "";

  const candidates = [
    baseResolved,
    baseName ? path.resolve(process.cwd(), "uploads", baseName) : "",
    baseName ? path.resolve(process.cwd(), "Btbiz_backend", "uploads", baseName) : "",
    baseName ? path.resolve(__dirname, "../../uploads", baseName) : "",
    uploadsSuffix ? path.resolve(process.cwd(), uploadsSuffix) : "",
    uploadsSuffix ? path.resolve(process.cwd(), "Btbiz_backend", uploadsSuffix) : "",
    uploadsSuffix ? path.resolve(__dirname, "../../", uploadsSuffix) : "",
    relativeFromUploads ? path.resolve(process.cwd(), "uploads", relativeFromUploads) : "",
    relativeFromUploads
      ? path.resolve(process.cwd(), "Btbiz_backend", "uploads", relativeFromUploads)
      : "",
    relativeFromUploads ? path.resolve(__dirname, "../../uploads", relativeFromUploads) : "",
  ].filter(Boolean);

  return candidates.find((p) => uploadFileExists(p)) ?? "";
}
