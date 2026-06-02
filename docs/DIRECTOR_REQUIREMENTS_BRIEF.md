# Director Requirements — Brief & Objectives

**Product:** MediGraph / BtBIZ Health Platform  
**Source:** Director feedback (28 May 2026)  
**Status:** Requirements capture — not yet implemented  
**Purpose:** Align team on *what* we need to build and *why*.

---

## Summary

Six enhancement areas: richer patient history from assistant workflows, repeat-visit analytics at one clinic, vitals trends as charts/graphs, medicine substitution support, time-based alerts, and a clearly separated pharmacy operating model.

---

## 1. Assistant data → Patient profile (pre-history)

**Requirement (original):** Migrate assistant to patient profile pre history record.

**Objective:**  
When the assistant captures check-in data (vitals, notes, documents, referral context), that information should appear automatically on the **patient profile** as structured **pre-consult / pre-history** — before and after the doctor visit — so the doctor and patient see one continuous record.

**Success looks like:**
- Assistant-entered vitals and notes are linked to the correct patient and visit.
- Patient profile shows a clear “pre-visit” section (who checked in, when, what was recorded).
- No duplicate manual entry on doctor or patient side.

---

## 2. Repeat visits at the same clinic (analytics)

**Requirement (original):** Ek hi clinic par bar bar jaye… analysis hoga.

**Objective:**  
Track patients who visit the **same clinic repeatedly** and provide **visit analytics** (frequency, gaps between visits, reasons, outcomes) so the clinic can understand loyalty, chronic follow-up, and care patterns.

**Success looks like:**
- Per-patient visit count and timeline at one clinic/tenant.
- Simple analytics view: first visit, last visit, total visits, average gap.
- Foundation for later reports (chronic care, retention, revenue per returning patient).

---

## 3. Vitals as charts and graphs (e.g. BP)

**Requirement (original):** BP, blood pressure all chart ke form me… or graph ke form me.

**Objective:**  
Show historical vitals — especially **blood pressure** and related measures — as **tables, charts, and graphs** on the patient profile so trends are visible at a glance (not only last reading).

**Success looks like:**
- Time-series view for BP (systolic/diastolic), and extensible to weight, sugar, temp, etc.
- Data sourced from assistant/doctor visit records.
- Doctor and (where appropriate) patient can see trend over weeks/months.

---

## 4. Medicine substitution

**Requirement (original):** Substitution of medical.

**Objective:**  
Support **medicine substitution** when the requested drug is unavailable or a clinically acceptable alternative is used — with clear record of **original vs substituted** medicine for pharmacy, doctor, and patient traceability.

**Success looks like:**
- Pharmacy (or authorized role) can mark substitute with reason.
- Patient order / prescription shows both requested and dispensed items.
- Audit trail for compliance and disputes.

---

## 5. Alerts in a particular time period

**Requirement (original):** Alert in particular time period.

**Objective:**  
Send **scheduled or rule-based alerts** within defined **time windows** (e.g. appointment reminders, medicine intake, follow-up due, lab report ready) via channels the product already uses (in-app, notification, and/or WhatsApp bot where configured).

**Success looks like:**
- Configurable alert types and time periods (e.g. 24h before appointment, daily medicine reminder).
- Patient/clinic can see what was sent and when.
- Reduces no-shows and improves adherence.

---

## 6. Pharmacy department — separate working

**Requirement (original):** Pharmacy department separate working.

**Objective:**  
Pharmacy operates as a **distinct operational unit** in the platform: own login, own incoming orders, walk-in billing, and workflows — **without mixing** with clinic assistant or lab screens, while still sharing the same patient record when orders are linked.

**Success looks like:**
- Dedicated pharmacy dashboard and roles (already partially in place — strengthen isolation and reporting).
- Clear separation from clinic OPD and lab queues.
- Super Admin can onboard pharmacy tenants independently.
- Patient medicine requests route only to the selected pharmacy.

---

## Cross-cutting principles

| Principle | Application |
|-----------|-------------|
| **Single patient record** | Assistant, doctor, lab, pharmacy, and bot write to one timeline. |
| **Role separation** | Clinic vs lab vs pharmacy vs Super Admin — each sees only their work. |
| **Actionable data** | Charts, analytics, and alerts must drive decisions, not just display raw fields. |

---

## Suggested phasing (optional)

| Phase | Items | Rationale |
|-------|--------|-----------|
| **Phase A** | (1) Assistant → profile pre-history; (6) Pharmacy separation hardening | Builds on existing flows; high daily impact. |
| **Phase B** | (3) Vitals charts/graphs; (2) Repeat-visit analytics | Needs stable vitals + visit data from Phase A. |
| **Phase C** | (4) Medicine substitution; (5) Time-based alerts | Rules, notifications, and pharmacy integration. |

---

## Open questions for director (clarification)

1. **Analytics:** Clinic-level dashboard only, or also doctor-level and Super Admin aggregates?  
2. **Substitution:** Who can approve — pharmacy only, or doctor sign-off required?  
3. **Alerts:** WhatsApp only, or also SMS/email? Who configures templates — clinic or platform?  
4. **Charts:** Visible to patient on profile, or doctor/assistant only?

---

*Document version: 1.0 — requirements brief for internal planning.*
