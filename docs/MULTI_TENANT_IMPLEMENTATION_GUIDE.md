# BTBIZHC Multi-Tenant — Step-by-Step Implementation Guide

**Purpose:** Yeh document team ke liye **single source of truth** hai. Pehle poora padho, phir **Step 1 se order mein** implement karo. Har step ke baad **“Done when”** checklist verify karo — agla step tabhi shuru karo.

**Spec reference:** Tenant Middleware Developer Specification (02 May 2026) + Architecture Shift document.

**Last reviewed:** May 2026  
**Codebase:** `Btbiz_backend` + `Btbiz_frontend`

---

## Progress tracker (update as you go)

| Step | Status | Notes |
|------|--------|-------|
| 1 — `src/tenant/` folder | ✅ Done | May 2026 |
| 2 — `tenantPlugin.ts` | ✅ Done | Soft mode: no context = legacy queries unchanged |
| 3 — `tenantResolver.ts` | ✅ Done | JWT → DB fallback → slug → subdomain → header → WhatsApp |
| 4 — `publicRoutes.ts` | ✅ Done | Platform/public skip lists |
| 5 — `tenantMiddleware.ts` | ✅ Done | Mismatch logs; blocks only when `TENANT_ENFORCE=true` |
| 6 — Register in `app.ts` | ✅ Done | Global middleware after `express.json` |
| 7 — Plugin on models | ✅ Done | 11 models + compound indexes; legacy orphan read default on |
| 8 — Backfill script | ✅ Done | `npm run backfill:tenant:dry` then `npm run backfill:tenant` |
| 10–11 — JWT patient | ⬜ Partial | Staff JWT includes `tenantId` when set on Doctor |
| 20 — Tests | ⬜ Pending | |

**Env flags (default off — production safe):**

- `TENANT_ENFORCE=true` — block protected routes without tenant
- `TENANT_PLUGIN_ENFORCE=true` — throw on DB ops without tenant context
- `TENANT_LEGACY_ORPHAN_READ=false` — after Step 8 backfill; until then orphan records stay visible in scoped queries

---

## 0. Current state (kya ho chuka hai — dubara mat banao)

| Already done | Location |
|--------------|----------|
| `Tenant` MongoDB model | `Btbiz_backend/src/models/Tenant.ts` |
| Super Admin: create/list/update/delete pharmacy & lab tenants | `tenantService.ts`, `superAdminRoutes.ts` |
| Super Admin UI (pharmacy/lab tenants) | `Btbiz_frontend/src/pages/SuperAdminDashboard.tsx` |
| `Doctor.tenantId` + `Doctor.tenantType` on new tenant owners | `models/Doctor.ts`, `tenantService.ts` |
| Patient pharmacy/lab list includes tenants | `patientProviderService.ts` |

| **Not done (critical)** | Impact |
|-------------------------|--------|
| `src/tenant/` middleware + Mongoose plugin | Data ab bhi **shared DB** — isolation nahi |
| `tenantId` on Patient, Visit, Prescription, … | Cross-clinic data leak possible |
| JWT mein `tenantId` | APIs tenant scope nahi jaanti |
| `TenantConnection` + cross-tenant orders | Orders purane `preferredProvider` flow par hain |
| Socket `tenant_*` rooms | Global/doctor rooms only |
| Frontend subdomain/path tenant | Phase 2 |

**Rule:** Naye tenant banane wala Super Admin flow **change mat karo** jab tak Step 8 tak na pahuncho — pehle **isolation layer** stable honi chahiye.

---

## 1. Big picture (3 layers)

```
Request → [Auth] → [Tenant Middleware] → [Existing route handlers unchanged]
                         ↓
              AsyncLocalStorage { tenantId }
                         ↓
              Mongoose tenantPlugin → har query auto-filter
```

**Goal:** Route handlers same rahein; `Patient.find({ phone })` andar se `Patient.find({ phone, tenantId })` ban jaye.

---

## 2. Implementation phases (overview)

| Phase | Focus | Approx. effort |
|-------|--------|----------------|
| **A** | Core tenant module (plugin + middleware + resolver) | 2–3 days |
| **B** | Models + indexes + JWT | 1–2 days |
| **C** | Public routes + slug resolution | 1 day |
| **D** | Cross-tenant orders + connections | 2 days |
| **E** | Socket.IO + audit log | 1 day |
| **F** | Tests (mandatory before live) | 1–2 days |
| **G** | Frontend tenant URL (Phase 2) | 2–3 days |
| **H** | WhatsApp per-clinic mapping | Separate track |

