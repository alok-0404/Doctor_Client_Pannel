# MEDIGRAPH - Complete Conversational Flow
## Doctor-Client Panel Bot Flow

---

## 🔷 FLOW 1: PATIENT ENTRY POINT

```
Bot: Welcome to MediGraph! 👋
     How can I help you today?

     1️⃣ Book an Appointment
     2️⃣ Login to My Profile
     3️⃣ View Doctors
     4️⃣ I need help

User: [Selects option]
```

---

## 🔷 FLOW 2: BOOK APPOINTMENT (New + Existing Patient)

### Step 2.1: Identify Patient
```
Bot: Let's book your appointment! 📅
     Please share your mobile number.

User: 9876543210

Bot: [Calls API: POST /public/family/login-or-create]
```

### Step 2.2a: Existing Patient Found
```
Bot: Welcome back! I found these profiles linked to your number:
     1️⃣ Alok Kumar (Self)
     2️⃣ Priya Kumar (Wife)
     3️⃣ Raj Kumar (Father)
     4️⃣ ➕ Add New Family Member

     Who is the appointment for?

User: 1 (Alok Kumar)
```

### Step 2.2b: New Patient - Create Profile
```
Bot: Looks like you're new here! Let me create your profile.
     What is the patient's full name?

User: Alok Kumar

Bot: What is the patient's gender?
     1️⃣ Male
     2️⃣ Female
     3️⃣ Other

User: 1

Bot: What is the date of birth? (DD/MM/YYYY)

User: 15/04/1995

Bot: What is the address?

User: 123 Main Street, Mumbai

Bot: ✅ Profile created for Alok Kumar!
     [Calls API: POST /public/family/members]
```

### Step 2.3: Select Doctor
```
Bot: Choose a doctor for your consultation:

     1️⃣ Dr. Sharma - General Physician
        📍 City Hospital, Mumbai (2.3 km away)
        ✅ Available

     2️⃣ Dr. Patel - Cardiologist
        📍 Heart Care Clinic, Mumbai (5.1 km away)
        ✅ Available

     3️⃣ Dr. Singh - Dermatologist
        📍 Skin Care Center (8.7 km away)
        ⏳ Busy

     [Calls API: GET /public/doctors]

User: 1
```

### Step 2.4: Select Date
```
Bot: Great! Dr. Sharma is available on these dates:
     1️⃣ Today - Mon, 7 Apr 2026 (3 slots left)
     2️⃣ Tue, 8 Apr 2026 (8 slots left)
     3️⃣ Wed, 9 Apr 2026 (10 slots left)

     Which date works for you?

User: 1
```

### Step 2.5: Select Time Slot
```
Bot: Available time slots for Today:
     1️⃣ 10:00 AM - 10:30 AM
     2️⃣ 11:00 AM - 11:30 AM
     3️⃣ 02:00 PM - 02:30 PM

     Pick a time:

User: 2
```

### Step 2.6: Consultation Type
```
Bot: Is this a:
     1️⃣ New Consultation (first time visiting this doctor)
     2️⃣ Review/Follow-up

User: 1

Bot: What is the reason for your visit? (Brief description)

User: Having headache and fever since 2 days
```

### Step 2.7: Confirmation
```
Bot: 📋 Appointment Summary:
     ━━━━━━━━━━━━━━━━━━━
     👤 Patient: Alok Kumar
     🏥 Doctor: Dr. Sharma
     📍 City Hospital, Mumbai
     📅 Today, 7 Apr 2026
     🕐 11:00 AM - 11:30 AM
     📝 Type: New Consultation
     💬 Reason: Headache and fever since 2 days
     ━━━━━━━━━━━━━━━━━━━

     Confirm booking?
     1️⃣ ✅ Yes, Book it!
     2️⃣ ❌ Cancel

User: 1

Bot: ✅ Appointment Booked Successfully!
     Your token number is #12.
     Please arrive 15 minutes before your slot.

     [Calls API: POST /public/book-appointment]
     [Triggers Socket.IO: appointmentBooked → Doctor]
```

---

## 🔷 FLOW 3: PATIENT LOGIN (OTP Based)

### Step 3.1: Request OTP
```
Bot: Please enter your registered mobile number to login.

User: 9876543210

Bot: 📲 OTP sent to your mobile number!
     Please enter the 6-digit code.

     [Calls API: POST /public/patient/send-otp]

User: 482937
```

### Step 3.2: Verify OTP
```
Bot: [Calls API: POST /public/patient/verify]
```

