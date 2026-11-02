/**
 * Channel providers. Without credentials (or with dry_run on) messages are recorded
 * with status "mock" and are visible in the Messages screen, so the pipeline runs end to end.
 */
const env = process.env;
let transporter = null;

export const emailLive = () => !!env.SMTP_HOST;
export const whatsappLive = () => !!(env.WA_TOKEN && env.WA_PHONE_NUMBER_ID);

export function channelStatus(settings) {
  const dry = settings?.automation?.dry_run;
  return {
    email: dry ? 'dry-run' : emailLive() ? 'live' : 'mock',
    whatsapp: dry ? 'dry-run' : whatsappLive() ? 'live' : 'mock',
  };
}

async function getTransporter() {
  if (!transporter) {
    const nodemailer = (await import('nodemailer')).default;
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 465),
      secure: Number(env.SMTP_PORT || 465) === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/** `attachment`: { filename, content: Buffer } (PDF brochure/proposal). */
export async function sendEmail({ to, subject, text, html, replyTo, headers, attachment }, { dryRun } = {}) {
  if (dryRun || !emailLive()) return { status: 'mock', provider_id: `mock-email-${Date.now()}` };
  const t = await getTransporter();
  const attachments = attachment ? [{ filename: attachment.filename, content: attachment.content, contentType: 'application/pdf' }] : undefined;
  const info = await t.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to, subject, text, html, replyTo, headers, attachments });
  return { status: 'sent', provider_id: info.messageId };
}

/**
 * WhatsApp Cloud API. Outside the 24h customer-service window Meta only allows approved
 * templates, so we send `template` (name + body params). Inside the window we can send free text.
 * `document` ({ link, filename }) sends a PDF: as the template's DOCUMENT header, or as a
 * document message with the text as caption inside the session window.
 */
export async function sendWhatsApp({ to, text, templateName, params, sessionOpen, document }, { dryRun } = {}) {
  if (dryRun || !whatsappLive()) return { status: 'mock', provider_id: `mock-wa-${Date.now()}` };
  const url = `https://graph.facebook.com/${env.WA_API_VERSION || 'v21.0'}/${env.WA_PHONE_NUMBER_ID}/messages`;
  const recipient = to.replace('+', '');
  const payload = sessionOpen || !templateName
    ? document
      ? { messaging_product: 'whatsapp', to: recipient, type: 'document', document: { link: document.link, filename: document.filename, caption: text.slice(0, 1024) } }
      : { messaging_product: 'whatsapp', to: recipient, type: 'text', text: { body: text, preview_url: true } }
    : {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: templateName,
          language: { code: env.WA_TEMPLATE_LANG || 'en' },
          components: [
            ...(document ? [{ type: 'header', parameters: [{ type: 'document', document: { link: document.link, filename: document.filename } }] }] : []),
            { type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p || '-') })) },
          ],
        },
      };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `WhatsApp API HTTP ${res.status}`);
  return { status: 'sent', provider_id: data?.messages?.[0]?.id };
}
