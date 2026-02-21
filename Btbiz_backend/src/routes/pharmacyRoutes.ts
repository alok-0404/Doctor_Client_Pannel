import { Router } from "express";

import { authenticateDoctor } from "../middleware/authMiddleware";
import {
  createDispensation,
  recordPayment,
  getReceipt
} from "../controllers/pharmacyController";

const router = Router();

router.use(authenticateDoctor);

// POST /pharmacy/dispense - create dispensation (PHARMACY role only checked inside)
router.post("/dispense", createDispensation);

// PATCH /pharmacy/dispense/:id/payment
router.patch("/dispense/:id/payment", recordPayment);

// GET /pharmacy/dispense/:id/receipt
router.get("/dispense/:id/receipt", getReceipt);

export default router;
