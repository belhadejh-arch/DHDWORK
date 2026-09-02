---
name: DHD mobile scroll QA
description: How to validate mobile scrolling in the imported DHD preview when legacy and source bundles coexist.
---

The artifact entry can load both the legacy compiled application and the current source entry. Mobile scroll fixes must therefore be validated against the DOM shell actually rendered in the browser, including the legacy employee shell, not only against source component class names.

**Why:** An unauthenticated route or a source-only fixture can hide the shell that users see; a real mobile viewport with touch input catches page-level scroll locks, nested scrollers, and horizontal overflow.

**How to apply:** Use a mobile browser context with touch enabled, mock only authentication/API responses when necessary, swipe upward and downward on each rendered shell, and assert page scroll movement plus `scrollWidth <= clientWidth`. Keep intentional drawer/list scrollers bounded separately.