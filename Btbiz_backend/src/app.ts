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
import { tenantMiddleware } from "./tenant";
import { trackEvent } from "./services/analyticsService";

const app = express();

// So req.protocol / host match the browser (TLS offloading, Replit, reverse proxies).
app.set("trust proxy", 1);

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

/** GET /super-admin in the browser is the React route; API lives under /super-admin/overview, etc. */
function isSuperAdminSpaPageRequest(req: express.Request): boolean {
  if (req.method !== "GET") return false;
  const subPath = req.path === "" ? "/" : req.path;
  if (subPath !== "/") return false;

  const accept = req.get("Accept") ?? "";
  if (accept.includes("text/html")) return true;
  if (req.get("Sec-Fetch-Dest") === "document") return true;

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

const isProd = process.env.NODE_ENV === "production";

app.use(
  helmet({
    contentSecurityPolicy: {
      // Helmet defaults merge with ours; `object-src 'none'` etc. can still block blob previews.
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", "data:", "https:"],
        formAction: ["'self'"],
        // Allow Replit / IDE webview embedding; tighten to your own domains if needed.
        frameAncestors: null,
        imgSrc: ["'self'", "data:", "blob:", "https://images.pexels.com"],
        /** `<embed src="blob:...">` verified document preview (see Btbiz_frontend api.ts). */
        objectSrc: ["'self'", "blob:", "data:"],
        frameSrc: ["'self'", "blob:", "data:"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "https:", "'unsafe-inline'"],
        connectSrc: ["'self'", "blob:", "data:", "wss:", "ws:"],
        mediaSrc: ["'self'", "blob:", "data:"],
        workerSrc: ["'self'", "blob:"],
        ...(isProd ? { upgradeInsecureRequests: [] } : {}),
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
// Multi-tenant context (soft mode by default — see TENANT_ENFORCE in env).
app.use((req, res, next) => {
  void tenantMiddleware(req, res, next);
});

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
// Vite dev proxies /super-admin API but bypasses HTML to index.html; mirror that in production.
app.use("/super-admin", (req, res, next) => {
  if (isSuperAdminSpaPageRequest(req)) {
    return next();
  }
  return superAdminRoutes(req, res, next);
});

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
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  trackEvent({
    eventType: "api.error",
    success: false,
    route: req.originalUrl,
    metadata: { message: err.message },
  });
  if (!res.headersSent) {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default app;

