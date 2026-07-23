# Production Hardening & Full Coverage TODO

## Approval workflow implementation (current sprint)
- [ ] Add admin action endpoints in `server/src/routes/admin.ts`
  - [ ] `POST /api/admin/loans/:id/approve`
  - [ ] `POST /api/admin/loans/:id/reject`
  - [ ] `POST /api/admin/loans/:id/resubmit`
- [ ] Enforce safe state transitions and validation
  - [ ] Only reviewable statuses can be approved/rejected
  - [ ] Reject requires decision notes
- [ ] Implement side effects
  - [ ] Update status/decision fields/timestamps
  - [ ] Create applicant notification entries
  - [ ] Create repayment + disbursement transaction on approve
  - [ ] Persist audit history (or best available equivalent)

## Endpoint testing matrix (curl)
- [ ] Approval workflow lifecycle
  - [ ] Submit -> approve -> verify status
  - [ ] Submit -> reject -> verify status
  - [ ] Rejected -> resubmit -> verify status
- [ ] Role-access controls
  - [ ] Admin allowed
  - [ ] Manager/officer allowed (if seeded)
  - [ ] Customer forbidden on admin actions
- [ ] IDOR checks
  - [ ] Cross-user access blocked for data mutation
  - [ ] Cross-user reads blocked where required
- [ ] Consistency checks
  - [ ] Notification records match decisions
  - [ ] Loan/repayment/transaction state is coherent

## Remaining full 24-point closure checks
- [ ] Backend full matrix: loans/savings/messages/transactions/goals/notifications/admin
- [ ] Frontend full traversal of affected auth/KYC/admin/customer screens
- [ ] Mobile responsiveness checks
- [ ] Security sweep and release-readiness checks
  - [ ] Privacy policy link
  - [ ] Terms & conditions
  - [ ] Account deletion path
  - [ ] Secure auth/no exposed secrets
  - [ ] App icon/splash/prod config/error reporting
- [ ] Final lint/type/test/build pass
