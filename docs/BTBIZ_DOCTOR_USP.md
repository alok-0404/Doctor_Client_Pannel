# BtBIZ Doctor — USP Document

**Product:** BtBIZ / MediGraph Doctor Platform  
**Date:** 31 Jul 2026  
**Purpose:** Product USPs from your requirements + platform-level USPs from the app design

---

## Part A — Your USPs

### 1. Patient

| # | USP | Description |
|---|-----|-------------|
| 1 | **Login / view profile with mobile number** | Patient opens their health profile using their phone number. No complex ID system needed for day-to-day access. |
| 2 | **Book appointment from profile** | From the same profile, patient can book a doctor visit without calling the clinic or visiting only to get a slot. |
| 3 | **Book lab tests from profile** | Patient can request lab tests from their profile and track them in one place instead of separate lab apps. |
| 4 | **Order medicines from profile** | Patient can place medicine orders from the same profile used for appointments and labs. |
| 5 | **Home service for lab and medicine** | For both lab and pharmacy, patient can choose home service / delivery instead of only visiting the center. |
| 6 | **Multiple family members on one number** | One shared mobile number can hold multiple family profiles (self, spouse, parents, children). |
| 7 | **Book for any family member after login** | After login with the common number, the user picks which family member the appointment is for. |
| 8 | **Distance-wise lab / pharmacy list** | Profile shows labs and pharmacies sorted by distance so the patient can choose the nearest option. |
| 9 | **Upload any document from profile** | Patient can upload reports, prescriptions, or other health documents into their own profile. |
| 10 | **Status notifications (ready / order / lab)** | Patient gets clear updates when medicine is ready, lab status changes, or an order moves forward. |
| 11 | **Time-based notifications in profile** | Reminders and alerts appear by time (e.g. before visit, when something is due) inside the patient profile. |
| 12 | **Health graphs on profile** | Patient can see health trends as graphs (vitals over time), not only the latest reading. |

### 2. Doctor

| # | USP | Description |
|---|-----|-------------|
| 1 | **Add assistant from doctor profile** | Doctor can add clinic assistants under their profile so desk staff can operate inside the same workspace. |
| 2 | **Search patient by number (workspace only)** | Doctor can find any patient anytime using mobile number, but only within their own clinic workspace. |
| 3 | **Upcoming alerts before patient arrives** | Doctor gets advance notification about upcoming patients before they reach / enter the clinic. |
| 4 | **Today’s appointments view** | Dashboard clearly shows all appointments scheduled for today so the doctor knows the current load. |
| 5 | **Upcoming appointments list** | Beyond today, doctor can see upcoming bookings and plan ahead. |
| 6 | **Availability with duration and reason** | Doctor can mark Available / Not available / Busy, including how long and why, so the clinic can communicate accurately. |
| 7 | **Quick patient lookup by number** | Doctor can search any patient by phone when needed, without digging through long lists. |
| 8 | **Daily online vs walk-in limits** | Doctor can set separate daily caps (e.g. 20 online + 20 walk-in) to control overcrowding. |
| 9 | **Real-time appointment notifications on dashboard** | New bookings appear live on the doctor dashboard as listed notifications, without manual refresh. |

### 3. Assistant

| # | USP | Description |
|---|-----|-------------|
| 1 | **Verify every document at the desk first** | Before documents go further, the assistant reviews and verifies them at the desk to catch errors early. |
| 2 | **Mistake control and security** | Verification plus secure preview / release reduces wrong uploads, leaks, and unsafe sharing. |
| 3 | **Change doctor availability (with doctor consult)** | Assistant can update doctor status after checking with the doctor, keeping the front desk in sync with reality. |
| 4 | **Message that day’s patients about doctor status** | When status changes, patients booked for that day get a message about the doctor’s current availability. |
| 5 | **Show patient distance on assistant dashboard** | When an appointment is active, assistant can see how far the patient is (e.g. around 500 meters) for better queue handling. |
| 6 | **Register walk-in patients** | Assistant can register walk-in patients at the desk and bring them into the same clinic flow. |

