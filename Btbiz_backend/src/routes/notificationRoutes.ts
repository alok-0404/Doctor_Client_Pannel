import { Router } from "express";

import { authenticateDoctor } from "../middleware/authMiddleware";
import { getNotifications, updateNotificationStatus } from "../controllers/notificationController";

const router = Router();

router.use(authenticateDoctor);

// GET /notifications – list notifications for logged-in doctor
router.get("/", getNotifications);

// PATCH /notifications/:notificationId – mark as read or dismissed
router.patch("/:notificationId", updateNotificationStatus);

export default router;
