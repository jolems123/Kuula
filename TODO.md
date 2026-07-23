# TODO

- [ ] Implement `POST /api/loans/:id/accept` in `server/src/routes/loans.ts` (offered -> active, repayment creation, disbursement transaction, wallet credit in one flow)
- [ ] Wire `api.acceptLoan` in `src/app/api/client.ts` to call backend acceptance endpoint
- [ ] Add `POST /api/loans/top-up` compatibility route in `server/src/routes/loans.ts` mapped to application submission logic
- [ ] Harden admin disbursement in `server/src/routes/admin.ts` to credit wallet when recording `loan_disbursement`
- [ ] Run verification: frontend/server typecheck, tests, and build
- [ ] Summarize fixes, verification output, and residual risks
