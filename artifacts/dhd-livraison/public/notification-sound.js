/*
 * Shared notification and attendance sound layer.
 * It intentionally lives outside the imported bundles so it covers both the
 * employee portal and the legacy admin screens without changing their APIs.
 */
(function () {
  'use strict';

  const SOUND_PATH = '/notification-sound.mp3';
  const SETTING_KEY = 'dhd_notification_sounds_enabled';
  const PLAYED_KEY = 'dhd_notification_sound_played';
  const POLL_MS = 15000;
  const audio = new Audio(SOUND_PATH);
  audio.preload = 'auto';
  let enabled = localStorage.getItem(SETTING_KEY) !== 'false';
  let audioUnlocked = false;
  let notificationBaselineReady = false;
  let playedIds = readPlayedIds();
  let lastAttendanceSoundAt = 0;
  let attendanceClickLocked = false;

  function readPlayedIds() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(PLAYED_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map(String).slice(-200) : []);
    } catch {
      return new Set();
    }
  }

  function rememberPlayed(id) {
    playedIds.add(String(id));
    while (playedIds.size > 200) playedIds.delete(playedIds.values().next().value);
    try {
      sessionStorage.setItem(PLAYED_KEY, JSON.stringify(Array.from(playedIds)));
    } catch {
      // Storage can be unavailable in restricted WebViews.
    }
  }

  function playSound() {
    if (!enabled || !audioUnlocked) return;
    audio.currentTime = 0;
    const result = audio.play();
    if (result && typeof result.catch === 'function') result.catch(() => undefined);
  }

  // Browsers require a user gesture before audio can play. Loading the audio
  // after the first gesture means later server events can play it normally.
  document.addEventListener('pointerdown', function unlockAudio() {
    audioUnlocked = true;
    audio.load();
    document.removeEventListener('pointerdown', unlockAudio);
  }, { once: true, passive: true });
  document.addEventListener('keydown', function unlockAudio() {
    audioUnlocked = true;
    audio.load();
    document.removeEventListener('keydown', unlockAudio);
  }, { once: true, passive: true });

  function showSuccess(message) {
    let toast = document.querySelector('.dhd-sound-success-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'dhd-sound-success-toast';
      toast.setAttribute('role', 'status');
      toast.style.cssText = 'position:fixed;z-index:10000;right:18px;bottom:18px;max-width:calc(100vw - 36px);padding:12px 16px;border-radius:12px;background:#166534;color:#fff;font:600 14px/1.5 Changa,Inter,sans-serif;box-shadow:0 8px 24px #0003;direction:rtl';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    clearTimeout(Number(toast.dataset.timer));
    toast.dataset.timer = String(window.setTimeout(() => toast.remove(), 4000));
  }

  function isSettingsPage() {
    return /^\/settings\/?$/.test(window.location.pathname);
  }

  async function fetchNotifications(endpoint) {
    try {
      const response = await window.fetch(endpoint, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data)) return;
      if (!notificationBaselineReady) {
        data.forEach((item) => item && item.id != null && rememberPlayed(`${endpoint}:${item.id}`));
        return;
      }
      data.forEach((item) => {
        if (!item || item.id == null || item.isRead) return;
        const id = `${endpoint}:${item.id}`;
        if (playedIds.has(id)) return;
        rememberPlayed(id);
        playSound();
      });
    } catch {
      // Notification polling must never affect the application.
    }
  }

  async function pollNotifications() {
    await Promise.all([
      fetchNotifications('/api/notifications'),
      fetchNotifications('/api/employee/notifications'),
    ]);
    notificationBaselineReady = true;
  }

  function pushAuthHeaders() {
    const token = localStorage.getItem('dhd_employee_token') || localStorage.getItem('dhd_admin_token');
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  function base64ToBytes(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  }

  async function enablePushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      showSuccess('هذا المتصفح لا يدعم الإشعارات خارج التطبيق');
      return;
    }
    const keyResponse = await fetch('/api/push/public-key', { credentials: 'include', headers: pushAuthHeaders() });
    if (!keyResponse.ok) {
      showSuccess('إشعارات Push غير مهيأة على الخادم بعد');
      return;
    }
    const keyData = await keyResponse.json();
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const registration = await navigator.serviceWorker.register('/sw.js');
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToBytes(keyData.publicKey),
      });
    }
    await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...pushAuthHeaders() },
      body: JSON.stringify({ subscription }),
    });
    showSuccess('تم تفعيل الإشعارات خارج التطبيق');
  }

  function addPushSetting() {
    if (
      !isSettingsPage() ||
      !('Notification' in window) ||
      Notification.permission !== 'default' ||
      document.querySelector('.dhd-push-setting')
    ) return;
    const soundPanel = document.querySelector('.dhd-sound-setting');
    if (!soundPanel) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dhd-push-setting';
    button.textContent = 'تفعيل إشعارات الهاتف';
    button.style.cssText = 'margin-top:12px;padding:10px 14px;border:0;border-radius:10px;background:#12355b;color:#fff;font:600 13px Changa,Inter,sans-serif;cursor:pointer';
    button.addEventListener('click', function () {
      button.disabled = true;
      enablePushNotifications().catch(() => showSuccess('تعذر تفعيل إشعارات الهاتف')).finally(() => button.remove());
    });
    soundPanel.appendChild(button);
  }

  function addSoundSetting() {
    if (!isSettingsPage()) return;
    if (document.querySelector('.dhd-sound-setting')) return;
    const host = document.querySelector('main, [role="main"], .container, body');
    if (!host) return;
    const panel = document.createElement('section');
    panel.className = 'dhd-sound-setting';
    panel.dir = 'rtl';
    panel.style.cssText = 'margin:16px 0;padding:16px;border:1px solid #eadfd3;border-radius:16px;background:#fffaf5;color:#3c3026;font:14px/1.6 Changa,Inter,sans-serif';
    panel.innerHTML = '<strong style="display:block;margin-bottom:8px">إشعارات التطبيق</strong><label style="display:flex;align-items:center;gap:10px;cursor:pointer"><input type="checkbox" class="dhd-sound-toggle" style="width:18px;height:18px"> تشغيل صوت الإشعارات عند وصول إشعار جديد ونجاح تسجيل QR</label><p style="margin:8px 0 0;color:#7e6e60;font-size:12px">يتم حفظ هذا الاختيار على الجهاز الحالي.</p>';
    const toggle = panel.querySelector('.dhd-sound-toggle');
    toggle.checked = enabled;
    toggle.addEventListener('change', function () {
      enabled = toggle.checked;
      localStorage.setItem(SETTING_KEY, String(enabled));
    });
    addPushSetting();
    host.prepend(panel);
  }

  // Guard repeated attendance clicks even in the pre-built employee bundle.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const requestUrl = typeof input === 'string' ? input : input && input.url;
    const isAttendance = typeof requestUrl === 'string' && /\/api\/attendance\/(checkin|checkout)(?:[/?]|$)/.test(requestUrl);
    if (!isAttendance) return nativeFetch(input, init);
    const method = String(init?.method || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'POST') return nativeFetch(input, init);
    const responsePromise = nativeFetch(input, init);
    responsePromise.then((response) => {
      attendanceClickLocked = false;
      document.querySelectorAll('[data-dhd-attendance-locked]').forEach((button) => {
        button.removeAttribute('disabled');
        button.removeAttribute('data-dhd-attendance-locked');
      });
      if (!response.ok) return;
      const now = Date.now();
      if (now - lastAttendanceSoundAt < 1500) return;
      lastAttendanceSoundAt = now;
      playSound();
      showSuccess(requestUrl.includes('/checkout') ? 'تم تسجيل الانصراف بنجاح' : 'تم تسجيل الحضور بنجاح');
    }).catch(() => undefined);
    return responsePromise;
  };

  document.addEventListener('click', function (event) {
    const target = event.target;
    if (!(target instanceof Element) || attendanceClickLocked) {
      if (attendanceClickLocked && target instanceof Element && /تسجيل الحضور|تسجيل الخروج|check.?in|check.?out/i.test(target.textContent || '')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    const button = target.closest('button');
    if (!button || !/تسجيل الحضور|تسجيل الخروج|check.?in|check.?out/i.test(button.textContent || '')) return;
    attendanceClickLocked = true;
    button.setAttribute('disabled', 'true');
    button.setAttribute('data-dhd-attendance-locked', 'true');
    window.setTimeout(() => {
      if (!attendanceClickLocked) return;
      attendanceClickLocked = false;
      document.querySelectorAll('[data-dhd-attendance-locked]').forEach((lockedButton) => {
        lockedButton.removeAttribute('disabled');
        lockedButton.removeAttribute('data-dhd-attendance-locked');
      });
    }, 12000);
  }, true);

  pollNotifications();
  window.setInterval(pollNotifications, POLL_MS);
  const observer = new MutationObserver(function () {
    addSoundSetting();
    addPushSetting();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  addSoundSetting();
  addPushSetting();
})();