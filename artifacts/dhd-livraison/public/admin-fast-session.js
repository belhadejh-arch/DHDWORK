/*
 * Paint the admin shell immediately on repeat visits.
 *
 * The cached value is only the last server-returned display profile; it is
 * never used for API authorization. Every cached session is revalidated
 * against /api/auth/me in the background, and an expired session is cleared.
 */
(function () {
  'use strict';

  var PROFILE_KEY = 'dhd_admin_profile';
  var TOKEN_KEY = 'dhd_admin_token';
  var nativeFetch = window.fetch.bind(window);
  var verifying = false;

  function readProfile() {
    try {
      var raw = localStorage.getItem(PROFILE_KEY);
      var profile = raw ? JSON.parse(raw) : null;
      return profile && typeof profile === 'object' ? profile : null;
    } catch (error) {
      return null;
    }
  }

  function writeProfile(profile) {
    if (!profile || typeof profile !== 'object') return;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch (error) {
      // Restricted WebViews may not permit localStorage.
    }
  }

  function clearProfile() {
    try {
      localStorage.removeItem(PROFILE_KEY);
    } catch (error) {
      // Ignore unavailable storage.
    }
  }

  function requestPath(input) {
    var url = typeof input === 'string' ? input : input && input.url;
    if (!url) return '';
    try {
      return new URL(url, window.location.href).pathname;
    } catch (error) {
      return String(url).split('?')[0];
    }
  }

  function isAdminSurface() {
    return !/^\/portal(?:\/|$)/.test(window.location.pathname);
  }

  function cachedMeResponse(profile) {
    return new Response(JSON.stringify({
      isAuthenticated: true,
      userType: 'admin',
      admin: profile
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function revalidate() {
    if (!isAdminSurface() || verifying || !localStorage.getItem(TOKEN_KEY)) return;
    var profile = readProfile();
    if (!profile) return;
    verifying = true;
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 7000);
    nativeFetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + localStorage.getItem(TOKEN_KEY)
      },
      signal: controller.signal
    }).then(function (response) {
      return response.json().then(function (data) {
        if (
          response.ok &&
          data &&
          data.isAuthenticated &&
          data.userType === 'admin' &&
          data.admin
        ) {
          writeProfile(data.admin);
          return;
        }
        if (response.status === 401 || response.status === 403 || data && data.isAuthenticated === false) {
          clearProfile();
          localStorage.removeItem(TOKEN_KEY);
          if (/^\/(dashboard|offices|employees|attendance|salaries|requests|settings|statistics|violations|notifications|advances|leave-requests|vacation-requests|search)/.test(window.location.pathname)) {
            window.location.reload();
          }
        }
      });
    }).catch(function () {
      // A temporary network/cold-start failure must not hide the cached shell.
    }).finally(function () {
      window.clearTimeout(timeout);
      verifying = false;
    });
  }

  window.fetch = function (input, init) {
    var path = requestPath(input);
    var profile = readProfile();
    var hasAdminToken = Boolean(localStorage.getItem(TOKEN_KEY));

    // Do not use the optimistic cached session on the entry route. An expired
    // token can otherwise redirect / -> /offices while revalidation is still
    // pending, then reload back to / and repeat until the page looks blank.
    var isAdminEntry = /^\/?$/.test(window.location.pathname);
    if (isAdminSurface() && !isAdminEntry && path === '/api/auth/me' && hasAdminToken && profile) {
      window.setTimeout(revalidate, 0);
      return Promise.resolve(cachedMeResponse(profile));
    }

    var result = nativeFetch(input, init);
    if (isAdminSurface() && path === '/api/auth/me') {
      // The legacy auth provider treats a missing userType as an admin
      // response. The unauthenticated API response intentionally omits that
      // field, so normalize it to an explicit non-admin value to prevent a
      // / -> /offices redirect loop after an expired token.
      return result.then(function (response) {
        if (!response.ok) return response;
        return response.clone().json().then(function (data) {
          if (data && data.isAuthenticated === false && !data.userType) {
            return new Response(JSON.stringify(Object.assign({}, data, { userType: 'none' })), {
              status: response.status,
              statusText: response.statusText,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return response;
        }).catch(function () {
          return response;
        });
      });
    }
    if (path === '/api/auth/logout') {
      clearProfile();
    }
    if (path === '/api/auth/login' || path === '/api/auth/login/qr') {
      result.then(function (response) {
        if (!response.ok) return;
        response.clone().json().then(function (data) {
          if (data && data.success && data.userType === 'admin' && data.admin) {
            writeProfile(data.admin);
          }
        }).catch(function () {});
      }).catch(function () {});
    }
    return result;
  };
})();