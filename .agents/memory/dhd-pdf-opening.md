---
name: DHD PDF opening
description: Durable rules for opening employee and admin payslip PDFs.
---

Payslip opening has two valid paths: authenticated blob download for the employee React portal, and a short-lived token URL for browser navigation from admin or legacy views. Both must return a non-empty `application/pdf` response.

**Why:** A new browser tab does not carry JavaScript Authorization headers, and opening only after an awaited fetch can be blocked as a popup.

**How to apply:** Open the tab synchronously from the click, then navigate it to a validated PDF blob; for direct links issue a single-use token and retain ownership checks on non-token requests.