### 4. WhatsApp Bot (MediGraph HealthCare Assistant)

When the patient types **hi / hello / hey** on WhatsApp, the bot replies with a welcome and the full service menu — so care starts from home, without installing a new app.

**On “hi / hello” the patient sees:**

1. Greeting text:
   - New user: `Welcome to MediGraph HealthCare Assistant! 👋`
   - Returning user (if profile found): `Welcome back, [Name]! 👋`
2. Then the **main menu** (7 services):

| # | Service | What the patient can do from home |
|---|---------|-----------------------------------|
| 1 | **Book Appointment** | Share mobile number, pick family member, choose doctor / date, and book without visiting the clinic first. |
| 2 | **My Profile, Visit History & Prescriptions** | Open health profile, past visits, and prescriptions from WhatsApp. |
| 3 | **My Family Members** | View / add family profiles on the same number and book care for them. |
| 4 | **Request Lab Test** | Request common or custom lab tests; choose **home collection** or lab visit. |
| 5 | **Order Medicines** | Place a pharmacy request; choose **pickup** or **home delivery**. |
| 6 | **Upload Prescription** | Send prescription photo / file on chat so desk / pharmacy can process it. |
| 7 | **View Receipts, Reports & Prescriptions** | Check bills, reports, and Rx documents from the phone. |

**Extra shortcuts from chat:** type `login` (OTP), `doctors`, `menu`, or `help`.

#### Deep flow — what happens when each service is chosen

This is the important USP layer: every menu choice is a complete home-to-clinic journey on WhatsApp (connected to BtBIZ Doctor backend).

##### 1) Book Appointment
1. Ask registered mobile number  
2. Find family profiles → pick member **or** create new (name → gender → DOB → address; minor disclaimer if under 18)  
3. Show doctor list (name + clinic address) → patient picks doctor  
4. Pick date (today / +1 / +2 or custom DD/MM/YYYY) → enter preferred time  
5. Visit type: New Consultation / Review Follow-up  
6. Brief reason for visit  
7. Optional live location (WhatsApp Attach → Location) or *skip* — used for distance context for clinic  
8. Summary card → Confirm  
9. Optional payment link (if configured) → reply *paid*  
10. Booking saved to clinic system; patient can type *menu* again  

**USP angle:** Full doctor booking from the sofa — family select, doctor choose, slot, reason, location, confirm — no clinic visit just to get an appointment.

##### 2) My Profile, Visit History & Prescriptions
1. Ask mobile number  
2. If multiple family profiles → pick who to open  
3. Show patient profile + visit history + documents  
4. Pending docs show ⏳ until assistant releases them  
5. Released docs → reply *view N* / *download N* (secure link)  

**USP angle:** Patient checks history and files from chat; assistant gatekeeping is visible (⏳ vs released).

##### 3) My Family Members
1. Ask mobile number  
2. List all members on that number  
3. Reply *add* → name → relation (Mother/Father/Spouse/Son/Daughter/Other) → gender → DOB (minor confirm if needed)  
4. Member saved on the same family account  

**USP angle:** One WhatsApp number manages the whole household’s profiles.

##### 4) Request Lab Test
1. Ask mobile → pick family member (if multiple)  
2. Common tests menu (CBC, Lipid, LFT, KFT, Thyroid, Sugar, HbA1c, Vit D, Vit B12) **or** free-text / numbers like `1,5`  
3. Optional notes (or *skip*)  
4. Collection type: **Home Collection** or **Visit the Lab**  
5. If home: preferred date + time slot (Morning / Afternoon / Evening)  
6. Summary → Confirm → optional payment → request submitted to lab team  

**USP angle:** Lab booking from home with home sample collection — not only “come to lab”.

##### 5) Order Medicines
1. Ask mobile → pick family member  
2. Enter medicines (single or batch, e.g. `Paracetamol - 10 tablets, Azithro - 1 strip`)  
3. Quantity + dosage (or *skip*) → add more / done  
4. Delivery: **Pickup from Pharmacy** or **Home Delivery**  
5. Summary → Confirm → order goes to pharmacy side  

