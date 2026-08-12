/*
 * DHD Livraison — admin drawer touch behavior.
 *
 * The imported admin UI owns the drawer state in React. This small compatibility
 * layer only translates touch gestures into the existing open/close buttons,
 * so navigation, routes and data behavior remain unchanged.
 */
(function () {
  const EDGE_GUARD_PX = 28;
  const OPEN_THRESHOLD_PX = 64;
  const CLOSE_THRESHOLD_PX = 72;
  const VERTICAL_TOLERANCE_PX = 1.2;

  let activeGesture = null;
  let boundRoot = null;

  function isAdminShell(root) {
    return root instanceof HTMLElement &&
      root.matches('.flex.h-\\[100dvh\\]') &&
      root.querySelector('[data-testid="button-open-menu"]');
  }

  function getShell() {
    const menuButton = document.querySelector('[data-testid="button-open-menu"]');
    const root = menuButton?.closest('.flex.h-\\[100dvh\\]');
    return isAdminShell(root) ? root : null;
  }

  function getParts() {
    const shell = getShell();
    if (!shell) return null;

    const drawer = shell.querySelector('.fixed.top-0.end-0.z-50');
    const panel = drawer?.querySelector('.w-\\[272px\\]');
    const menuButton = shell.querySelector('[data-testid="button-open-menu"]');
    const closeButton = panel?.querySelector('button[aria-label="Close menu"]');
    if (!(drawer instanceof HTMLElement) || !(panel instanceof HTMLElement) ||
        !(menuButton instanceof HTMLElement) || !(closeButton instanceof HTMLElement)) {
      return null;
    }

    const open = drawer.classList.contains('translate-x-0');
    return { shell, drawer, panel, menuButton, closeButton, open };
  }

  function isRtl(shell) {
    return shell.getAttribute('dir') === 'rtl';
  }

  function resetGesture(parts) {
    if (!parts) return;
    parts.drawer.classList.remove('is-dragging');
    parts.drawer.style.removeProperty('translate');
    parts.drawer.style.removeProperty('transform');
  }

  function closeDrawer(parts) {
    parts.closeButton.click();
    window.setTimeout(() => resetGesture(parts), 0);
  }

  function openDrawer(parts) {
    parts.menuButton.click();
    window.setTimeout(() => resetGesture(parts), 40);
  }

  function startEdgeGesture(event) {
    if (event.pointerType === 'mouse' || activeGesture) return;
    const parts = getParts();
    if (!parts || parts.open) return;

    const rtl = isRtl(parts.shell);
    const fromEdge = rtl
      ? window.innerWidth - event.clientX <= EDGE_GUARD_PX
      : event.clientX <= EDGE_GUARD_PX;
    if (!fromEdge) return;

    activeGesture = {
      eventTarget: window,
      parts,
      rtl,
      open: false,
      startX: event.clientX,
      startY: event.clientY,
      distance: 0,
    };
    parts.drawer.classList.add('is-dragging');
    window.addEventListener('pointermove', moveGesture, { passive: false });
    window.addEventListener('pointerup', endGesture, { once: true });
    window.addEventListener('pointercancel', cancelGesture, { once: true });
  }

  function startDrawerGesture(event) {
    if (event.pointerType === 'mouse' || activeGesture) return;
    const parts = getParts();
    if (!parts?.open) return;

    activeGesture = {
      eventTarget: parts.panel,
      parts,
      rtl: isRtl(parts.shell),
      open: true,
      startX: event.clientX,
      startY: event.clientY,
      distance: 0,
    };
    parts.drawer.classList.add('is-dragging');
    parts.panel.setPointerCapture?.(event.pointerId);
    parts.panel.addEventListener('pointermove', moveGesture, { passive: false });
    parts.panel.addEventListener('pointerup', endGesture, { once: true });
    parts.panel.addEventListener('pointercancel', cancelGesture, { once: true });
  }

  function moveGesture(event) {
    const gesture = activeGesture;
    if (!gesture) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;

    if (Math.abs(dy) > Math.abs(dx) * VERTICAL_TOLERANCE_PX) {
      cancelGesture();
      return;
    }

    event.preventDefault();
    const direction = gesture.rtl ? 1 : -1;
    const distance = Math.max(0, direction * dx);
    gesture.distance = distance;

    if (gesture.open) {
      gesture.parts.drawer.style.translate = 'none';
      gesture.parts.drawer.style.transform = `translateX(${direction * distance}px)`;
    } else {
      const progress = Math.min(100, (distance / Math.max(1, gesture.parts.drawer.offsetWidth)) * 100);
      const closedOffset = gesture.rtl ? 100 - progress : -100 + progress;
      gesture.parts.drawer.style.translate = 'none';
      gesture.parts.drawer.style.transform = `translateX(${closedOffset}%)`;
    }
  }

  function finishListeners() {
    window.removeEventListener('pointermove', moveGesture);
    window.removeEventListener('pointerup', endGesture);
    window.removeEventListener('pointercancel', cancelGesture);
  }

  function finishPanelListeners(parts) {
    parts?.panel.removeEventListener('pointermove', moveGesture);
    parts?.panel.removeEventListener('pointerup', endGesture);
    parts?.panel.removeEventListener('pointercancel', cancelGesture);
  }

  function endGesture() {
    const gesture = activeGesture;
    if (!gesture) return;
    activeGesture = null;
    finishListeners();
    finishPanelListeners(gesture.parts);

    const shouldTrigger = gesture.open
      ? gesture.distance >= CLOSE_THRESHOLD_PX
      : gesture.distance >= OPEN_THRESHOLD_PX;
    if (shouldTrigger) {
      gesture.open ? closeDrawer(gesture.parts) : openDrawer(gesture.parts);
    } else {
      resetGesture(gesture.parts);
    }
  }

  function cancelGesture() {
    const gesture = activeGesture;
    if (!gesture) return;
    activeGesture = null;
    finishListeners();
    finishPanelListeners(gesture.parts);
    resetGesture(gesture.parts);
  }

  function bindRoot(root) {
    if (boundRoot === root) return;
    boundRoot = root;
    root.addEventListener('pointerdown', startEdgeGesture, { passive: true });
    const drawer = root.querySelector('.fixed.top-0.end-0.z-50');
    drawer?.querySelector('.w-\\[272px\\]')?.addEventListener('pointerdown', startDrawerGesture, { passive: true });
  }

  const observer = new MutationObserver(() => {
    const root = getShell();
    if (root) bindRoot(root);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => {
    const root = getShell();
    if (root) bindRoot(root);
  }, 0);
})();