---

## Phase A — Core tenant module (START HERE)

### Step 1 — Folder structure banao

**Create:**

```
Btbiz_backend/src/tenant/
  ├── tenantPlugin.ts       # AsyncLocalStorage + Mongoose plugin
  ├── tenantMiddleware.ts   # Express middleware
  ├── tenantResolver.ts     # JWT / slug / WhatsApp → tenantId
  ├── tenantContext.ts      # getCurrentTenantId(), types (optional split)
  ├── publicRoutes.ts       # isPublicRoute() list
  └── index.ts              # re-exports
```

**Done when:** Project compile ho, koi runtime wire abhi zaroori nahi.

---

### Step 2 — `tenantPlugin.ts` (sabse important)

**Kya karna hai:**

1. `AsyncLocalStorage<{ tenantId: string }>` export karo (`tenantStorage`).
2. `getCurrentTenantId()` — store missing ho to **throw** (kabhi bhi unscoped query nahi).
3. `tenantPlugin(schema)`:
   - Schema par `tenantId: { type: String, required: true, index: true }` add.
   - `pre('save')` — nayi document par `tenantId` auto set.
   - Query hooks: `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, `countDocuments`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany` — sab par `this.where({ tenantId })`.
   - `pre('aggregate')` — pipeline start par `{ $match: { tenantId } }`.

**Done when:** Unit test (Step 20) mein plugin ke bina query fail ho.

**Note:** `Tenant`, `TenantConnection`, `MedicineOrder`, `TestOrder` par yeh plugin **mat lagana** (alag rules — Step 15).

---

### Step 3 — `tenantResolver.ts`

**Resolution order (priority):**

| # | Source | Kab use |
|---|--------|---------|
| 1 | JWT | Staff/patient APIs — `req.doctor` / decoded token after auth |
| 2 | URL slug | `GET /public/.../clinic/:slug/...` (patient booking, OTP) |
| 3 | Subdomain | `drsharma.btbizhc.com` → `Tenant.findOne({ slug })` |
| 4 | WhatsApp webhook | `req.body` se clinic WA number → `Tenant.whatsappNumber` |

**Functions:**

- `resolveTenantId(req): string | null`
- `resolveTenantFromSlug(slug: string): Promise<string | null>`
- `resolveTenantFromWhatsappNumber(number: string): Promise<string | null>`

**Done when:** Har method ke liye ek manual test case likha ho (comment ya test file).

---

### Step 4 — Public routes list

**File:** `publicRoutes.ts` ya `tenantMiddleware.ts` ke andar `isPublicRoute(path, method)`.

**Skip tenant (no tenantId required):**

- `GET /health`
- `POST /auth/...` super admin login (agar alag ho)
- `GET /` landing
- `/super-admin/*` — **platform level** (super admin middleware alag se)
- Static assets / SPA

**Resolve tenant from URL (tenant chahiye, JWT nahi):**

- `/public/...` patient OTP / book flows jahan slug ho

**Done when:** List documented ho aur middleware isi list ko use kare.

---

### Step 5 — `tenantMiddleware.ts`

**Flow:**

```
1. tenantId = resolveTenantId(req)
2. Agar !tenantId && !isPublicRoute → 403 { error: 'Tenant context required' }
3. tenantStorage.run({ tenantId }, () => {
     req.tenantId = tenantId   // express.d.ts mein type add karo
     next()
   })
4. catch → log + 403
```

**Done when:** Postman se protected route bina token → 403; valid JWT ke saath → 200.

---

### Step 6 — `app.ts` mein register karo

**Order (important):**

```ts
app.use(express.json());
app.use("/auth", authRoutes);           // login routes — tenant optional on login
// ... jahan staff/patient protected routes hain:
// authenticateDoctor / authenticatePatient PEHLE
// phir tenantMiddleware (JWT se tenantId milega)
```

**Practical approach:**

- Option A: Global `tenantMiddleware` + `isPublicRoute` whitelist.
- Option B: Sirf `/patients`, `/appointments`, `/pharmacy`, `/orders`, `/notifications` routers par `router.use(tenantMiddleware)` auth ke baad.

**Recommendation:** Option B pehle (kam risk), phir global.