### Step 3.3a: Single Profile
```
Bot: ✅ Logged in successfully!
     Welcome, Alok Kumar!
```

### Step 3.3b: Multiple Profiles (Family)
```
Bot: Multiple profiles found! Who are you?
     1️⃣ Alok Kumar (Self)
     2️⃣ Priya Kumar (Wife)
     3️⃣ Raj Kumar (Father)

User: 1

Bot: ✅ Welcome, Alok Kumar!
     [Calls API: POST /public/patient/select-profile]
```

### Step 3.4: Patient Dashboard Menu
```
Bot: What would you like to do?
     1️⃣ 📋 View My Profile & Visit History
     2️⃣ 📅 Book New Appointment
     3️⃣ 👨‍👩‍👧 Manage Family Members
     4️⃣ 💊 Request Medicine
     5️⃣ 🔬 Request Lab Test
     6️⃣ 📄 Upload Prescription/Document
     7️⃣ 🧾 View Receipts & Reports
     8️⃣ 🔙 Logout

User: [Selects option]
```

---

## 🔷 FLOW 4: VIEW PROFILE & VISIT HISTORY

```
Bot: 👤 Your Profile:
     ━━━━━━━━━━━━━━
     Name: Alok Kumar
     Phone: 9876543210
     Age: 30 | Gender: Male
     Address: 123 Main Street, Mumbai

     📋 Recent Visits:
     ━━━━━━━━━━━━━━
     1️⃣ 05 Apr 2026 - Dr. Sharma
        Reason: Fever & headache
        Notes: Viral fever, prescribed rest

     2️⃣ 20 Mar 2026 - Dr. Patel
        Reason: Chest pain
        Notes: ECG normal, stress-related

     Want to see full details of any visit?
     Type the number or say "back" to return.

     [Calls API: GET /public/patient/profile]

User: 1

Bot: 📄 Visit Details - 05 Apr 2026
     ━━━━━━━━━━━━━━━━━━━━━━━
     Doctor: Dr. Sharma
     Vitals:
       BP: 120/80 | Temp: 101°F
       Weight: 72 kg | SpO2: 98%
     Notes: Viral fever. Rest advised.
     Prescription: Paracetamol 500mg x 3 days

     1️⃣ 📥 Download Prescription Receipt
     2️⃣ 🔙 Back to Menu

User: [Selects option]
```

---

## 🔷 FLOW 5: MANAGE FAMILY MEMBERS

### Step 5.1: View Family
```
Bot: 👨‍👩‍👧 Your Family Members:
     1️⃣ Alok Kumar (Self)
     2️⃣ Priya Kumar (Wife)
     3️⃣ Raj Kumar (Father)

     What would you like to do?
     ➕ Add New Member
     ✏️ Edit Member (type number)
     🗑️ Remove Member
     🔙 Back

User: Add New Member
```

### Step 5.2: Add Family Member
```
Bot: Adding a new family member!
     What is their full name?

User: Meera Kumar

Bot: Relation to you?
     1️⃣ Mother  2️⃣ Father  3️⃣ Wife/Husband
     4️⃣ Son     5️⃣ Daughter  6️⃣ Other

User: 1

Bot: Gender?
     1️⃣ Male  2️⃣ Female  3️⃣ Other

User: 2

Bot: Date of birth? (DD/MM/YYYY)

User: 10/08/1965

Bot: ✅ Meera Kumar (Mother) has been added!
     [Calls API: POST /public/family/members]
```

---

## 🔷 FLOW 6: REQUEST MEDICINE

### Step 6.1: Add Medicines
```
Bot: 💊 Let's create a medicine request.
     Enter medicine details:

     Medicine name?

User: Paracetamol 500mg

Bot: Quantity?

User: 10 tablets

Bot: Dosage instructions? (e.g., "1 tablet 3 times a day")

User: 1 tablet twice a day after food

Bot: Any additional notes?

User: No

Bot: Want to add another medicine?
     1️⃣ ➕ Yes, add more
     2️⃣ ✅ No, that's all

User: 1

Bot: Medicine name?

User: Cetirizine 10mg

Bot: Quantity?

User: 5 tablets

Bot: Dosage instructions?

User: 1 tablet at night

Bot: Want to add another medicine?
     1️⃣ ➕ Yes, add more
     2️⃣ ✅ No, that's all

User: 2
```

