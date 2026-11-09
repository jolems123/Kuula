import tls from "node:tls";

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

function configured(name: string): string {
  return String(process.env[name] ?? "").trim();
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 15_000;

/**
 * Resend's HTTPS API is preferred when RESEND_API_KEY is set: hosting plans that block
 * outbound SMTP (Railway below Pro) still allow HTTPS. SMTP remains the fallback.
 */
function resendConfigured(): boolean {
  return Boolean(configured("RESEND_API_KEY") && configured("EMAIL_FROM"));
}

function smtpConfigured(): boolean {
  return Boolean(configured("SMTP_HOST") && configured("SMTP_USER") && configured("SMTP_PASSWORD") && configured("EMAIL_FROM"));
}

export function emailTransport(): "resend" | "smtp" | null {
  if (resendConfigured()) return "resend";
  if (smtpConfigured()) return "smtp";
  return null;
}

export function emailConfigured(): boolean {
  return emailTransport() !== null;
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function dotStuff(value: string): string {
  return value.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

async function sendWithResend(message: TransactionalEmail): Promise<{ accepted: boolean; detail: string }> {
  const from = configured("EMAIL_FROM");
  const fromName = configured("EMAIL_FROM_NAME") || "Kuula";
  const replyTo = message.replyTo || configured("SUPPORT_EMAIL") || from;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) throw new Error("Recipient email is invalid");

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${configured("RESEND_API_KEY")}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      from: `${safeHeader(fromName)} <${safeHeader(from)}>`,
      to: [safeHeader(message.to)],
      reply_to: safeHeader(replyTo),
      subject: safeHeader(message.subject),
      text: message.text,
    }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok || !body.id) {
    // Never include the API key or the message text; the status and Resend's reason are enough.
    return { accepted: false, detail: `Resend rejected the email (HTTP ${response.status}${body.name ? ` ${body.name}` : ""}${body.message ? `: ${body.message}` : ""})` };
  }
  return { accepted: true, detail: `Accepted by Resend (${body.id})` };
}

export async function sendTransactionalEmail(message: TransactionalEmail): Promise<{ accepted: boolean; detail: string }> {
  const transport = emailTransport();
  if (!transport) return { accepted: false, detail: "Transactional email is not configured" };
  if (transport === "resend") return sendWithResend(message);

  const host = configured("SMTP_HOST");
  const port = Number(configured("SMTP_PORT") || "465");
  const user = configured("SMTP_USER");
  const password = configured("SMTP_PASSWORD");
  const from = configured("EMAIL_FROM");
  const fromName = configured("EMAIL_FROM_NAME") || "Kuula";
  const replyTo = message.replyTo || configured("SUPPORT_EMAIL") || from;

  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT is invalid");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) throw new Error("Recipient email is invalid");

  return await new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
    socket.setEncoding("utf8");
    socket.setTimeout(15_000);

    let buffer = "";
    const queue: Array<{ expected: number[]; command?: string; resolve: (line: string) => void; reject: (error: Error) => void }> = [];

    function flush() {
      while (queue.length) {
        const match = buffer.match(/^(\d{3})([ -])([^\r\n]*)(?:\r?\n|$)/);
        if (!match) return;
        const code = Number(match[1]);
        const separator = match[2];
        const line = match[0];
        buffer = buffer.slice(line.length);
        if (separator === "-") continue;
        const current = queue.shift()!;
        if (!current.expected.includes(code)) {
          current.reject(new Error(`SMTP command rejected with status ${code}`));
          return;
        }
        current.resolve(line.trim());
      }
    }

    socket.on("data", (chunk) => { buffer += chunk; flush(); });
    const fail = (error: Error) => {
      for (const pending of queue.splice(0)) pending.reject(error);
      reject(error);
    };
    socket.on("error", fail);
    socket.on("close", () => fail(new Error("SMTP connection closed")));
    socket.on("timeout", () => socket.destroy(new Error("SMTP connection timed out")));

    const expect = (expected: number[], command?: string) => new Promise<string>((res, rej) => {
      queue.push({ expected, command, resolve: res, reject: rej });
      if (command) socket.write(command + "\r\n");
      flush();
    });

    (async () => {
      try {
        await expect([220]);
        await expect([250], `EHLO ${host}`);
        await expect([334], "AUTH LOGIN");
        await expect([334], Buffer.from(user).toString("base64"));
        await expect([235], Buffer.from(password).toString("base64"));
        await expect([250], `MAIL FROM:<${safeHeader(from)}>`);
        await expect([250, 251], `RCPT TO:<${safeHeader(message.to)}>`);
        await expect([354], "DATA");

        const body = [
          `From: ${safeHeader(fromName)} <${safeHeader(from)}>`,
          `To: <${safeHeader(message.to)}>`,
          `Reply-To: <${safeHeader(replyTo)}>`,
          `Subject: ${safeHeader(message.subject)}`,
          "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=utf-8",
          "Content-Transfer-Encoding: 8bit",
          "",
          dotStuff(message.text),
          "",
        ].join("\r\n");
        socket.write(body + "\r\n.\r\n");
        await expect([250]);
        await expect([221], "QUIT");
        socket.end();
        resolve({ accepted: true, detail: "Accepted by SMTP server" });
      } catch (error) {
        socket.destroy();
        reject(error);
      }
    })();
  });
}
