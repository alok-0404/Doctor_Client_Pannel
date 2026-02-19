import { Request, Response } from "express";
import mongoose from "mongoose";

import { DoctorNotification } from "../models/DoctorNotification";

export const getNotifications = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const doctorId = req.doctor?._id?.toString();
    if (!doctorId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (req.doctor?.role !== "DOCTOR") {
      res.status(403).json({ message: "Only doctors can view notifications" });
      return;
    }

    const notifications = await DoctorNotification.find({
      doctor: new mongoose.Types.ObjectId(doctorId)
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json({
      notifications: notifications.map((n) => ({
        id: (n._id as mongoose.Types.ObjectId).toString(),
        patientId: (n.patient as mongoose.Types.ObjectId).toString(),
        patientName: n.patientName,
        visitId: (n.visit as mongoose.Types.ObjectId).toString(),
        status: n.status,
        source: n.source,
        createdAt: (n as { createdAt: Date }).createdAt
      }))
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("getNotifications error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateNotificationStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const doctorId = req.doctor?._id?.toString();
    if (!doctorId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (req.doctor?.role !== "DOCTOR") {
      res.status(403).json({ message: "Only doctors can update notifications" });
      return;
    }

    const { notificationId } = req.params;
    const body = req.body as { status?: string };

    const status = body.status;
    if (!status || !["read", "dismissed"].includes(status)) {
      res.status(400).json({ message: "status must be 'read' or 'dismissed'" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      res.status(400).json({ message: "Invalid notification id" });
      return;
    }

    const notification = await DoctorNotification.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(notificationId),
        doctor: new mongoose.Types.ObjectId(doctorId)
      },
      { status },
      { new: true }
    ).lean();

    if (!notification) {
      res.status(404).json({ message: "Notification not found" });
      return;
    }

    res.status(200).json({
      id: (notification._id as mongoose.Types.ObjectId).toString(),
      status: notification.status
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("updateNotificationStatus error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