### Step 6.2: Delivery Preference
```
Bot: How would you like to receive your medicines?
     1️⃣ 🏪 Pickup from Pharmacy
     2️⃣ 🚚 Home Delivery

User: 1
```

### Step 6.3: Select Pharmacy
```
Bot: Choose a pharmacy:
     1️⃣ MedPlus Pharmacy (1.2 km away)
     2️⃣ Apollo Pharmacy (2.5 km away)
     3️⃣ City Medical Store (3.1 km away)

User: 1
```

### Step 6.4: Confirm
```
Bot: 💊 Medicine Request Summary:
     ━━━━━━━━━━━━━━━━━━━━━
     1. Paracetamol 500mg x 10 tablets
        Dosage: 1 tablet twice a day after food
     2. Cetirizine 10mg x 5 tablets
        Dosage: 1 tablet at night

     🏪 Pickup from: MedPlus Pharmacy
     ━━━━━━━━━━━━━━━━━━━━━

     Confirm request?
     1️⃣ ✅ Yes  2️⃣ ❌ Cancel

User: 1

Bot: ✅ Medicine request submitted!
     You'll be notified when the pharmacy confirms.
     [Calls API: POST /public/patient/medicines]
```

---

## 🔷 FLOW 7: REQUEST LAB TEST

### Step 7.1: Add Tests
```
Bot: 🔬 Let's create a lab test request.
     What test do you need?

User: Complete Blood Count (CBC)

Bot: Any specific notes for the lab?

User: Fasting sample needed

Bot: Want to add another test?
     1️⃣ ➕ Yes  2️⃣ ✅ No

User: 1

Bot: What test?

User: Thyroid Profile (T3, T4, TSH)

Bot: Notes?

User: No

Bot: Want to add another?
     1️⃣ ➕ Yes  2️⃣ ✅ No

User: 2
```

### Step 7.2: Service Type
```
Bot: Where would you like to get tested?
     1️⃣ 🏥 Visit the Lab
     2️⃣ 🏠 Home Sample Collection

User: 2
```

### Step 7.3: Schedule
```
Bot: When should we collect the sample?
     Preferred date? (DD/MM/YYYY)

User: 08/04/2026

Bot: Preferred time?
     1️⃣ Morning (7 AM - 10 AM)
     2️⃣ Afternoon (12 PM - 3 PM)
     3️⃣ Evening (4 PM - 7 PM)

User: 1
```

### Step 7.4: Select Lab
```
Bot: Choose a diagnostic lab:
     1️⃣ PathCare Labs (1.5 km)
     2️⃣ SRL Diagnostics (3.2 km)
     3️⃣ Thyrocare Labs (4.8 km)

User: 1
```

### Step 7.5: Confirm
```
Bot: 🔬 Lab Test Request Summary:
     ━━━━━━━━━━━━━━━━━━━━━
     1. Complete Blood Count (CBC)
        Note: Fasting sample needed
     2. Thyroid Profile (T3, T4, TSH)

     🏠 Home Collection
     📅 08 Apr 2026, Morning
     🏥 Lab: PathCare Labs
     ━━━━━━━━━━━━━━━━━━━━━

     Confirm?
     1️⃣ ✅ Yes  2️⃣ ❌ Cancel

User: 1

Bot: ✅ Lab test request submitted!
     PathCare Labs will confirm shortly.
     [Calls API: POST /public/patient/tests]
```

---

## 🔷 FLOW 8: UPLOAD PRESCRIPTION / DOCUMENT

```
Bot: 📄 Upload a prescription or medical document.
     Please send the image or PDF.

User: [Sends photo of prescription]

Bot: 📷 Processing your document...
     [Calls API: POST with OCR extraction]

Bot: ✅ Document uploaded and processed!
     I extracted the following medicines:
     ━━━━━━━━━━━━━━━━━━━━━
     1. Amoxicillin 500mg - 1 cap x 3 times/day x 5 days
     2. Pantoprazole 40mg - 1 tab before breakfast x 7 days
     3. Vitamin D3 60K - 1 sachet per week x 4 weeks
     ━━━━━━━━━━━━━━━━━━━━━

     What would you like to do?
     1️⃣ 💊 Order these medicines
     2️⃣ 📋 Save to my records only
     3️⃣ 🔙 Back to menu

User: [Selects option]
```

---

## 🔷 FLOW 9: VIEW RECEIPTS & REPORTS

