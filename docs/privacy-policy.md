# denai — Privacy Policy

> This policy describes how denai stores, processes, and protects data entered during clinical workflow. It is written for clinicians who use denai to organize patient care.
>
> Last updated: 2026-05-18

---

## 1. Introduction

denai is an AI-assisted clinical workflow tool for dental clinicians. By design, patient data remains on your device unless you choose to enable cloud sync.

This local-first architecture means denai does not require an account, does not collect your patient data by default, and does not transmit clinical information without your action. Signing in and enabling cloud sync is entirely optional.

All data you enter — patient records, clinical inputs, workflow stages, and notes — is under your control.

---

## 2. What denai stores locally

When you use denai without signing in, all data is stored in your browser's local storage on your device. This includes:

- Patient records and clinical inputs (tooth, bone, hygiene, and condition data)
- Treatment pathway recommendations generated from those inputs
- Workflow stage and history
- Application preferences (theme, layout settings)
- Clinical notes you enter

**Local storage is managed by your browser.** Clearing your browser's site data, or using a browser's "clear history" feature, will permanently delete all local-only records. denai cannot recover them. If you intend to use denai across devices or as a long-term record, enabling cloud sync is recommended.

Local storage is not accessible to other websites and is not transmitted to denai or any third party during normal use without cloud sync enabled.

---

## 3. Optional cloud sync

Cloud sync is opt-in. It activates when you sign into a denai account. Once enabled, the following data is synchronized to a cloud database:

- Patient records and clinical state
- Encrypted clinical notes (see Section 4)
- Workflow stage (plan status, lab status)
- Application preferences

The following data is **not** synchronized and remains local only:

- Generated reports and report history
- Lab notes and device-specific workflow annotations
- Browser session state

Cloud sync depends on Supabase, a third-party cloud database platform (see Section 6). Availability is subject to Supabase's infrastructure. denai does not guarantee uninterrupted cloud sync service.

Signing out does not delete your local data. Local records persist on the device independently of account status.

---

## 4. Encrypted clinical notes

Clinical notes are the most sensitive data you enter into denai. When cloud sync is enabled, notes are encrypted on your device before upload.

**How encryption works:** Notes are encrypted using AES-GCM 256-bit symmetric encryption. The encryption key is derived from a passphrase you set, using PBKDF2 with 100,000 iterations and SHA-256. The passphrase is never transmitted to denai or Supabase. The derived key is held in memory only and is cleared when you sign out.

**What denai cannot access:** denai and Supabase never receive your passphrase and cannot decrypt your notes. The ciphertext stored in the cloud is opaque to us.

**Passphrase loss is permanent.** If you lose or forget your passphrase, encrypted notes stored in cloud sync **cannot be recovered**. There is no recovery mechanism. Your locally stored notes remain accessible on the device where they were entered, regardless of passphrase status.

Multi-device access to encrypted notes requires using the same passphrase on each device. Notes entered before encryption was set up are stored without encryption in the cloud sync record for that patient.

---

## 5. Accounts and authentication

Creating a denai account requires an email address and password. Authentication is managed by Supabase Auth. When you sign in, a session token is stored in your browser to maintain your session across page loads.

Your email address is used only for authentication. It is not used for marketing communications, shared with advertising networks, or sold to third parties.

---

## 6. Third-party services

**Supabase** is the only third-party service denai uses for cloud functionality. When cloud sync is enabled, patient records and encrypted notes are stored in a Supabase-managed database. Supabase processes this data under its own privacy policy and data processing terms, available at supabase.com.

denai does not use:

- Analytics or usage-tracking services
- Advertising or retargeting networks
- Third-party AI inference services — all recommendation processing runs client-side on your device
- Session recording or behavioral tracking tools

No patient data is transmitted to any AI provider, including Anthropic, OpenAI, or equivalent services.

---

## 7. Data control and deletion

**Exporting your data:** You can export all local patient records as a JSON file at any time from the account panel. This export includes all fields stored locally.

**Signing out:** Signing out clears your session token and encryption key. Your local patient data is not affected.

**Deleting a patient:** Deleting a patient from a signed-in session propagates the deletion to your cloud-synced records. The deletion is queued and executed on the next sync.

**Clearing browser storage:** Clearing your browser's site data removes all local-only records permanently. Cloud-synced records are not affected and will re-sync on your next sign-in.

**Account deletion:** To delete your denai account and associated cloud records, contact us at the address below. We will remove your account and cloud-stored data. Local records stored on your device must be cleared separately through your browser.

---

## 8. AI-generated recommendations

denai's recommendation engine analyzes clinical inputs — tooth position, bone level, hygiene status, and related factors — to generate treatment pathway suggestions. This processing runs entirely on your device. No clinical data is transmitted to an external AI service.

Recommendations are informational workflow aids. They are not diagnoses. They are not medical advice. They do not substitute for clinical judgment. The treating clinician is responsible for evaluating all recommendations in the context of individual patient care.

---

## 9. Changes to this policy

This policy may be updated as denai's architecture or data practices evolve. The date at the top of this document reflects the most recent revision. Continued use of denai after a policy update constitutes acceptance of the revised terms.

---

## 10. Contact

For questions about this policy, data requests, or account deletion:

**Email:** *(replace with published contact address before deployment)*

---

*Reviewed against: docs/terminology-governance.md — Phase 3C-ii*