**Done when:** Ek protected GET (e.g. patients list) tenant context ke bina DB hit na kare.

---

## Phase B — Models, JWT, indexes

### Step 7 — Kaunse models par plugin lagana hai

**Plugin LAGAO (`schema.plugin(tenantPlugin)` + compound indexes):**

| Model | File | Suggested index |
|-------|------|-----------------|
| Patient | `models/Patient.ts` | `{ tenantId: 1, mobileNumber: 1 }` |
| Visit (appointments) | `models/Visit.ts` | `{ tenantId: 1, visitDate: 1 }` |
| Prescription | `models/Prescription.ts` | `{ tenantId: 1, patient: 1 }` |
| PatientDocument | `models/PatientDocument.ts` | `{ tenantId: 1, patient: 1 }` |
| FamilyMember / FamilyAccount | respective files | `{ tenantId: 1, ... }` |
| DoctorNotification | `models/DoctorNotification.ts` | `{ tenantId: 1, ... }` |
| Medicine (inventory) | `models/Medicine.ts` | `{ tenantId: 1, ... }` |
| DiagnosticTest | `models/DiagnosticTest.ts` | tenant scope decide karo (clinic vs platform) |
| PharmacyDispensation | if clinic-scoped | `{ tenantId: 1, ... }` |
| Doctor (staff) | **Special** — see Step 9 |

**Plugin MAT LAGAO:**

| Model | Reason |
|-------|--------|
| Tenant | Platform-level |
| TenantConnection | Platform-level (Step 15) |
| PatientMedicineRequest / PatientTestRequest | Migrate to `MedicineOrder` / `TestOrder` OR add `sourceTenantId` + `targetTenantId` (Step 15) |

**Done when:** Har file mein exactly **ek line** `schema.plugin(tenantPlugin)` + index migration note.

---

### Step 8 — Existing data migration (ek baar)

**Problem:** Purane records mein `tenantId` nahi hai.

**Plan:**

1. Ek default clinic tenant banao (pilot): `clinic_default_001`.
2. Script: `scripts/backfill-tenant-id.ts` — saari collections jahan plugin laga, un par `tenantId` set karo.
3. Self-signup pharmacy/lab: `Doctor.tenantId` se map karo jahan possible.
4. Production se pehle **backup** + dry run on staging.

**Done when:** Staging par `Patient.find()` ek tenant context mein sirf us clinic ke patients de.

**Commands (implemented):**

```bash
cd Btbiz_backend
npm run backfill:tenant:dry   # preview counts
npm run backfill:tenant       # apply (idempotent)
```

**Optional env:** `DEFAULT_CLINIC_TENANT_ID`, `DEFAULT_CLINIC_NAME`, `DEFAULT_CLINIC_SLUG`

**After successful backfill:** set `TENANT_LEGACY_ORPHAN_READ=false` in `.env` and restart API.

---

### Step 9 — Staff (`Doctor`) model strategy

**Options:**

- **A)** Doctor bhi tenant-scoped (plugin) — login ke baad sirf apne tenant ka staff dikhe.
- **B)** Doctor platform-wide, lekin `tenantId` field filter manually — spec ke hisaab se staff JWT mein `tenantId` hona chahiye.

**Recommended:** Doctor par plugin **lagao**; Super Admin routes `tenantMiddleware` skip karein (platform).

**Done when:** Clinic doctor login → sirf apne tenant ke patients.

---

### Step 10 — JWT changes (staff)

**File:** `services/authService.ts` → `generateDoctorToken`

**Payload add karo:**

```ts
{
  doctorId,
  role,
  tenantId: doctor.tenantId,      // required for tenant staff
  tenantType: doctor.tenantType   // CLINIC | PHARMACY | LAB
}
```

**File:** `middleware/authMiddleware.ts`

- Decode ke baad `req.tenantId = decoded.tenantId` (ya resolver JWT se le).
- Agar role tenant staff hai aur `tenantId` missing → 401.

**Login handlers:** Purane doctors jinke paas `tenantId` nahi — pehle Step 8 backfill, warna login block + admin message.

**Done when:** JWT decode se `tenantId` middleware tak same value aaye.

---

### Step 11 — JWT changes (patient)

**Files:** `patientAuthService.ts`, `publicRoutes.ts` / `patientController.ts` OTP verify

**Payload add:**

```ts
{ patientId, type: 'patient', tenantId, profileId? }
```

