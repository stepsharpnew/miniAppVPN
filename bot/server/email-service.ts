import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const host = (process.env.SMTP_HOST ?? "").trim();
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASS ?? "").trim();

  if (!host || !user || !pass) {
    throw new Error("SMTP not configured: set SMTP_HOST, SMTP_USER, SMTP_PASS");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

function getFromAddress(): string {
  return (
    (process.env.SMTP_FROM ?? "").trim() ||
    `MEME VPN <${(process.env.SMTP_USER ?? "noreply@example.com").trim()}>`
  );
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const t = getTransporter();

  await t.sendMail({
    from: getFromAddress(),
    to,
    subject: `${code} — код подтверждения MEME VPN`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;background:#0a0a1a;color:#e0e0ff;border-radius:12px">
        <h2 style="margin:0 0 8px;color:#fff">MEME VPN</h2>
        <p style="color:#aaa;margin:0 0 24px">Код подтверждения</p>
        <div style="text-align:center;padding:20px;background:#16163a;border-radius:10px;margin-bottom:20px">
          <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#4d8bff">${code}</span>
        </div>
        <p style="font-size:13px;color:#888;margin:0">Код действителен 15 минут.<br>Если вы не запрашивали код — просто проигнорируйте это письмо.</p>
      </div>
    `,
    text: `Ваш код подтверждения MEME VPN: ${code}\nКод действителен 15 минут.`,
  });
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  const t = getTransporter();

  await t.sendMail({
    from: getFromAddress(),
    to,
    subject: `${code} — сброс пароля MEME VPN`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;background:#0a0a1a;color:#e0e0ff;border-radius:12px">
        <h2 style="margin:0 0 8px;color:#fff">MEME VPN</h2>
        <p style="color:#aaa;margin:0 0 24px">Сброс пароля</p>
        <div style="text-align:center;padding:20px;background:#16163a;border-radius:10px;margin-bottom:20px">
          <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#ff6b6b">${code}</span>
        </div>
        <p style="font-size:13px;color:#888;margin:0">Код действителен 15 минут.<br>Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.</p>
      </div>
    `,
    text: `Код для сброса пароля MEME VPN: ${code}\nКод действителен 15 минут.`,
  });
}
