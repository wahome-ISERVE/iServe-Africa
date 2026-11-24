# iServe Africa IMS — Security Specification & Payload-First TDD

## 1. Data Invariants

1. **Identity & Email Verification**: All database mutations require an authenticated Firebase user with `request.auth.token.email_verified == true`.
2. **Path Variable Hardening**: Every document ID path parameter must match `^[a-zA-Z0-9_-]{1,128}$`.
3. **Self-Role Escalation Prevention**: Users cannot assign themselves privileged roles (`super_admin`, `executive_director`, `finance_officer`, `hr_officer`, etc.) during self-registration; only `super_admin` (including the bootstrapped org admin `wahome@iserveafrica.org`) may elevate or modify user roles and department assignments.
4. **PII Isolation**: Sensitive HR records (`employees` containing salary, next-of-kin, emergency contacts) and private `users` documents are readable only by the record owner, `hr_officer`, `executive_director`, `senior_management`, or `super_admin`.
5. **Separation of Duties**: Users cannot approve their own `financeTransactions`, `leaveRequests`, `procurementRequests`, or `apprenticeReports` (enforced via `existing().requestedBy != request.auth.uid` / `existing().userId != request.auth.uid` / `existing().apprenticeUserId != request.auth.uid`).
6. **Terminal State Locking**: Financial records in `paid` or `cancelled` state, leave requests in `approved` or `cancelled` state, and approved apprentice reports cannot be altered by non-admin staff.
7. **Immutable Audit Trail**: Entries in `auditLogs` are append-only (`allow update, delete: if false;`) and must carry `actorUid == request.auth.uid` and `createdAt == request.time`.
8. **Temporal Integrity**: `createdAt` and `updatedAt` timestamps on server-tracked documents must equal `request.time` on creation/update and `createdAt` is immutable on update.
9. **Bounded Lists**: Any array field (such as `viewerUids` or `tags`) is strictly capped (`size() <= 50`). Line items for POS sales are stored in `bookSaleItems` rather than unbounded arrays.

## 2. "Dirty Dozen" Adversarial Payloads

1. **Self-Privilege Escalation**: Creating `/users/{uid}` with `role: "super_admin"` as a non-admin user -> `PERMISSION_DENIED`.
2. **Ghost Field Injection (Shadow Update)**: Updating `/departments/{id}` with an undeclared field `isVerified: true` -> `PERMISSION_DENIED`.
3. **Unverified Email Spoofing**: Request with matching admin email where `email_verified: false` -> `PERMISSION_DENIED`.
4. **Path ID Poisoning**: Creating `/projects/abc$invalid!1500chars...` -> `PERMISSION_DENIED`.
5. **Blanket PII Read**: Reading `/employees/{otherEmpId}` as `staff_member` -> `PERMISSION_DENIED`.
6. **Self-Approval Bypass**: Updating `/financeTransactions/{txId}` status to `approved` where `requestedBy == request.auth.uid` -> `PERMISSION_DENIED`.
7. **Terminal State Mutation**: Editing `amountKes` on a `paid` transaction as a regular user -> `PERMISSION_DENIED`.
8. **Audit Log Tampering**: Attempting `update` or `delete` on `/auditLogs/{logId}` -> `PERMISSION_DENIED`.
9. **Backdated Timestamp Forgery**: Creating `/apprenticeReports/{id}` with `createdAt` set to a past client timestamp -> `PERMISSION_DENIED`.
10. **Negative Monetary Value**: Creating `/books/{id}` with `priceKes: -500` or `/financeTransactions/{id}` with `amountKes: -1` -> `PERMISSION_DENIED`.
11. **Oversized String Exhaustion**: Submitting `/documents/{id}` with a 500KB `summary` string -> `PERMISSION_DENIED`.
12. **Cross-User Notification Read**: Listing `/notifications` without matching `recipientUid == request.auth.uid` -> `PERMISSION_DENIED`.