```
Bot: 🧾 Your Receipts & Reports:
     ━━━━━━━━━━━━━━━━━━━━━

     💊 Medicine Receipts:
     1️⃣ 05 Apr 2026 - MedPlus Pharmacy
        Paracetamol, Cetirizine - ₹150 (PAID ✅)

     🔬 Lab Reports:
     2️⃣ 03 Apr 2026 - PathCare Labs
        CBC Report - ₹500 (PAID ✅) 📥 Download

     3️⃣ 01 Apr 2026 - SRL Diagnostics
        Thyroid Profile - ₹800 (PENDING ⏳)

     Type a number to view details or download.

User: 2

Bot: 📄 CBC Report - 03 Apr 2026
     Lab: PathCare Labs
     Status: Completed & Paid

     📥 Here is your report: [Download Link]
     [Calls API: GET /public/patient/tests/:id/report]
```

---

## 🔷 FLOW 10: ASSISTANT WORKFLOW (Staff Bot)

### Step 10.1: Assistant Login
```
Bot: 🏥 Staff Portal
     Enter your email and password.

Email: assistant@clinic.com
Password: ****

Bot: ✅ Welcome, Assistant Rani!
     You are linked to Dr. Sharma.
     [Calls API: POST /auth/doctor/login]
```

### Step 10.2: Assistant Dashboard
```
Bot: Today's Schedule for Dr. Sharma:
     ━━━━━━━━━━━━━━━━━━━━━
     📅 7 Apr 2026 | 8 appointments

     ⏳ Waiting:
     1️⃣ #5 - Alok Kumar (11:00 AM) - Online
     2️⃣ #6 - Priya Patel (11:30 AM) - Walk-in

     ✅ Checked-in:
     3️⃣ #4 - Rahul Verma (10:30 AM) - Vitals done

     ✅ Completed:
     4️⃣ #1-#3 (3 patients seen)

     What would you like to do?
     1️⃣ Check-in a patient
     2️⃣ Add walk-in patient
     3️⃣ View patient details
     4️⃣ Refresh

User: 1
```

### Step 10.3: Patient Check-in & Vitals
```
Bot: Checking in patient #5 - Alok Kumar
     Please enter vitals:

     Blood Pressure? (e.g., 120/80)

User: 120/80

Bot: Temperature? (°F)

User: 101

Bot: Weight? (kg)

User: 72

Bot: SpO2? (%)

User: 98

Bot: Heart Rate? (bpm)

User: 76

Bot: Any chief complaint or notes?

User: Fever and headache since 2 days

Bot: ✅ Vitals recorded!
     ━━━━━━━━━━━━━━━━
     BP: 120/80 | Temp: 101°F
     Weight: 72 kg | SpO2: 98%
     HR: 76 bpm

     Refer to Dr. Sharma?
     1️⃣ ✅ Yes  2️⃣ ❌ Not yet

User: 1

Bot: ✅ Patient referred to Dr. Sharma!
     Dr. Sharma has been notified.
     [Calls API: POST /patients/:id/visit]
     [Triggers Socket.IO: patientReferred → Doctor]
```

---

## 🔷 FLOW 11: DOCTOR WORKFLOW (Staff Bot)

### Step 11.1: Doctor Notifications
```
Bot: 🔔 New Notification!
     Patient Alok Kumar has been referred by Assistant Rani.
     Vitals: BP 120/80, Temp 101°F

     1️⃣ 👀 View Full History
     2️⃣ ✅ Mark as Read
     3️⃣ 📋 Start Consultation

User: 3
```

### Step 11.2: Consultation
```
Bot: 📋 Consultation - Alok Kumar
     ━━━━━━━━━━━━━━━━━━━━━

     Today's Vitals:
     BP: 120/80 | Temp: 101°F | Weight: 72 kg

     Past Visits (last 3):
     • 20 Mar - Chest pain (ECG Normal)
     • 15 Feb - Routine checkup
     • 10 Jan - Skin rash

     Enter your clinical notes:

User: Viral fever. Advised hydration and rest.
      Prescribed Paracetamol 500mg TDS for 3 days.

Bot: Add diagnostic tests?
     1️⃣ ✅ Yes  2️⃣ ❌ No

User: 1

Bot: Test name?

User: CBC

Bot: ✅ CBC test added.
     Add another?
     1️⃣ Yes  2️⃣ No

User: 2

Bot: ✅ Consultation saved!
     [Calls API: POST /patients/:id/visit]
     [Calls API: POST /patients/:id/visits/:visitId/diagnostic-tests]
```

---