**Rule:** OTP flow se **pehle** slug/subdomain se tenant resolve → OTP usi tenant ke patients par check ho.

**Done when:** Same phone do clinics par = **do alag patient records**, do alag tokens.

---

### Step 12 — `express.d.ts` update

```ts
interface Request {
  tenantId?: string;
  doctor?: { ...; tenantId?: string; tenantType?: string };
  patient?: { ...; tenantId?: string };
}
```

**Done when:** TypeScript errors zero on `req.tenantId`.

---

## Phase C — Public & clinic URLs

### Step 13 — Slug-based public routes

**Pattern (choose one, document karo):**

- Path: `btbizhc.com/clinic/:slug/book-appointment`
- Subdomain: `drsharma.btbizhc.com`

**Backend:**

- Public patient routes par resolver slug se `tenantId` set kare **before** OTP.
- `tenantStorage.run` OTP handlers ke andar bhi active ho.

**Done when:** `/clinic/test-clinic/send-otp` galat slug → 404; sahi slug → OTP us clinic ke DB par.

---

### Step 14 — JWT vs URL tenant mismatch alert

Agar JWT `tenantId` ≠ URL slug tenant → **403 + audit log (ALERT)**.

**Done when:** Manual test: token clinic A, URL clinic B → blocked + log entry.

---

## Phase D — Cross-tenant (orders & connections)

### Step 15 — `TenantConnection` model

**File:** `models/TenantConnection.ts`

```ts
{
  clinicTenantId: string,
  partnerTenantId: string,
  partnerType: 'PHARMACY' | 'LAB',
  status: 'ACTIVE' | 'PENDING' | 'REVOKED',
  connectedAt: Date,
  approvedBy?: string
}
```

**APIs (Super Admin):**

- `GET/POST /super-admin/connections` (ya `/platform/tenants/:id/connections`)

**Done when:** Super Admin UI se clinic ↔ pharmacy link create/delete ho sake.

---

### Step 16 — `MedicineOrder` / `TestOrder` models

**New collections** (plugin **nahi**):

```ts
{
  sourceTenantId,   // clinic
  targetTenantId, // pharmacy / lab
  patientName,
  medicines | tests,  // minimum fields only
  status,
  // NO diagnosis, NO full Rx image, NO clinical notes
}
```

**Service:** `crossTenantOrderService.ts`

1. `TenantConnection` verify
2. Clinic context mein prescription read
3. Minimum fields extract
4. Order create
5. Socket: `io.to('tenant_' + targetTenantId).emit('newOrder', ...)`

**Done when:** Pharmacy dashboard incoming orders sirf connected clinics se.

---

### Step 17 — Purane `PatientMedicineRequest` flow

**Decision (ek choose karo, document update karo):**

- **Migrate:** Naye orders `MedicineOrder` par; purana flow deprecate.
- **Bridge:** Create par dual-write temporary.

**Done when:** Spec test #7 pass — Clinic B → Pharmacy P (only connected to A) = reject.

---

## Phase E — Socket & audit

### Step 18 — Socket.IO tenant rooms

**File:** `server.ts` / `socket.ts`

```ts
socket.join('tenant_' + user.tenantId);
// emit: io.to('tenant_' + id).emit(...)
```

**Remove / avoid:** `io.emit` global for tenant-specific events.

**Done when:** Test #10 — Clinic B event, Clinic A socket receive na kare.

---

### Step 19 — Audit log

**Collection:** `tenant_audit_logs` (platform-level, no plugin)

Fields: `timestamp`, `tenantId`, `userId`, `role`, `method`, `path`, `ip`, `statusCode`, `alert?: boolean`

**Log:** Har tenant-scoped request; **alert** on JWT/URL tenant mismatch.

**Done when:** Kuch din staging par logs review ho sakte hain.

---

## Phase F — Mandatory tests

### Step 20 — `tenantTests.ts`

Spec checklist — **sab pass, tab hi production:**

| # | Test |
|---|------|
| 1 | Tenant A patient, Tenant B query → empty |
| 2 | Create in A → `tenantId` auto-set |
| 3 | 5 in A, 3 in B → `find` counts correct |
| 4 | B update A's `_id` → not found |
| 5 | B delete A's `_id` → not found |
| 6 | Tampered JWT tenantId → 401/403 |
| 7 | Order without connection → reject |
| 8 | Pharmacy order has no diagnosis/notes/image |
| 9 | Query without context → throw |
| 10 | Socket isolation |

