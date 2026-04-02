import { Router } from "express";
import fs from "fs";
import path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require("multer") as any;

import { authenticateDoctor } from "../middleware/authMiddleware";
import {
  addDiagnosticTests,
  createPatient,
  createVisit,
  getDiagnosticTestReportFile,
  getDocumentFile,
  getPrescriptionSecureLink,
  getPrescriptionSecurePreview,
  getPatientFullHistory,
  recordVitalsAndReferForExistingVisit,
  searchPatientByMobile,
  updatePatient,
  uploadDiagnosticTestReport,
  uploadPatientDocument
} from "../controllers/patientController";

const router = Router();

const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// All patient routes are JWT protected (doctor or assistant)
router.use(authenticateDoctor);

// GET /patients/search?mobile=
router.get("/search", searchPatientByMobile);

// POST /patients - create new patient
router.post("/", createPatient);

// PATCH /patients/:patientId - update patient
router.patch("/:patientId", updatePatient);

// POST /patients/:patientId/visit - create visit (vitals, reason, notes; assistant refers to their doctor)
router.post("/:patientId/visit", createVisit);

// POST /patients/:patientId/visit/:visitId/refer - update existing visit vitals and create assistant referral notification
router.post("/:patientId/visit/:visitId/refer", recordVitalsAndReferForExistingVisit);

// POST /patients/:patientId/documents - upload report/prescription file
router.post("/:patientId/documents", upload.single("file"), uploadPatientDocument);

// GET /patients/:patientId/documents/:documentId/file - serve document for doctor/assistant
router.get("/:patientId/documents/:documentId/file", getDocumentFile);
// GET /patients/:patientId/documents/:documentId/secure-link - create short-lived token for lab/pharmacy
router.get("/:patientId/documents/:documentId/secure-link", getPrescriptionSecureLink);
// GET /patients/documents/secure-preview/:token - fetch role-limited preview (no file bytes)
router.get("/documents/secure-preview/:token", getPrescriptionSecurePreview);

// GET /patients/:patientId/full-history
router.get("/:patientId/full-history", getPatientFullHistory);

// POST /patients/:patientId/visits/:visitId/diagnostic-tests (doctor or lab assistant)
router.post(
  "/:patientId/visits/:visitId/diagnostic-tests",
  addDiagnosticTests
);

// POST /patients/:patientId/visits/:visitId/diagnostic-tests/:testId/report (doctor or lab assistant)
router.post(
  "/:patientId/visits/:visitId/diagnostic-tests/:testId/report",
  upload.single("file"),
  uploadDiagnosticTestReport
);

// GET /patients/:patientId/visits/:visitId/diagnostic-tests/:testId/report/file
router.get(
  "/:patientId/visits/:visitId/diagnostic-tests/:testId/report/file",
  getDiagnosticTestReportFile
);

export default router;


