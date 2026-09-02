---
name: DHD mobile scrolling
description: The mobile scrolling contract for the imported Admin and Employee shells.
---

On phones, the imported Admin shell must release its fixed viewport height and inner page scroller so `html/body` own one natural document scroll. Fixed drawers, dialogs, notifications, and bottom navigation may remain bounded interaction surfaces.

**Why:** A `100dvh` flex shell with `overflow: hidden` plus an inner `overflow-y: auto` container creates competing touch scrollers. A global touch listener that calls `preventDefault()` at a scroll boundary can also make finger gestures feel frozen.

**How to apply:** Keep mobile overrides last in the shared responsive stylesheet, use `height: auto`, `max-height: none`, `overflow: visible`, and `touch-action: auto` for the page shell/content. Reserve bottom-navigation safe-area space in document flow, and do not load a global scroll guard.