**USP angle:** Full medicine cart on chat with home delivery option.

##### 6) Upload Prescription
1. Ask mobile (patient linkage)  
2. Patient sends image / PDF of prescription  
3. File saved to patient record  
4. OCR may extract medicines / text / test lines  
5. Status: pending assistant verification until released (then viewable in profile / option 7)  

**USP angle:** Snap Rx from home → clinic record + OCR + secure assistant review.

##### 7) View Receipts, Reports & Prescriptions
1. Ask mobile → load records  
2. List receipts / reports / Rx files  
3. Reply *view N* or *download N* via secure links  
4. Diagnostic report links refreshed from clinic/lab when available  

**USP angle:** Bills and reports without visiting reception.

##### Shortcuts (not numbered, but part of bot USP)
| Command | What happens |
|---------|----------------|
| `login` / `otp` | Ask mobile → send OTP → verify → if multiple profiles pick one → logged-in menu |
| `doctors` | Live doctor list from clinic backend |
| `menu` / `home` / `start` / `back` | Return to 7-service main menu |
| `help` | Short guide for numbers 1–7 + login / doctors / menu |

| # | USP | Description |
|---|-----|-------------|
| 1 | **Hello opens full care menu** | Saying hi / hello immediately shows welcome + all 7 services — no app download, no clinic call first. |
| 2 | **7 home-ready services in one chat** | Appointment, profile, family, lab, medicine, upload Rx, and documents — all from one WhatsApp thread. |
| 3 | **Full care from home** | Patient can book, order, upload, and track sitting at home; home collection / home delivery options complete the “stay home” journey. |
| 4 | **Family care on the same chat number** | One WhatsApp number covers multiple family members for booking, lab, and medicine requests. |
| 5 | **Same flows as the doctor–patient panel** | Bot mirrors the clinic portal journeys, so WhatsApp and web stay consistent for the patient. |
| 6 | **OTP login + doctor list from chat** | Patient can `login` with OTP, list doctors, or return to `menu` anytime without leaving WhatsApp. |
| 7 | **Step-complete journeys (not dead-end buttons)** | Each of 1–7 runs a full multi-step flow ending in a clinic-side booking, order, upload, or document action. |
| 8 | **Home collection + home delivery on bot** | Lab home sample collection and medicine home delivery are first-class choices in chat. |
| 9 | **Location-aware appointment booking** | Patient can share live WhatsApp location during booking for clinic distance / arrival context. |
| 10 | **OCR + assistant-verified prescriptions** | Upload Rx → save + OCR extract → assistant release before open access. |

---

## Part B — App / Product-Level USPs

These strengthen your USPs and describe what makes the platform competitive as a full clinic system.

### Platform-wide

| # | USP | Description |
|---|-----|-------------|
| 1 | **One number = family health account** | A single phone number becomes the family’s care login, covering multiple members under one account. |
| 2 | **Multi-role clinic OS** | Patient, doctor, assistant, lab, pharmacy, and super admin work in one connected system instead of separate tools. |
| 3 | **Multi-tenant / workspace isolation** | Each clinic’s data stays separate and secure inside its own workspace. |
| 4 | **Online + walk-in dual channel** | Online bookings and walk-ins run as separate channels with separate quotas and clearer operations. |
| 5 | **Real-time socket notifications** | Dashboards update instantly when bookings, status, or alerts change. |
| 6 | **OTP / WhatsApp-ready auth flows** | Mobile-first login and recovery fit how most patients in India already use phones. |
| 7 | **Distance-aware provider choice** | Nearest clinic, lab, or pharmacy can be surfaced first based on location. |
| 8 | **Document + OCR pipeline** | Upload, verify, securely share documents, with support for prescription OCR where needed. |
| 9 | **End-to-end order lifecycle** | From booking to status to ready / paid to notify — the full loop stays inside the product. |
| 10 | **Health trends on profile** | Graphs turn visit and vitals history into progress the patient and clinic can actually read. |

