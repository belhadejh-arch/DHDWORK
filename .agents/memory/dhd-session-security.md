---
name: DHD session security
description: Durable authentication rule for DHD admin and employee access.
---

Do not restore predictable identity tokens or client-derived user IDs. Every authenticated request must resolve a server-persisted, expiring random session and then re-check the current account state.

**Why:** Deterministic ID-based tokens allowed a caller to impersonate an account by guessing its identifier, and a stale employee session could remain usable after deactivation.

**How to apply:** Create a random session at each successful login, revoke it on logout, and reject it when the referenced account is absent or inactive. Keep identity and authorization decisions on the API server.

Active DHD sessions use a long rolling lifetime so employees and admins do not re-enter credentials daily; transient network failures must not clear cached client identity, but an explicit API rejection must.

**Why:** The business requires accounts to remain open across browser and service restarts, while stale or disabled identities must still lose access.

**How to apply:** Persist the returned token in browser storage, renew the server-side expiry on authenticated use, keep cookies long-lived, and distinguish session rejection from temporary connectivity errors in the client.

WebView APKs may reopen `employee-login.html` as their initial URL; that entry page must validate `/api/auth/me` and redirect remembered employees to `/portal` before asking for credentials.

**Why:** A WebView can preserve the session correctly while still launching the login HTML page on every app start, which otherwise looks like a forced logout.

**How to apply:** Keep the login-page recovery path cookie-aware, preserve storage during network failures, and clear it only after an explicit invalid-session response or manual logout.