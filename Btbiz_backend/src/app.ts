import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./routes/authRoutes";
import patientRoutes from "./routes/patientRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import ocrRoutes from "./routes/ocr";
import publicRoutes from "./routes/publicRoutes";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/patients", patientRoutes);
app.use("/notifications", notificationRoutes);
app.use("/api/ocr", ocrRoutes);
app.use("/public", publicRoutes);

// Fallback 404
app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

export default app;

