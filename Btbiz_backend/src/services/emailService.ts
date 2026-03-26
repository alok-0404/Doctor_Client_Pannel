import nodemailer from "nodemailer";

import { env } from "../config/env";

export interface SendEmailPayload {
  to: string;
  subject: string;
  text: string;
  attachment?: {
    filename: string;
    path: string;
    contentType?: string;
  };
}

export const sendEmailWithAttachment = async (
  payload: SendEmailPayload
): Promise<void> => {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
  } = env.smtp;

  // If SMTP is not configured, we don't throw—just log.
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    // eslint-disable-next-line no-console
    console.log("[EMAIL] SMTP not configured. Skipping email.", {
      to: payload.to,
      subject: payload.subject,
    });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    attachments: payload.attachment
      ? [
          {
            filename: payload.attachment.filename,
            path: payload.attachment.path,
            contentType: payload.attachment.contentType,
          },
        ]
      : undefined,
  });
};

