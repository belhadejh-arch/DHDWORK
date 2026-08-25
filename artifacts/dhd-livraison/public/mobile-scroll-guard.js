/*
 * Stops the browser's pull-to-refresh gesture only when a touch starts at the
 * top of the active page scroller. All normal vertical scrolling is left to
 * the browser, including finger-up gestures that move content downward.
 */
(function () {
  var startY = 0;
  var startTarget = null;
  var tracking = false;

  function findScrollParent(target) {
    var node = target instanceof Element ? target : null;

    while (node && node !== document.body) {
      var style = window.getComputedStyle(node);
      var canScroll = /(auto|scroll|overlay)/.test(style.overflowY) &&
        node.scrollHeight > node.clientHeight + 1;
      if (canScroll) return node;
      node = node.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  document.addEventListener('touchstart', function (event) {
    if (event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
    startTarget = event.target;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', function () {
    tracking = false;
    startTarget = null;
  }, { passive: true });

  document.addEventListener('touchcancel', function () {
    tracking = false;
    startTarget = null;
  }, { passive: true });

  document.addEventListener('touchmove', function (event) {
    if (!tracking || event.touches.length !== 1) return;

    var movedDown = event.touches[0].clientY - startY > 0;
    if (!movedDown) return;

    var target = startTarget instanceof Element ? startTarget : null;
    if (target && target.closest('.fixed.top-0.end-0.z-50, [role="dialog"]')) {
      return;
    }

    var scroller = findScrollParent(startTarget);
    if (scroller && scroller.scrollTop <= 0 && event.cancelable) {
      event.preventDefault();
    }
  }, { passive: false });
})();