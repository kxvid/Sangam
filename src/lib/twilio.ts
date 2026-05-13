import "dotenv/config";
import twilio from "twilio";

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_PHONE_NUMBER;

if (!sid || !token || !from) {
  console.warn("Twilio env vars missing — SMS send will fail");
}

const client = sid && token ? twilio(sid, token) : null;

export async function sendSMS(to: string, body: string): Promise<{ sid: string }> {
  if (!client || !from) throw new Error("Twilio not configured");
  const msg = await client.messages.create({ to, from, body });
  return { sid: msg.sid };
}
