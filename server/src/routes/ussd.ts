import express from "express";

const router = express.Router();

router.use(express.urlencoded({ extended: false, limit: "16kb" }));

const textResponse = (res: express.Response, body: string): void => {
  res.type("text/plain").status(200).send(body);
};

router.post("/ussd", (req, res) => {
  const sessionId = String(req.body?.sessionId ?? "").trim();
  const serviceCode = String(req.body?.serviceCode ?? "").trim();
  const phoneNumber = String(req.body?.phoneNumber ?? "").trim();
  const text = String(req.body?.text ?? "").trim();

  if (!sessionId || !serviceCode || !phoneNumber) {
    textResponse(res, "END Unable to start Kuula USSD. Please try again later.");
    return;
  }

  if (!text) {
    textResponse(
      res,
      [
        "CON Welcome to Kuula",
        "1. Loan application help",
        "2. Repayment help",
        "3. Contact support",
        "4. Use Kuula app",
      ].join("\n")
    );
    return;
  }

  const firstChoice = text.split("*")[0];

  switch (firstChoice) {
    case "1":
      textResponse(
        res,
        "END For your loan application status, sign in securely at app.kuulapp.com. Kuula does not expose private loan details over unauthenticated USSD."
      );
      return;
    case "2":
      textResponse(
        res,
        "END For balances, due dates and repayments, use the secure Kuula app at app.kuulapp.com."
      );
      return;
    case "3":
      textResponse(res, "END Contact Kuula Support at support@kuulapp.com.");
      return;
    case "4":
      textResponse(res, "END Open https://app.kuulapp.com to access your Kuula account securely.");
      return;
    default:
      textResponse(res, "END Invalid selection. Please dial the Kuula USSD code again.");
  }
});

export default router;
