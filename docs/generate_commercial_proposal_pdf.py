"""Generate BtBIZ Doctor commercial proposal PDF."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    CondPageBreak,
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT_PATH = Path(__file__).with_name("BtBIZ_Doctor_Commercial_Proposal.pdf")

NAVY = colors.HexColor("#0F3D4C")
TEAL = colors.HexColor("#1A6B7A")
INK = colors.HexColor("#1C2430")
MUTED = colors.HexColor("#5B6573")
RULE = colors.HexColor("#D5DCE3")
ROW = colors.HexColor("#F4F7F8")
HEADER_BG = colors.HexColor("#0F3D4C")
WHITE = colors.white
ACCENT_BG = colors.HexColor("#E8F2F4")


def register_fonts() -> tuple[str, str]:
    candidates = [
        (
            Path(r"C:\Windows\Fonts\calibri.ttf"),
            Path(r"C:\Windows\Fonts\calibrib.ttf"),
        ),
        (
            Path(r"C:\Windows\Fonts\arial.ttf"),
            Path(r"C:\Windows\Fonts\arialbd.ttf"),
        ),
        (
            Path(r"C:\Windows\Fonts\segoeui.ttf"),
            Path(r"C:\Windows\Fonts\segoeuib.ttf"),
        ),
    ]
    for regular, bold in candidates:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("Body", str(regular)))
            pdfmetrics.registerFont(TTFont("Body-Bold", str(bold)))
            return "Body", "Body-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = register_fonts()


def money(amount: str) -> str:
    """Keep rupee amounts readable even if a font lacks the symbol."""
    return amount.replace("₹", "Rs. ")


def styles():
    base = getSampleStyleSheet()
    s = {
        "cover_kicker": ParagraphStyle(
            "cover_kicker",
            fontName=FONT_BOLD,
            fontSize=9,
            tracking=1.2,
            textColor=TEAL,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            fontName=FONT_BOLD,
            fontSize=26,
            leading=32,
            textColor=NAVY,
            spaceAfter=8,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            fontName=FONT,
            fontSize=12,
            leading=17,
            textColor=MUTED,
            spaceAfter=4,
        ),
        "meta": ParagraphStyle(
            "meta",
            fontName=FONT,
            fontSize=9.5,
            leading=14,
            textColor=INK,
        ),
        "h1": ParagraphStyle(
            "h1",
            fontName=FONT_BOLD,
            fontSize=14,
            leading=18,
            textColor=NAVY,
            spaceBefore=16,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2",
            fontName=FONT_BOLD,
            fontSize=11.5,
            leading=15,
            textColor=TEAL,
            spaceBefore=12,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            fontName=FONT,
            fontSize=10,
            leading=14.5,
            textColor=INK,
            alignment=TA_JUSTIFY,
            spaceAfter=8,
        ),
        "body_left": ParagraphStyle(
            "body_left",
            fontName=FONT,
            fontSize=10,
            leading=14.5,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            fontName=FONT,
            fontSize=10,
            leading=14.5,
            textColor=INK,
            leftIndent=12,
            spaceAfter=3,
        ),
        "th": ParagraphStyle(
            "th",
            fontName=FONT_BOLD,
            fontSize=8.5,
            leading=12,
            textColor=WHITE,
        ),
        "td": ParagraphStyle(
            "td",
            fontName=FONT,
            fontSize=8.5,
            leading=12,
            textColor=INK,
        ),
        "td_bold": ParagraphStyle(
            "td_bold",
            fontName=FONT_BOLD,
            fontSize=8.5,
            leading=12,
            textColor=INK,
        ),
        "caption": ParagraphStyle(
            "caption",
            fontName=FONT,
            fontSize=8.5,
            leading=12,
            textColor=MUTED,
            spaceBefore=2,
            spaceAfter=10,
        ),
        "callout": ParagraphStyle(
            "callout",
            fontName=FONT,
            fontSize=10,
            leading=14.5,
            textColor=INK,
            alignment=TA_LEFT,
        ),
        "footer": ParagraphStyle(
            "footer",
            fontName=FONT,
            fontSize=8,
            textColor=MUTED,
            alignment=TA_LEFT,
        ),
        "page": ParagraphStyle(
            "page",
            fontName=FONT,
            fontSize=8,
            textColor=MUTED,
            alignment=TA_RIGHT,
        ),
        "sign": ParagraphStyle(
            "sign",
            fontName=FONT,
            fontSize=10,
            leading=16,
            textColor=INK,
        ),
        "center_muted": ParagraphStyle(
            "center_muted",
            fontName=FONT,
            fontSize=9,
            leading=13,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
    }
    return s


S = styles()


def p(text: str, style: str = "body") -> Paragraph:
    return Paragraph(money(text), S[style])


def table(headers, rows, col_widths, bold_last=False, emphasize_row=None):
    head = [Paragraph(money(h), S["th"]) for h in headers]
    data = [head]
    for i, row in enumerate(rows):
        cells = []
        for j, cell in enumerate(row):
            use_bold = (bold_last and i == len(rows) - 1) or (emphasize_row is not None and i == emphasize_row) or j == 0 and False
            style = "td_bold" if (bold_last and i == len(rows) - 1) or (j == 0 and False) else "td"
            if bold_last and i == len(rows) - 1:
                style = "td_bold"
            if emphasize_row is not None and i == emphasize_row:
                style = "td_bold"
            cells.append(Paragraph(money(str(cell)), S[style]))
        data.append(cells)

    t = Table(data, colWidths=col_widths, repeatRows=1)
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("ALIGN", (0, 0), (-1, 0), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.3, RULE),
        ("FONTNAME", (0, 1), (-1, -1), FONT),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            cmds.append(("BACKGROUND", (0, i), (-1, i), ROW))
        else:
            cmds.append(("BACKGROUND", (0, i), (-1, i), WHITE))
    if bold_last:
        cmds.append(("BACKGROUND", (0, -1), (-1, -1), ACCENT_BG))
    t.setStyle(TableStyle(cmds))
    return t


def callout_box(title: str, body: str):
    inner = Table(
        [
            [Paragraph(money(f"<b>{title}</b>"), S["callout"])],
            [Paragraph(money(body), S["callout"])],
        ],
        colWidths=[170 * mm],
    )
    inner.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), ACCENT_BG),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (0, 0), 10),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
                ("TOPPADDING", (0, 1), (-1, 1), 2),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return inner


def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    if doc.page > 1:
        canvas.setFillColor(NAVY)
        canvas.rect(0, h - 14 * mm, w, 14 * mm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont(FONT_BOLD, 8.5)
        canvas.drawString(18 * mm, h - 9 * mm, "BtBIZ Doctor  |  Commercial Proposal")
        canvas.setFont(FONT, 8)
        canvas.drawRightString(w - 18 * mm, h - 9 * mm, "Confidential")
        canvas.setFillColor(RULE)
        canvas.rect(0, 12 * mm, w, 0.4, fill=1, stroke=0)
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT, 8)
        canvas.drawString(18 * mm, 6.5 * mm, "Prices in INR. GST 18% extra. Quote valid 30 days.")
        canvas.drawRightString(w - 18 * mm, 6.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def cover_header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 42 * mm, w, 42 * mm, fill=1, stroke=0)
    canvas.setFillColor(TEAL)
    canvas.rect(0, h - 45 * mm, w, 3 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT, 9)
    canvas.drawString(18 * mm, h - 16 * mm, "CLINIC OPERATING SYSTEM")
    canvas.setFont(FONT_BOLD, 11)
    canvas.drawString(18 * mm, h - 24 * mm, "BtBIZ Doctor  ·  MediGraph")
    canvas.setFont(FONT, 8.5)
    canvas.drawRightString(w - 18 * mm, h - 16 * mm, "14 September 2026")
    canvas.drawRightString(w - 18 * mm, h - 24 * mm, "Quote valid 30 days")
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, w, 18 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont(FONT, 8)
    canvas.drawString(18 * mm, 8 * mm, "All prices in Indian Rupees. GST 18% extra.")
    canvas.drawRightString(w - 18 * mm, 8 * mm, "Prepared for clinic decision-makers")
    canvas.restoreState()


def build():
    doc = SimpleDocTemplate(
        str(OUT_PATH),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=22 * mm,
        bottomMargin=20 * mm,
        title="BtBIZ Doctor Commercial Proposal",
        author="BtBIZ Doctor",
        subject="Subscription and one-time pricing for a 2-doctor clinic pack with WhatsApp, lab and pharmacy",
    )

    story = []
    usable = 174 * mm

    # Cover content sits below the dark banner drawn on page 1
    story.append(Spacer(1, 28 * mm))
    story.append(p("COMMERCIAL PROPOSAL", "cover_kicker"))
    story.append(p("Clinic software for doctors,<br/>patients, lab and pharmacy", "cover_title"))
    story.append(
        p(
            "A family-number clinic OS: appointments, documents, live desk operations, "
            "lab and pharmacy workflows, and WhatsApp care from home.",
            "cover_sub",
        )
    )
    story.append(Spacer(1, 8 * mm))
    story.append(
        HRFlowable(width="100%", thickness=0.6, color=RULE, spaceAfter=10)
    )

    meta = table(
        ["Item", "Detail"],
        [
            ["Product", "BtBIZ Doctor (MediGraph)"],
            ["Standard package", "2-Doctor Clinic Pack"],
            ["Includes", "WhatsApp bot, lab module, pharmacy module, email, SMS, server"],
            ["Prepared for", "[Client name]"],
            ["Prepared by", "[Your company name]"],
            ["Date", "14 September 2026"],
            ["Quote valid until", "14 October 2026"],
            ["Taxes", "GST 18% extra on all fees"],
        ],
        [48 * mm, 126 * mm],
    )
    story.append(meta)
    story.append(Spacer(1, 8 * mm))
    story.append(
        callout_box(
            "How to read this document",
            "There are two ways to buy the same product: a monthly or yearly subscription, "
            "or a one-time license. Both are built around two doctors. If you add a third doctor later, "
            "you add a seat — you do not buy a new product.",
        )
    )

    story.append(PageBreak())

    # 1
    story.append(p("1. What this software does", "h1"))
    story.append(
        p(
            "BtBIZ Doctor is one system for the clinic and the patient’s family. "
            "It is not only an appointment calendar. Doctors, assistants, patients, "
            "the lab and the pharmacy work in the same record."
        )
    )
    story.append(p("For the patient", "h2"))
    story.append(
        p(
            "One mobile number becomes the family health account. The patient can log in, "
            "book a doctor, request lab tests, order medicines, upload documents and see health trends. "
            "They can do the same on WhatsApp by sending hi."
        )
    )
    story.append(p("For the doctor", "h2"))
    story.append(
        p(
            "Today’s and upcoming appointments, live booking alerts, availability "
            "(available / busy / unavailable), separate daily limits for online and walk-in patients, "
            "patient search inside the clinic, and prescription OCR."
        )
    )
    story.append(p("For the assistant", "h2"))
    story.append(
        p(
            "Walk-in registration, check-in, vitals, document verification before files go out, "
            "and messages to that day’s patients when the doctor’s status changes."
        )
    )
    story.append(p("For lab and pharmacy", "h2"))
    story.append(
        p(
            "Their own logins and queues. Patients can choose lab visit or home collection, "
            "and medicine pickup or home delivery. Status updates go back to the patient."
        )
    )
    story.append(p("WhatsApp (included in this quote)", "h2"))
    story.append(
        p(
            "A healthcare assistant on WhatsApp with seven services: book appointment; "
            "profile and visit history; family members; lab request; medicine order; "
            "upload prescription; and view receipts and reports."
        )
    )
    story.append(
        p(
            "This quote includes email, SMS, WhatsApp and a production server. "
            "Those are not treated as optional extras in the standard package."
        )
    )

    # 2
    story.append(p("2. Who this package is for", "h1"))
    story.append(
        p(
            "This is priced as a working clinic, not as a single-doctor trial app. "
            "The standard package is:"
        )
    )
    story.append(
        table(
            ["Included in the 2-Doctor Clinic Pack", "Quantity"],
            [
                ["Doctors", "2 seats"],
                ["Assistants", "2 seats"],
                ["Lab business", "1"],
                ["Pharmacy business", "1"],
                ["Clinic location", "1"],
                ["Typical daily load assumed", "30–50 patients across both doctors"],
            ],
            [110 * mm, 64 * mm],
        )
    )
    story.append(
        p(
            "If you have more doctors later, you add seats. You do not buy a new product.",
            "caption",
        )
    )

    # 3
    story.append(p("3. What is included in every paid plan", "h1"))
    story.append(
        table(
            ["Area", "Included"],
            [
                ["Doctor workspace", "Appointments, live alerts, availability, online vs walk-in limits, patient search, OCR"],
                ["Assistant desk", "Walk-in, check-in, vitals, document verify, doctor-status messaging"],
                ["Patient portal", "Family profiles, booking, lab, medicines, documents, health graphs"],
                ["Lab module", "Incoming tests, home collection, reports, payment status"],
                ["Pharmacy module", "Incoming orders, pickup or delivery, billing, receipts"],
                ["WhatsApp bot", "Full 7-service patient flow, OTP, doctor list, menu"],
                ["Email", "Transactional mail: reports, receipts, notices"],
                ["SMS", "OTP, booking confirmations and reminders, within the pack below"],
                ["Server", "Hosting, SSL, daily backup and monitoring on subscription; or monthly hosting on one-time"],
                ["Support", "Onboarding, training and support as per the plan"],
            ],
            [42 * mm, 132 * mm],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        p(
            "<b>Not included unless added:</b> extra clinic branches; extra lab or pharmacy businesses; "
            "an online payment gateway (Razorpay); custom hospital branding beyond clinic name and logo; "
            "on-site training beyond the agreed sessions; and marketing WhatsApp broadcasts.",
            "body_left",
        )
    )

    # 4
    story.append(p("4. Two ways to buy", "h1"))
    story.append(
        p(
            "You can subscribe monthly or yearly, or buy the software once. "
            "Both include the same product: two doctors, lab, pharmacy and WhatsApp."
        )
    )
    story.append(
        p(
            "Choose subscription if you want a lower starting cost and we run the server. "
            "Choose one-time if you want to own the license and pay a yearly maintenance fee."
        )
    )

    # 5
    story.append(p("5. Option A — Subscription (SaaS)", "h1"))
    story.append(
        p(
            "We host the software. You pay a one-time setup fee, then a monthly or yearly fee."
        )
    )
    story.append(p("5.1 Standard package: 2-Doctor Clinic Pack", "h2"))
    story.append(
        p("This is the package we recommend.")
    )
    story.append(
        table(
            ["Fee", "Amount"],
            [
                ["One-time setup and go-live", "Rs. 49,000"],
                ["Monthly", "Rs. 9,999"],
                ["Yearly (2 months free)", "Rs. 99,990"],
            ],
            [110 * mm, 64 * mm],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        p(
            "<b>Setup includes:</b> clinic name and logo; 2 doctor accounts; 2 assistant accounts; "
            "1 lab; 1 pharmacy; WhatsApp number and message templates; SMS DLT guidance; email setup; "
            "2 online training sessions; and the production server.",
            "body_left",
        )
    )
    story.append(p("Every month this pack includes", "h2"))
    story.append(
        table(
            ["Item", "Allowance"],
            [
                ["Doctor seats", "2"],
                ["Assistant seats", "2"],
                ["Lab", "1 business"],
                ["Pharmacy", "1 business"],
                ["SMS", "5,000 messages"],
                ["WhatsApp conversations", "3,000"],
                ["Transactional email", "Fair clinic use"],
                ["Document storage", "25 GB"],
                ["Support", "Phone / WhatsApp / email, next business day"],
            ],
            [90 * mm, 84 * mm],
        )
    )
    story.append(
        p(
            "If you stay within these limits, there is no extra bill.",
            "caption",
        )
    )

    story.append(p("5.2 Same product, priced per doctor", "h2"))
    story.append(
        p(
            "Use this if the clinic will grow doctor by doctor."
        )
    )
    story.append(
        table(
            ["Fee", "Amount"],
            [
                ["One-time setup (same go-live work)", "Rs. 49,000"],
                ["Per doctor, per month", "Rs. 4,999"],
                ["Minimum doctors", "2 (so month 1 is at least Rs. 9,998)"],
                ["Yearly per doctor", "Rs. 49,990"],
            ],
            [100 * mm, 74 * mm],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(
        p(
            "Lab, pharmacy, WhatsApp, the SMS pack (5,000), the WhatsApp pack (3,000), email and server "
            "stay included as long as you are on two or more doctors."
        )
    )
    story.append(
        table(
            ["Doctors", "Monthly software fee"],
            [
                ["2 doctors", "Rs. 9,998"],
                ["3 doctors", "Rs. 14,997"],
                ["4 doctors", "Rs. 19,996"],
            ],
            [90 * mm, 84 * mm],
        )
    )
    story.append(
        p(
            "The 2-Doctor Pack (Rs. 9,999) and two times the per-doctor rate (Rs. 9,998) are effectively the same. "
            "The pack is simply easier to put on an invoice.",
            "caption",
        )
    )

    story.append(p("5.3 Add-ons on subscription", "h2"))
    story.append(
        table(
            ["Add-on", "Price"],
            [
                ["Extra doctor on the 2-Doctor Pack", "Rs. 1,499 / month"],
                ["Extra doctor if you chose per-doctor billing", "Rs. 4,999 / month"],
                ["Extra assistant (beyond 2)", "Rs. 499 / month"],
                ["Extra lab or extra pharmacy", "Rs. 1,999 / month each"],
                ["Extra clinic branch", "Rs. 4,999 / month"],
                ["Extra 1,000 SMS", "Rs. 250"],
                ["Extra 1,000 WhatsApp conversations", "Rs. 499"],
                ["Extra 10 GB storage", "Rs. 200 / month"],
                ["Razorpay online payments", "Rs. 15,000 one-time + gateway fees (about 2%)"],
            ],
            [100 * mm, 74 * mm],
        )
    )

    # 6
    story.append(p("6. Option B — One-time license", "h1"))
    story.append(
        p(
            "You buy the software for one clinic. You do not pay a software rent every month. "
            "You do pay yearly maintenance, and you pay for hosting and messages."
        )
    )
    story.append(p("6.1 Standard package: 2-Doctor Clinic Pack", "h2"))
    story.append(
        table(
            ["Line", "Amount", "What it covers"],
            [
                [
                    "Software license (perpetual, 1 clinic)",
                    "Rs. 3,25,000",
                    "2 doctor seats, assistants, patient portal, lab, pharmacy, OCR, live alerts",
                ],
                [
                    "WhatsApp bot (7 services)",
                    "Rs. 75,000",
                    "Number setup, templates, bot flows connected to the clinic",
                ],
                [
                    "Go-live, training, DLT / SMS / email",
                    "Rs. 35,000",
                    "2 online training sessions, production deploy, DLT guidance",
                ],
                ["Total to start", "Rs. 4,35,000", "2-doctor clinic with WhatsApp, lab and pharmacy"],
            ],
            [62 * mm, 38 * mm, 74 * mm],
            bold_last=True,
        )
    )
    story.append(
        p("This is for two doctors. Extra doctor seats are below.", "caption")
    )

    story.append(p("6.2 Extra seats and units", "h2"))
    story.append(
        table(
            ["Item", "Amount"],
            [
                ["First 2 doctors", "Included in Rs. 4,35,000"],
                ["Each extra doctor (one-time)", "Rs. 25,000"],
                ["Each extra assistant beyond 2", "Rs. 8,000"],
                ["Extra lab or extra pharmacy business", "Rs. 40,000 one-time"],
                ["Extra clinic branch", "Rs. 1,25,000 one-time"],
            ],
            [110 * mm, 64 * mm],
        )
    )
    story.append(
        p("3-doctor example: Rs. 4,35,000 + Rs. 25,000 = Rs. 4,60,000 to start.", "caption")
    )

    story.append(p("6.3 Hosting and messages after purchase", "h2"))
    story.append(
        p(
            "The license is the software. Running it still needs a server and SMS / WhatsApp."
        )
    )
    story.append(p("Hosting — choose one", "h2"))
    story.append(
        table(
            ["Option", "Amount", "Notes"],
            [
                [
                    "We host for you",
                    "Rs. 3,499 / month",
                    "Server, SSL, backup, updates to the live server",
                ],
                [
                    "You provide a VPS",
                    "Rs. 18,000 one-time deploy",
                    "Your cloud bill is separate (typically Rs. 2,500–4,500 / month)",
                ],
            ],
            [48 * mm, 48 * mm, 78 * mm],
        )
    )
    story.append(Spacer(1, 3 * mm))
    story.append(p("Communication wallet (billed on actual use)", "h2"))
    story.append(
        table(
            ["Item", "Typical monthly", "Overage / prepaid rate"],
            [
                ["SMS", "Rs. 600–900", "Rs. 0.25 per SMS after any prepaid pack"],
                ["WhatsApp", "Rs. 2,500–4,000", "Rs. 0.50 per conversation after prepaid pack"],
                ["Email", "Rs. 50–200", "Included in hosting if we host"],
            ],
            [42 * mm, 52 * mm, 80 * mm],
        )
    )
    story.append(
        p(
            "You can prepay a wallet (for example Rs. 10,000) and we deduct from it.",
            "caption",
        )
    )

    story.append(p("6.4 Yearly AMC (required)", "h2"))
    story.append(
        table(
            ["Item", "Amount"],
            [
                [
                    "Software maintenance (updates, bug fixes, support 10:00–18:00 IST, weekdays)",
                    "Rs. 65,000 / year",
                ],
                [
                    "Optional prepaid SMS + WhatsApp starter wallet",
                    "Rs. 36,000 / year (adjusts against actual use)",
                ],
            ],
            [118 * mm, 56 * mm],
        )
    )
    story.append(
        p(
            "AMC starts after 90 days of go-live. The first three months of support are included in the license. "
            "Without AMC we cannot keep WhatsApp templates, SMS DLT, security patches or server support.",
            "caption",
        )
    )

    # 7
    story.append(p("7. Side-by-side: 2-Doctor Pack", "h1"))
    story.append(
        p(
            "WhatsApp, lab and pharmacy included. Figures exclude GST. "
            "Subscription yearly assumes you pay annually."
        )
    )
    story.append(
        table(
            ["", "Subscription", "One-time license"],
            [
                ["To start", "Rs. 49,000", "Rs. 4,35,000"],
                [
                    "Software fee, year 1",
                    "Rs. 99,990 (or Rs. 9,999 × 12 = Rs. 1,19,988)",
                    "Included in the license",
                ],
                [
                    "Hosting, year 1",
                    "Included",
                    "Rs. 3,499 × 12 = Rs. 41,988 if we host",
                ],
                [
                    "WhatsApp + SMS, year 1",
                    "Included up to the packs",
                    "Usage, typically Rs. 36,000–48,000",
                ],
                [
                    "AMC, year 1",
                    "Not applicable",
                    "Rs. 65,000 (from month 4; often invoiced in year 1)",
                ],
                [
                    "Typical money out in year 1",
                    "About Rs. 1.5–1.7 lakh",
                    "About Rs. 5.8–6.0 lakh",
                ],
                [
                    "Year 2 and year 3",
                    "Rs. 99,990 per year + overage if any",
                    "AMC Rs. 65,000 + hosting ~Rs. 42,000 + messages ~Rs. 40,000 ≈ Rs. 1.5 lakh / year",
                ],
                [
                    "Three-year total (typical)",
                    "About Rs. 3.5–3.8 lakh",
                    "About Rs. 8.8–9.0 lakh",
                ],
            ],
            [48 * mm, 63 * mm, 63 * mm],
            bold_last=True,
        )
    )
    story.append(Spacer(1, 4 * mm))
    story.append(
        callout_box(
            "In short",
            "Subscription is cheaper over three years and easier to start. "
            "One-time costs more up front. You hold a perpetual license for that clinic.",
        )
    )

    # 8
    story.append(p("8. What we assume in these numbers", "h1"))
    bullets = [
        "One clinic, one city, Indian mobile numbers.",
        "About 30–50 patients a day across both doctors.",
        "SMS: OTP, booking confirm and reminder. Not promotional bulk SMS.",
        "WhatsApp: patient-initiated chat plus utility messages (OTP, booking, status). Not ads.",
        "Email: reports and receipts, not newsletters.",
        "Payments inside lab and pharmacy today are mark as paid (cash or UPI at the counter). Online collect via Razorpay is an add-on.",
        "Data stays on an Indian or Mumbai-region server unless you ask otherwise.",
        "Quote is for the product as a clinic OS. Hospital IPD, insurance TPA and government scheme billing are not in this price.",
    ]
    for b in bullets:
        story.append(p(f"•  {b}", "bullet"))
    story.append(Spacer(1, 2 * mm))
    story.append(
        p(
            "If the clinic is much busier (for example 80+ patients a day), SMS and WhatsApp packs will run out "
            "and overage applies. We will set a monthly cap with you so there are no surprises."
        )
    )

    # 9
    story.append(p("9. Go-live you will see", "h1"))
    steps = [
        "Accounts for 2 doctors, assistants, lab and pharmacy.",
        "Patient web portal.",
        "Production server with HTTPS and backup.",
        "Email sending.",
        "SMS (DLT templates; the TRAI DLT entity fee is paid to the operator, about Rs. 5,000–6,000, usually by the clinic).",
        "WhatsApp Business / BSP number and the 7-service bot.",
        "Two training sessions.",
        "14-day supervised pilot.",
    ]
    for i, step in enumerate(steps, 1):
        story.append(p(f"{i}.  {step}", "bullet"))
    story.append(Spacer(1, 2 * mm))
    story.append(p("Typical timeline after advance: <b>3–4 weeks</b>."))

    # 10
    story.append(p("10. Payment terms", "h1"))
    story.append(p("Subscription", "h2"))
    story.append(
        p(
            "50% of setup with the work order, 50% of setup on go-live. "
            "The first month (or the first year if annual) is due on go-live. Then in advance each period."
        )
    )
    story.append(p("One-time license", "h2"))
    story.append(
        p(
            "40% with the work order, 40% when UAT (test clinic) is ready, 20% on production go-live. "
            "Hosting is billed monthly. AMC is billed yearly in advance."
        )
    )
    story.append(
        p("Work starts after the first payment. This quote is valid for 30 days from the date on the cover.")
    )

    # 11
    story.append(p("11. Our recommendation", "h1"))
    story.append(
        callout_box(
            "For most clinics: Option A, 2-Doctor Clinic Pack",
            "Setup Rs. 49,000, then Rs. 9,999 per month, or Rs. 99,990 per year. "
            "Extra doctor later: Rs. 1,499 per month. "
            "Choose Option B (Rs. 4,35,000 one-time) only if the clinic clearly wants to own the license "
            "and is comfortable with yearly AMC plus hosting.",
        )
    )

    # 12
    story.append(p("12. How to proceed", "h1"))
    story.append(
        p(
            "Tick one option, fill the clinic details, and return a signed copy. "
            "A work order and invoice will follow."
        )
    )

    options = [
        [
            "Subscribe — 2-Doctor Pack (monthly)",
            "Setup Rs. 49,000 + Rs. 9,999 / month",
        ],
        [
            "Subscribe — 2-Doctor Pack (yearly)",
            "Setup Rs. 49,000 + Rs. 99,990 / year",
        ],
        [
            "Subscribe — per doctor",
            "Setup Rs. 49,000 + Rs. 4,999 per doctor / month (minimum 2)",
        ],
        [
            "Buy once — 2-Doctor Pack",
            "Rs. 4,35,000 + Rs. 3,499 / month hosting + Rs. 65,000 / year AMC",
        ],
    ]
    opt_rows = []
    for title, detail in options:
        opt_rows.append(
            [
                Paragraph("☐", S["td_bold"]),
                Paragraph(money(f"<b>{title}</b><br/>{detail}"), S["td"]),
            ]
        )
    opt_table = Table(opt_rows, colWidths=[12 * mm, 162 * mm])
    opt_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("BOX", (0, 0), (-1, -1), 0.4, RULE),
                ("LINEBELOW", (0, 0), (-1, -2), 0.3, RULE),
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT_BG),
                ("BACKGROUND", (0, 2), (-1, 2), ACCENT_BG),
            ]
        )
    )
    story.append(opt_table)
    story.append(Spacer(1, 8 * mm))

    sign = [
        ["Clinic name", "________________________________"],
        ["Number of doctors at start", "________________________________"],
        ["Signatory name and title", "________________________________"],
        ["Date", "________________________________"],
        ["Signature", "________________________________"],
    ]
    sign_data = [
        [
            Paragraph(f"<b>{a}</b>", S["sign"]),
            Paragraph(b, S["sign"]),
        ]
        for a, b in sign
    ]
    sign_table = Table(sign_data, colWidths=[62 * mm, 112 * mm])
    sign_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LINEBELOW", (0, 0), (-1, -1), 0.25, RULE),
            ]
        )
    )
    story.append(sign_table)
    story.append(Spacer(1, 10 * mm))
    story.append(
        HRFlowable(width="100%", thickness=0.6, color=NAVY, spaceAfter=8)
    )
    story.append(
        p(
            "End of proposal. This document is a commercial offer, not a tax invoice. "
            "Replace the placeholder names on the cover before sending to a client.",
            "center_muted",
        )
    )

    def first_page(canvas, doc):
        cover_header_footer(canvas, doc)

    def later_pages(canvas, doc):
        header_footer(canvas, doc)

    doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    build()
