import "dotenv/config";
import { Resend } from "resend";

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM_EMAIL ?? "outreach@kahlastudio.com";

if (!KEY) {
  console.warn("RESEND_API_KEY not set — email send will fail");
}

const client = KEY ? new Resend(KEY) : null;

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ id: string }> {
  if (!client) throw new Error("Resend not configured");
  const { data, error } = await client.emails.send({
    from: FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return { id: data?.id ?? "" };
}
