---
name: DHD session security
description: Durable authentication rule for DHD admin and employee access.
---

Do not restore predictable identity tokens or client-derived user IDs. Every authenticated request must resolve a server-persisted, expiring random session and then re-check the current account state.

**Why:** Deterministic ID-based tokens allowed a caller to impersonate an account by guessing its identifier, and a stale employee session could remain usable after deactivation.

**How to apply:** Create a random session at each successful login, revoke it on logout, and reject it when the referenced account is absent or inactive. Keep identity and authorization decisions on the API server.