**Run:** `npm test` ya dedicated script `npm run test:tenant`

**Done when:** CI mein yeh suite green.

---

## Phase G — Frontend (Phase 2)

### Step 21 — Tenant detection

- URL/subdomain se `tenantSlug` read
- API client har request par `X-Tenant-Slug` ya path prefix (backend contract match)
- Login page clinic-branded

**Done when:** `drsharma.localhost:5173` → APIs us clinic tenant par.

---

### Step 22 — Super Admin extensions

- Connections UI (clinic ↔ pharmacy/lab)
- CLINIC tenant create (ab sirf PHARMACY/LAB hai)
- Platform metrics (patient count **nahi** — spec: Super Admin patient records na dekhe)

---

## Phase H — WhatsApp (parallel track)

### Step 23 — Per-clinic WhatsApp number

- `Tenant.whatsappNumber` populate
- Webhook: incoming `to` number → `resolveTenantFromWhatsappNumber`
- Bot flows same, data tenant-scoped

**Note:** `medigraph_bot` alag codebase — integration contract alag doc.

---

## 3. File change cheat sheet

| Action | Files |
|--------|-------|
| **Create** | `src/tenant/*`, `models/TenantConnection.ts`, `models/MedicineOrder.ts`, `models/TestOrder.ts`, `services/crossTenantOrderService.ts`, `scripts/backfill-tenant-id.ts`, `tenantTests.ts` |
| **One line each** | All tenant-scoped models → `schema.plugin(tenantPlugin)` |
| **Modify** | `app.ts`, `authService.ts`, `authMiddleware.ts`, `patientAuthService.ts`, `types/express.d.ts`, `socket.ts` |
| **No change (goal)** | Existing route handler business logic — sirf middleware/plugin |

---

## 4. Order of work (quick checklist)

Copy this into PR / task tracker:

```
[ ] Step 1  — tenant/ folder
[ ] Step 2  — tenantPlugin.ts
[ ] Step 3  — tenantResolver.ts
[ ] Step 4  — public routes list
[ ] Step 5  — tenantMiddleware.ts
[ ] Step 6  — register in app.ts
[ ] Step 7  — plugin on models
[ ] Step 8  — backfill migration script
[ ] Step 9  — Doctor tenant strategy
[ ] Step 10 — staff JWT
[ ] Step 11 — patient JWT
[ ] Step 12 — express.d.ts
[ ] Step 13 — slug public routes
[ ] Step 14 — mismatch alert
[ ] Step 15 — TenantConnection
[ ] Step 16 — MedicineOrder / TestOrder
[ ] Step 17 — migrate old medicine requests
[ ] Step 18 — Socket tenant rooms
[ ] Step 19 — audit log
[ ] Step 20 — tenantTests (all 10 pass)
[ ] Step 21 — frontend tenant URL
[ ] Step 22 — Super Admin connections + clinic tenant
[ ] Step 23 — WhatsApp mapping
```

---

## 5. Risks (padh lo pehle)

| Risk | Mitigation |
|------|------------|
| Plugin miss on one model = data leak | Step 7 checklist + Step 20 tests |
| Backfill galat tenantId | Staging dry run + backup |
| Login break for old doctors | Backfill before Step 10 |
| Super Admin blocked by tenant middleware | `/super-admin` explicitly skip |
| Performance | Compound indexes Step 7 |

---

## 6. Definition of done (go-live)

Multi-tenant **Phase 1 live** tab maanenge jab:

1. Steps 1–12 + 20 **complete** (core isolation + JWT).
2. Do test clinics staging par — **zero cross-visibility** (test 1–5).
3. Kam se kam ek pharmacy **TenantConnection** ke through order receive kare (Steps 15–17).
4. Production data backfill verified.

Phase 2 (frontend URL, WhatsApp) alag release ho sakti hai lekin **bina Step 1–12 ke live mat jao**.

---

## 7. Agla kaam ab kya karein?

1. Is document ko team share karo.
2. **Step 1** se coding shuru karo — `Btbiz_backend/src/tenant/` folder.
3. Har PR ek ya do steps cover kare (review easy rahega).
4. PR description mein likho: `Implements: Step X–Y from docs/MULTI_TENANT_IMPLEMENTATION_GUIDE.md`

---

*Questions / decisions log: niche PR comments ya is file ke end mein "Decisions" section add karte jao.*
