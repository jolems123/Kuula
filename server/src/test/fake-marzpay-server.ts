import http from "node:http";
import crypto from "node:crypto";

const port = Number(process.env.FAKE_MARZPAY_PORT || 3999);

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || !["/api/v1/send-money", "/api/v1/collect-money"].includes(req.url || "")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "error", message: "Not found" }));
    return;
  }

  // Consume the multipart body so the client completes normally. The Kuula
  // unit tests validate individual request fields; this stub validates the
  // end-to-end asynchronous state machine.
  req.on("data", () => {});
  req.on("end", () => {
    const uuid = crypto.randomUUID();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "success",
      message: "Transaction initiated successfully.",
      data: {
        transaction: {
          uuid,
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
