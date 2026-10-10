import type { NextFunction, Request, Response } from "express";

import { DOCTOR_PHOTO_MAX_BYTES } from "../services/doctorProfileService";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require("multer") as any;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCTOR_PHOTO_MAX_BYTES, files: 1 }
});

/** Accepts a single multipart field named "photo" and turns multer errors into 400 JSON. */
export function doctorPhotoUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single("photo")(req, res, (err: any) => {
    if (!err) {
      next();
      return;
    }
    const message =
      err?.code === "LIMIT_FILE_SIZE" ? "Photo must be 2 MB or smaller" : "Could not read the uploaded photo";
    res.status(400).json({ message });
  });
}
