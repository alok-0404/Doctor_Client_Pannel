// Placeholder WhatsApp service – wire real provider (Twilio, Meta, etc.) later.
// For now we just log the OTP to the server console.

// In production, configure provider credentials via environment variables, e.g.:
// WHATSAPP_API_KEY, WHATSAPP_SENDER_ID, etc.

export const sendOtpToWhatsapp = async (
  phone: string,
  otp: string
): Promise<void> => {
  // eslint-disable-next-line no-console
  console.log(`[WHATSAPP_OTP] Sending OTP ${otp} to ${phone}`);
}

