import http from "node:http";
import crypto from "node:crypto";

const port = Number(process.env.FAKE_MARZPAY_PORT || 3999);
const transactions = new Map<string, { uuid: string; reference: string; amount: number; status: string; provider: string }>();

function multipartField(body: string, name: string): string {
  const marker = `name="${name}"`;
  const start = body.indexOf(marker);
  if (start < 0) return "";
  const valueStart = body.indexOf("\r\n\r\n", start);
  if (valueStart < 0) return "";
  const valueEnd = body.indexOf("\r\n", valueStart + 4);
  return body.slice(valueStart + 4, valueEnd < 0 ? undefined : valueEnd).trim();
}

const server = http.createServer((req, res) => {
  const getMatch = req.method === "GET" ? /^\/api\/v1\/transactions\/([0-9a-f-]{36})$/i.exec(req.url || "") : null;
  if (getMatch) {
    const transaction = transactions.get(getMatch[1]);
    if (!transaction) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "error", message: "Transaction not found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      event_type: transaction.status === "completed" ? "payment.completed" : "payment.processing",
      transaction: {
        uuid: transaction.uuid,
        reference: transaction.reference,
        status: transaction.status,
        amount: { raw: transaction.amount, currency: "UGX" },
        provider: transaction.provider,
      },
    }));
    return;
  }

  if (req.method !== "POST" || !["/api/v1/send-money", "/api/v1/collect-money"].includes(req.url || "")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "error", message: "Not found" }));
    return;
  }

  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  req.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const uuid = crypto.randomUUID();
    const reference = multipartField(body, "reference") || crypto.randomUUID();
    const amount = Number(multipartField(body, "amount") || 0);
    const phone = multipartField(body, "phone_number");
    const provider = phone.includes("75") || phone.includes("70") ? "airtel" : "mtn";
    transactions.set(uuid, { uuid, reference, amount, status: "completed", provider });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "success",
      message: "Transaction initiated successfully.",
      data: {
        transaction: {
          uuid,
          reference,
          status: "processing",
          provider_reference: `TEST-${uuid.slice(0, 8)}`,
        },
      },
    }));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Fake MarZPay listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
