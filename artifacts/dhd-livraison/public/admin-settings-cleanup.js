(function () {
  'use strict';

  function isPaymentDayField(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    var input = node.querySelector && node.querySelector('input[name="paymentDayOfMonth"]');
    var text = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return Boolean(input) ||
      text.indexOf('يوم الدفع') >= 0 ||
      text.indexOf('payment day') >= 0 ||
      text.indexOf('jour de paiement') >= 0;
  }

  function removePaymentDayField(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('input[name="paymentDayOfMonth"]').forEach(function (input) {
      var field = input.closest('[data-slot="form-item"]') ||
        input.closest('.space-y-2') ||
        input.parentElement?.parentElement?.parentElement;
      if (field) field.remove();
    });

    root.querySelectorAll('label').forEach(function (label) {
      if (!isPaymentDayField(label.parentElement)) return;
      var field = label.closest('[data-slot="form-item"]') ||
        label.closest('.space-y-2') ||
        label.parentElement;
      if (field) field.remove();
    });
  }

  var observer = new MutationObserver(function () {
    if (/\/settings(?:$|\/)/i.test(window.location.pathname)) {
      removePaymentDayField(document);
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  removePaymentDayField(document);
})();