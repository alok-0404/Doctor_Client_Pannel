# Btbiz Doctor Admin App

A full-stack doctor administration platform with JWT authentication, patient management, appointments, pharmacy, OCR (receipt scanning), and real-time notifications via Socket.IO.

## Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS — runs on port 5000
- **Backend**: Node.js + Express + TypeScript + MongoDB + Socket.IO — runs on port 3000

## Project Structure

```
Btbiz_frontend/   React frontend (Vite, port 5000)
Btbiz_backend/    Express API backend (ts-node-dev, port 3000)
```

## Workflows

- **Start application** — `cd Btbiz_frontend && npm run dev` (port 5000, webview)
- **Backend API** — `cd Btbiz_backend && npm run dev` (port 3000, console)

## Environment Variables / Secrets

| Key | Location | Purpose |
|-----|----------|---------|
| `MONGODB_URI` | Secret | MongoDB Atlas connection string |
| `PORT` | Env var (shared) | Backend port (3000) |
| `JWT_SECRET` | Env var (shared) | JWT signing secret |
| `JWT_EXPIRES_IN` | Env var (shared) | JWT token expiry (1h) |

## Frontend Configuration

- `Btbiz_frontend/.env` — sets `VITE_API_BASE_URL=http://localhost:3000`
- `Btbiz_frontend/vite.config.ts` — host `0.0.0.0`, port `5000`, `allowedHosts: 'all'` for Replit proxy support

## Backend Features

- `/auth` — JWT-based doctor authentication
- `/patients` — patient CRUD
- `/appointments` — appointment management
- `/pharmacy` — pharmacy/prescriptions
- `/notifications` — real-time notifications
- `/api/ocr` — OCR receipt scanning (Tesseract.js)
- `/public` — public routes
- Socket.IO for real-time doctor/assistant rooms

## Deployment

- Target: VM (always-on, needed for Socket.IO)
- Build: compiles both frontend and backend TypeScript
- Run: starts backend API + serves frontend dist
