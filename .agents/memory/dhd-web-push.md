---
name: DHD Web Push
description: Durable constraints for the DHD Livraison external notification channel.
---

Web Push is optional at runtime until the deployment provides VAPID public key, private key, and subject secrets. The browser subscription must remain tied to the authenticated employee or admin, and invalid endpoints should be removed after provider rejection.

**Why:** Browser polling and in-page sound cannot notify a user who has closed the site; push delivery requires a service worker and server-side VAPID signing.

**How to apply:** Preserve the existing in-app notification record, read state, delete behavior, and sound; Web Push is an additional delivery channel, not a replacement.