### Patient (product angle)

| # | USP | Description |
|---|-----|-------------|
| 1 | **Self-serve care hub** | Appointment, lab, and medicine live in one profile so the patient does not jump between apps. |
| 2 | **Home service vs visit / pickup choice** | Patient chooses convenience mode per request — visit, pickup, or home service. |
| 3 | **Family member switch without new accounts** | Switch who care is for without creating a separate login for every person. |
| 4 | **Status transparency** | Lab, medicine, and appointment progress stay visible instead of “call the clinic to know.” |
| 5 | **Documents + health history in one place** | Uploads, visits, and trends sit together on the patient profile. |

### Doctor (product angle)

| # | USP | Description |
|---|-----|-------------|
| 1 | **Controlled daily load** | Separate online and walk-in limits keep the day manageable. |
| 2 | **Availability that patients can trust** | Reason + until-time makes status useful for communication, not just a label. |
| 3 | **Fast number search inside own workspace** | Quick lookup without exposing other clinics’ patients. |
| 4 | **Today + upcoming + live alerts in one dashboard** | Doctor sees schedule and new bookings together in real time. |
| 5 | **Assistant delegation without losing control** | Desk work can be shared while doctor remains the authority on care and limits. |

### Assistant (product angle)

| # | USP | Description |
|---|-----|-------------|
| 1 | **Gatekeeper for documents** | Nothing sensitive moves to patient / lab / pharmacy until desk verification is done. |
| 2 | **Walk-in registration + desk operations** | Front desk can onboard walk-ins and keep the queue moving. |
| 3 | **Doctor status proxy with messaging** | Assistant updates status with doctor’s okay and informs that day’s patients. |
| 4 | **Arrival awareness for better queues** | Distance / near-clinic visibility helps prepare for the next patient. |
| 5 | **Security-first document preview** | Short-lived / verified access reduces accidental exposure of medical files. |

### Lab & Pharmacy (extra differentiators)

| # | USP | Description |
|---|-----|-------------|
| 1 | **Patient-created lab requests** | Patients can raise lab requests with home service and payment preference already attached. |
| 2 | **Medicine pickup vs home delivery** | Pharmacy fulfills either pickup or delivery based on what the patient chose. |
| 3 | **Secure prescription sharing** | Lab / pharmacy get controlled access links instead of open file sharing. |
| 4 | **Status feedback to patient profile** | When lab or pharmacy updates status, the patient profile and notifications stay in sync. |

---

## Part C — One-line pitch

> **BtBIZ Doctor** is a family-number-based clinic OS where patients manage appointments, labs, and medicines from one profile or WhatsApp (say hi → 7 services); doctors control load, availability, and live bookings; and assistants verify documents, handle walk-ins, and keep the desk secure — with real-time alerts and distance-aware care from home.

---

## Part D — Priority map

| Priority | Focus | Linked USP |
|----------|--------|------------|
| P0 | Family login + booking + online/walk-in limits | Patient 1–7, Doctor 8–9 |
| P0 | WhatsApp hi/hello → 7 services + home care | Bot 1–4 |
| P0 | Doctor availability + patient messaging | Doctor 6, Assistant 3–4 |
| P0 | Assistant document verify + walk-in register | Assistant 1–2, 6 |
| P1 | Distance-wise lab/pharmacy + ~500m arrival view | Patient 8, Assistant 5 |
| P1 | Status + time-based notifications | Patient 10–11 |
| P1 | Health graphs on profile | Patient 12 |
| P2 | Richer OCR / secure share / analytics | Platform 8–10 |

---

## Notes

- **Part A** = your defined USPs (product promise), including WhatsApp bot.
- **Part B** = app-level / competitive USPs (system strength).
- Lab & Pharmacy are listed separately because they complete the patient’s home-service and order journey.
- Bot welcome + menu text matches `healthcareFlow.ts` (MediGraph HealthCare Assistant).
)