## 🔷 FLOW 12: LAB WORKFLOW

```
Bot: 🔬 Lab Dashboard - PathCare Labs
     ━━━━━━━━━━━━━━━━━━━━━

     📥 New Test Requests:
     1️⃣ Alok Kumar - CBC
        Requested: Today | Home Collection
        Status: PENDING

     2️⃣ Priya Patel - Thyroid Profile
        Requested: Yesterday | Lab Visit
        Status: ACCEPTED

     Select a request to manage:

User: 1

Bot: Request: CBC for Alok Kumar
     1️⃣ ✅ Accept Request
     2️⃣ ❌ Decline
     3️⃣ 📄 Upload Report (if completed)

User: 1

Bot: Expected completion time?

User: 4 hours

Bot: ✅ Request accepted! Patient has been notified.
     [Calls API: PATCH /orders/test-requests/:id]
```

---

## 🔷 FLOW 13: PHARMACY WORKFLOW

```
Bot: 💊 Pharmacy Dashboard - MedPlus
     ━━━━━━━━━━━━━━━━━━━━━

     📥 New Medicine Requests:
     1️⃣ Alok Kumar
        - Paracetamol 500mg x 10
        - Cetirizine 10mg x 5
        Mode: Pickup | Status: PENDING

     Select to manage:

User: 1

Bot: 1️⃣ ✅ Accept & Prepare
     2️⃣ ❌ Decline (out of stock)
     3️⃣ 💰 Mark as Paid & Complete

User: 1

Bot: ✅ Order accepted! Preparing medicines.
     Patient notified for pickup.
     [Calls API: PATCH /orders/medicine-requests/:id]
```

---

## 🔷 FLOW 14: DOCTOR AVAILABILITY MANAGEMENT

```
Bot: 🟢 Your current status: Available

     Update availability:
     1️⃣ 🟢 Available
     2️⃣ 🟡 Busy (taking consultations, no new bookings)
     3️⃣ 🔴 Unavailable (clinic closed)

User: 2

Bot: ✅ Status updated to Busy.
     No new online appointments will be accepted.
     [Calls API: PATCH /auth/doctor/availability]
```

---

## 🔷 API MAPPING REFERENCE

| Bot Flow | API Endpoint | Method |
|---|---|---|
| List Doctors | `/public/doctors` | GET |
| Family Login | `/public/family/login-or-create` | POST |
| Family Members | `/public/family/members` | GET/POST |
| Book Appointment | `/public/book-appointment` | POST |
| Send OTP | `/public/patient/send-otp` | POST |
| Verify OTP | `/public/patient/verify` | POST |
| Select Profile | `/public/patient/select-profile` | POST |
| Patient Profile | `/public/patient/profile` | GET |
| Request Medicine | `/public/patient/medicines` | POST |
| Request Lab Test | `/public/patient/tests` | POST |
| Upload Document | `/patients/:id/documents` | POST |
| Record Vitals/Visit | `/patients/:id/visit` | POST |
| Today's Appointments | `/appointments/doctor/today` | GET |
| Search Patient | `/patients/search` | GET |
| Doctor Availability | `/auth/doctor/availability` | PATCH |
| Medicine Requests (Pharmacy) | `/orders/medicine-requests` | GET/PATCH |
| Test Requests (Lab) | `/orders/test-requests` | GET/PATCH |
| OCR Extract | `/api/ocr/extract` | POST |

---

## 🔷 NOTIFICATION TRIGGERS

| Event | Who Gets Notified | Channel |
|---|---|---|
| New Online Booking | Doctor | Socket.IO + In-App |
| Patient Referred by Assistant | Doctor | Socket.IO + In-App |
| Medicine Request | Pharmacy | Dashboard |
| Lab Test Request | Lab | Dashboard |
| Report Uploaded | Patient | WhatsApp/Email |
| Payment Confirmed | Patient | WhatsApp/Email |

---

## 🔷 AUTHENTICATION SUMMARY

| User Type | Auth Method | Token Type |
|---|---|---|
| Patient | OTP via SMS/WhatsApp | Patient JWT |
| Doctor | Email + Password | Doctor JWT |
| Assistant | Email + Password | Doctor JWT (role: ASSISTANT) |
| Lab Manager | Email + Password | Doctor JWT (role: LAB_MANAGER) |
| Pharmacy | Email + Password | Doctor JWT (role: PHARMACY) |
| Super Admin | Email + Password | Doctor JWT (role: SUPER_ADMIN) |
