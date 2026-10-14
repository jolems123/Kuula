# Kuula KYC — direct identity capture

New customers sign up with phone, PIN and NIN, verify the SMS code, then submit
their Uganda National ID **front**, **back**, and a personal **portrait photograph**.
No Smile ID loader/token is used in the new customer-facing registration journey.

Before submission, each photo has a **Remove photo** control. Removing a photo
clears its preview and selection, including a pending conversion. Customers can
select it again or replace it. Cancelling the file picker preserves the previous
photo. Removal here applies to unsubmitted photos; submitted identity records
remain subject to the documented retention and review process.

Images are validated by signature/type and size, transmitted over HTTPS as
authenticated JSON, stored privately with server-side encryption in S3 in
production, and referenced by a versioned pending KYC submission.

The admin KYC queue allows only staff with both the relevant review and
document-view permissions to inspect all three photos and write a review
decision. Document previews are rendered through staff-authenticated,
no-store responses; viewing is audited. New manual submissions are never
automatically treated as verified. Rejected customers can resubmit.

A photograph is **not** liveness verification or proof of ID authenticity.
Staff must independently compare document front and back, NIN, date of birth,
names and portrait, and verify documents against reliable evidence before
marking verified. Lending remains blocked until KYC and underwriting complete.

## Operational testing
- Confirm phone OTP then test the three photo fields on Android, iOS and desktop.
- Confirm JPG, PNG and WEBP photo capture and image-size limits.
- Confirm invalid/reused images, duplicate NIN, unverified-phone submissions,
  repeated submissions pending review and unauthorized viewing are rejected.
- Verify 3-image review and approval, rejection, customer retry, and staff
  audit trails using isolated test identities, not real customer IDs.
- Run Prisma migration before deploying backend and web clients.
- Verify private S3 storage and encrypted backups; establish retention,
  consent, incident response and access policies for identity photographs.
- Confirm the removal of Smile ID scripts and third-party camera frames from
  live security headers; leave only signed legacy webhooks for prior captures.
