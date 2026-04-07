/**
 * Email sending via nodemailer (SMTP).
 *
 * Configure via env vars:
 *   SMTP_HOST   — SMTP server hostname (e.g. smtp.gmail.com)
 *   SMTP_PORT   — Port, default 587
 *   SMTP_USER   — SMTP login
 *   SMTP_PASS   — SMTP password (for Gmail: use an App Password)
 *   SMTP_FROM   — Sender address, defaults to SMTP_USER
 *   APP_URL     — Base URL for reset links, default http://localhost:3001
 *
 * If SMTP is not configured, the reset link is printed to the server console
 * instead (useful for self-hosted / dev setups).
 */
import nodemailer from "nodemailer";

function isSmtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  username: string,
  resetToken: string,
): Promise<void> {
  const appUrl = (process.env.APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const resetLink = `${appUrl}/?reset_token=${resetToken}`;

  if (!isSmtpConfigured()) {
    // Fallback: print to console so a self-hosted admin can relay it manually
    console.log(
      `\n[Password Reset] No SMTP configured — token for ${username} (${toEmail}):\n  ${resetLink}\n`,
    );
    return;
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
  const transport = createTransport();

  await transport.sendMail({
    from: `"SQL Online IDE" <${from}>`,
    to: toEmail,
    subject: "Reset your password — SQL Online IDE",
    text: `Hi ${username},\n\nYou requested a password reset.\n\nClick the link below to set a new password (valid for 1 hour):\n${resetLink}\n\nIf you did not request this, you can ignore this email.\n`,
    html: `
      <p>Hi <strong>${username}</strong>,</p>
      <p>You requested a password reset for your SQL Online IDE account.</p>
      <p>
        <a href="${resetLink}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
          Reset my password
        </a>
      </p>
      <p style="font-size:12px;color:#888;">This link expires in 1 hour. If you did not request this, ignore this email.</p>
    `,
  });
}
