# Community Hero - Security Specification

## 1. Data Invariants
- A report must have a valid Creator UID (`createdBy`) matching the writing user's authenticated UID.
- The `createdAt` timestamp must be set using the server-side `request.time`.
- Every report must transition along a defined state path: Reported → Verified → In Progress → Resolved. Once status reaches "Resolved", it cannot be updated by normal users.
- Sub-collection verifications must be bound to the authenticated user's ID to prevent double-voting. Adding a verification must atomically increment the parent report's `verificationCount` field.

## 2. The Dirty Dozen Payloads (Targeting Exploits)
An attacker attempting malicious operations will be rejected with `PERMISSION_DENIED`'s under the following conditions:
1. **User Spoofing:** Submitting fields where `createdBy` is another user's UID.
2. **Title Injection:** A title exceeding 150 characters or containing empty strings.
3. **Pill-farming category injection:** Submitting a category not in the pre-approved enum.
4. **Incorrect severity range:** Providing custom severity levels other than Low, Medium, High.
5. **Backdated creation:** Submitting an arbitrary hardcoded timestamp in `createdAt` to falsify report history.
6. **Self-resolving issue:** Submitting a new report with status set directly to 'Resolved'.
7. **Phantom updates:** Attempting to update a report after its status has reached the terminal 'Resolved' value.
8. **Shadow field injection:** Writing undocumented fields into the document schema (e.g., `isVerifiedAdmin: true`).
9. **Spam verification:** Attempting to verification-spam a report by changing `verificationCount` without submitting a matching sub-collection verification document.
10. **Identity-hijacked Verification:** Submitting a verification document where `verifiedBy` does not match the authenticated user's UID.
11. **Spoofed Name length:** Submitting display name strings exceeding 128 characters.
12. **Double verification submission:** Submitting another verification document for the same `userId` on the same report.

## 3. Test Cases Configuration (Reference Spec)
See `firestore.rules` for constraints implementation, which will be validated by direct Firestore emulator testing during rule deployment.
