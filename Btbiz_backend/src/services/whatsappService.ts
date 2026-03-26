// Placeholder WhatsApp service – wire real provider (Twilio, Meta, etc.) later.
// For now we just log the OTP to the server console.

// In production, configure provider credentials via environment variables, e.g.:
// WHATSAPP_API_KEY, WHATSAPP_SENDER_ID, etc.
import { env } from "../config/env";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (last10.length !== 10) return raw;
  return `+91${last10}`;
}

async function tryPostToWhatsappWebhook(phone: string, message: string): Promise<boolean> {
  if (!env.whatsappWebhookUrl) return false;
  try {
    const normalized = normalizePhone(phone);
    await fetch(env.whatsappWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalized, message }),
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[WHATSAPP_WEBHOOK] failed:", err);
    return false;
  }
}

export const sendOtpToWhatsapp = async (
  phone: string,
  otp: string
): Promise<void> => {
  const sentToWebhook = await tryPostToWhatsappWebhook(phone, `Your OTP is: ${otp}`);
  if (sentToWebhook) return;
  const normalized = normalizePhone(phone);
  // eslint-disable-next-line no-console
  console.log(`[WHATSAPP_OTP] Sending OTP ${otp} to ${normalized}`);
}

export const sendWhatsAppMessage = async (
  phone: string,
  message: string
): Promise<void> => {
  const sentToWebhook = await tryPostToWhatsappWebhook(phone, message);
  if (sentToWebhook) return;
  const normalized = normalizePhone(phone);
  // eslint-disable-next-line no-console
  console.log(`[WHATSAPP_MSG] Sending message to ${normalized}: ${message}`);
}

