import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./routes/authRoutes";
import patientRoutes from "./routes/patientRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import ocrRoutes from "./routes/ocr";
import publicRoutes from "./routes/publicRoutes";
import publicPatientRoutes from "./routes/publicPatientRoutes";
import appointmentRoutes from "./routes/appointmentRoutes";
import pharmacyRoutes from "./routes/pharmacyRoutes";
import superAdminRoutes from "./routes/superAdminRoutes";
import orderRoutes from "./routes/orderRoutes";

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5000",
  "https://wit-true-destinations-variations.trycloudflare.com",
];

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (origin.endsWith(".trycloudflare.com")) return true;
  if (origin.endsWith(".replit.dev") || origin.endsWith(".replit.app") || origin.endsWith(".repl.co")) return true;
  return false;
}

// Set CORS header early so it's on every response (including 500/errors)
app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https://images.pexels.com"],
        connectSrc: ["'self'", "wss:", "ws:"],
        fontSrc: ["'self'", "data:"],
      },
    },
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Do not pass Error to callback — that triggers Express error handler and returns 500.
      callback(null, isOriginAllowed(origin));
    },
  })
);
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/patients", patientRoutes);
app.use("/notifications", notificationRoutes);
app.use("/api/ocr", ocrRoutes);
// Keep /public/patient before /public to avoid /public route shadowing
// patient-portal endpoints like /public/patient/tests.
app.use("/public/patient", publicPatientRoutes);
app.use("/public", publicRoutes);
app.use("/appointments", appointmentRoutes);
app.use("/pharmacy", pharmacyRoutes);
app.use("/orders", orderRoutes);
app.use("/super-admin", superAdminRoutes);

if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(__dirname, "../../Btbiz_frontend/dist");
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found" });
  });
}

// Error handler so 500 responses still have CORS and JSON
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  if (!res.headersSent) {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default app;

