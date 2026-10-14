import http from "node:http";
import crypto from "node:crypto";

// Stand-in for MarzPay in CI, answering in the shapes the official documentation gives
// (https://wallet.wearemarz.com/documentation). Status lookups report a transaction as
// "processing" until a test calls POST /__test/settle with its final state.
const port = Number(process.env.FAKE_MARZPAY_PORT || 3999);

interface Stored {
  uuid: string;
  kind: "disbursement" | "collection";
  ourReference: string;
  systemReference: string;
  amount: number;
  phone: string;
  status: string;
  createdAt: string;
}
const byUuid = new Map<string, Stored>();
// When set, the next money request is recorded but answered with a 502, simulating a
// response lost after MarzPay accepted the request.
let loseNextResponse = false;

function money(raw: number) {
  return { formatted: raw.toLocaleString("en-US", { minimumFractionDigits: 2 }), raw, currency: "UGX" };
}

function callbackShape(record: Stored) {
  const section = { provider: "mtn", phone_number: record.phone, amount: money(record.amount), provider_transaction_id: `FAKE-${record.uuid.slice(0, 8)}` };
  return {
    event_type: `${record.kind}.${record.status === "processing" ? "pending" : record.status}`,
    transaction: {
      uuid: record.uuid,
      reference: record.kind === "disbursement" ? record.systemReference : record.ourReference,
      ...(record.kind === "disbursement" ? { provider_reference: record.ourReference } : {}),
      status: record.status,
      amount: money(record.amount),
    },
    [record.kind]: section,
  };
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};

    if (req.method === "POST" && (url.pathname === "/api/v1/send-money" || url.pathname === "/api/v1/collect-money")) {
      const kind = url.pathname.endsWith("send-money") ? "disbursement" : "collection";
      const record: Stored = {
        uuid: crypto.randomUUID(),
        kind,
        ourReference: String(body.reference),
        systemReference: crypto.randomUUID(),
        amount: Number(body.amount),
        phone: String(body.phone_number),
        status: "processing",
        createdAt: new Date().toISOString(),
      };
      byUuid.set(record.uuid, record);
      if (loseNextResponse) {
        loseNextResponse = false;
        send(res, 502, { status: "error", error_code: "SERVER_ERROR", message: "Bad gateway" });
        return;
      }
      if (kind === "disbursement") {
        send(res, 201, {
          status: "success",
          message: "Withdrawal request submitted successfully!",
          data: {
            transaction: { uuid: record.uuid, reference: record.systemReference, provider_reference: record.ourReference, status: "pending" },
            withdrawal: { amount: money(record.amount), charge: money(500), total_deduction: money(record.amount + 500), provider: "mtn", phone_number: record.phone },
          },
        });
      } else {
        send(res, 201, {
          status: "success",
          message: "Collection initiated successfully.",
          data: {
            transaction: { uuid: record.uuid, reference: record.ourReference, status: "processing", provider_reference: null },
            collection: { amount: money(record.amount), provider: "mtn", phone_number: record.phone, mode: "live" },
          },
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/balance") {
      const raw = Number(process.env.FAKE_MARZPAY_BALANCE || 50_000_000);
      send(res, 200, { status: "success", data: { account: { available_balance: money(raw), balance: money(raw) }, metadata: { country_code: "UG", currency: "UGX", sandbox_mode: true } } });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/transactions") {
      const reference = url.searchParams.get("reference") || "";
      const day = url.searchParams.get("start_date") || "";
      const perPage = Math.min(100, Number(url.searchParams.get("per_page")) || 25);
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const matches = [...byUuid.values()].filter((record) => reference
        ? record.ourReference === reference || record.systemReference === reference
        : !day || record.createdAt.slice(0, 10) === day);
      const pageRows = matches.slice((page - 1) * perPage, page * perPage);
      send(res, 200, {
        status: "success",
        data: {
          transactions: pageRows.map((record) => ({
            uuid: record.uuid,
            type: record.kind === "disbursement" ? "withdrawal" : "collection",
            reference: record.kind === "disbursement" ? record.systemReference : record.ourReference,
            ...(record.kind === "disbursement" ? { provider_reference: record.ourReference } : {}),
            status: record.status,
            amount: money(record.amount),
          })),
          pagination: { current_page: page, last_page: Math.max(1, Math.ceil(matches.length / perPage)), per_page: perPage, total: matches.length },
        },
      });
      return;
    }

    const detail = /^\/api\/v1\/transactions\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (req.method === "GET" && detail) {
      const record = byUuid.get(detail[1]);
      if (!record) return send(res, 404, { status: "error", error_code: "NOT_FOUND", message: "Transaction not found" });
      send(res, 200, callbackShape(record));
      return;
    }

    // Test-only control: record a completed collection that Kuula did not initiate through
    // the app, e.g. a customer paying again after their loan was already settled.
    if (req.method === "POST" && url.pathname === "/__test/record-collection") {
      const record: Stored = {
        uuid: crypto.randomUUID(), kind: "collection", ourReference: String(body.reference), systemReference: crypto.randomUUID(),
        amount: Number(body.amount), phone: String(body.phone || "+256700000000"), status: "completed", createdAt: new Date().toISOString(),
      };
      byUuid.set(record.uuid, record);
      send(res, 200, callbackShape(record));
      return;
    }

    if (req.method === "POST" && url.pathname === "/__test/lose-next-response") {
      loseNextResponse = true;
      send(res, 200, { ok: true });
      return;
    }

    // Test-only control: set a transaction's final status, found by Kuula's reference.
    if (req.method === "POST" && url.pathname === "/__test/settle") {
      const record = [...byUuid.values()].find((item) => item.ourReference === body.reference);
      if (!record) return send(res, 404, { error: "unknown reference" });
      record.status = String(body.status || "completed");
      send(res, 200, callbackShape(record));
      return;
    }

    send(res, 404, { status: "error", message: "Not found" });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Fake MarZPay listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
