# TODO

## Done

- [x] KYC: dual document uploads (front + back) in `src/app/components/screens/KycScreen.tsx`
- [x] KYC: API payload typing in `src/app/api/client.ts` for `documentFrontRef` and `documentBackRef`
- [x] KYC backend: accept/echo front+back refs in `server/src/routes/kyc.ts`
- [x] Session UX: expired-session handling in the KYC submit path
- [x] NIN validation: enforce real Uganda 14-char NIN format (e.g. `CM8602410E8EWE`)
      across account creation, KYC, and the server — replaces the old "10-12 digit" rule.
      Shared helper: `src/app/lib/nin.ts` (client) / `server/src/lib/nin.ts` (server).
- [x] Smile ID: Enhanced KYC (NIN lookup) wired in `server/src/lib/smile-id.ts`,
      called from the KYC submit route. Config-gated + fail-safe.

## Smile ID — remaining to go live

- [ ] Add real `SMILE_PARTNER_ID` / `SMILE_API_KEY` secrets to the server env
      (kept out of the client bundle). See `server/.env.example`.
- [ ] Verify against the Smile ID sandbox with a real test NIN, then flip
      `SMILE_ENV=production`.
- [ ] (Optional) Move to the async callback flow + persist verification
      job references if higher throughput / audit history is needed.

## Document image storage

- [x] ID images are now uploaded and persisted server-side (`server/src/lib/storage.ts`),
      not just referenced by filename. The client sends base64 data URLs; the server
      re-validates type/size and writes them under `KYC_STORAGE_DIR` (git-ignored),
      storing the keys on the user record (`kyc_doc_front_ref` / `kyc_doc_back_ref`).
      Migration: `server/prisma/migrations/20260723140000_add_kyc_documents`.
- [ ] Production: replace the local-disk `saveKycImage` with object storage
      (S3 / Supabase Storage) with encryption at rest, and add an authenticated
      admin-only retrieval path (images must never be served publicly).
- [ ] (Optional) Feed the stored images to Smile ID Document Verification
      (job_type 6) for photo-based matching in addition to the NIN lookup.
