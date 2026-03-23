import { Router } from "express";

import { authenticateDoctor } from "../middleware/authMiddleware";
import {
  doctorLogin,
  doctorLogout,
  doctorRegister,
  labManagerRegister,
  pharmacyRegister,
  getDoctorProfile,
  updateDoctorClinic,
  completeDoctorForgotPassword,
  startDoctorForgotPassword,
  createAssistantAccount,
  listAssistants,
  createLabAssistantAccount,
  listLabAssistants,
  updateDoctorAvailability,
  superAdminLogin
} from "../controllers/authController";

const router = Router();

// POST /auth/doctor/register
router.post("/doctor/register", doctorRegister);

// POST /auth/lab-manager/register (public – lab manager self-registration)
router.post("/lab-manager/register", labManagerRegister);

// POST /auth/pharmacy/register (public – medicine/pharmacy self-registration)
router.post("/pharmacy/register", pharmacyRegister);

// POST /auth/doctor/login
router.post("/doctor/login", doctorLogin);

// POST /auth/super-admin/login
router.post("/super-admin/login", superAdminLogin);

// POST /auth/doctor/password/forgot - send OTP over WhatsApp
router.post("/doctor/password/forgot", startDoctorForgotPassword);

// POST /auth/doctor/password/reset - verify OTP and set new password
router.post("/doctor/password/reset", completeDoctorForgotPassword);

// POST /auth/assistant (doctor-only) - create an assistant account
router.post(
  "/assistant",
  authenticateDoctor,
  createAssistantAccount
);

// GET /auth/assistants (doctor-only) - list all assistants
router.get(
  "/assistants",
  authenticateDoctor,
  listAssistants
);

// POST /auth/lab-assistant (doctor-only) - create lab assistant
router.post(
  "/lab-assistant",
  authenticateDoctor,
  createLabAssistantAccount
);

// GET /auth/lab-assistants (doctor-only) - list lab assistants created by this doctor
router.get(
  "/lab-assistants",
  authenticateDoctor,
  listLabAssistants
);

// POST /auth/doctor/logout (JWT protected – client clears token after calling)
router.post("/doctor/logout", authenticateDoctor, doctorLogout);

// GET /auth/doctor/profile (JWT protected)
router.get("/doctor/profile", authenticateDoctor, getDoctorProfile);

// PATCH /auth/doctor/clinic (doctor only – set clinic location for distance on booking)
router.patch("/doctor/clinic", authenticateDoctor, updateDoctorClinic);

// PATCH /auth/doctor/availability (doctor only – mark unavailable/busy)
router.patch("/doctor/availability", authenticateDoctor, updateDoctorAvailability);

export default router;

