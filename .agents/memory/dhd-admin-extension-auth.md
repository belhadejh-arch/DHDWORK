---
name: DHD admin extensions and authentication timing
description: Authentication timing constraint for global compatibility scripts in the compiled admin shell.
---

Global admin compatibility scripts can execute while the login screen is still active. Any authenticated account panel must retry identity loading after navigation/login instead of treating the first unauthenticated response as final.

**Why:** The same root HTML and scripts serve both login and authenticated admin routes. Caching an early empty `/api/auth/me` response prevents account UI from appearing after a successful client-side login.

**How to apply:** Cache only a valid authenticated identity. If identity is absent, permit later route or DOM changes to trigger another request.

Settings extensions must also wait for the exact Settings content container before mounting; never fall back to the outer `main` shell.

**Why:** Global scripts run before lazy route content is ready. Mounting into the shell during that gap places custom cards above the page title and makes them look like header content.

**How to apply:** Let the DOM observer retry until the route-specific container exists. Skip notification polling when no device session exists, and include the current bearer session on protected polling requests.