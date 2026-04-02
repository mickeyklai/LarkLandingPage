/**
 * TikTok Pixel: loads after DOM ready, fires ttq.page() on load and on SPA-style navigation
 * (hashchange, popstate, history.pushState / replaceState — matches this site's scroll.js behavior).
 * Pixel ID: window.__TIKTOK_PIXEL_ID__ (injected at Netlify build from TIKTOK_PIXEL_ID).
 */
(function () {
    var PLACEHOLDER = '__TIKTOK_PIXEL_ID_PLACEHOLDER__';
    var pixelId = window.__TIKTOK_PIXEL_ID__;

    function isValidPixelId(id) {
        if (!id || typeof id !== 'string') return false;
        if (id === PLACEHOLDER) return false;
        id = id.trim();
        if (!id) return false;
        return /^[A-Z0-9]+$/i.test(id);
    }

    if (!isValidPixelId(pixelId)) return;

    function tikTokPage() {
        try {
            var ttq = window.ttq;
            if (ttq && typeof ttq.page === 'function') ttq.page();
        } catch (e) { /* ignore */ }
    }

    function installSpaNavigationHooks() {
        var originalPush = history.pushState;
        var originalReplace = history.replaceState;

        function wrapped(orig) {
            return function () {
                var ret = orig.apply(history, arguments);
                tikTokPage();
                return ret;
            };
        }

        history.pushState = wrapped(originalPush);
        history.replaceState = wrapped(originalReplace);

        window.addEventListener('popstate', tikTokPage, false);
        window.addEventListener('hashchange', tikTokPage, false);
    }

    function bootstrapTikTok(w, d, t, id) {
        w.TiktokAnalyticsObject = t;
        var ttq = (w[t] = w[t] || []);
        ttq.methods = [
            'page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready',
            'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent',
            'grantConsent',
        ];
        ttq.setAndDefer = function (obj, method) {
            obj[method] = function () {
                obj.push([method].concat([].slice.call(arguments, 0)));
            };
        };
        for (var i = 0; i < ttq.methods.length; i++) {
            ttq.setAndDefer(ttq, ttq.methods[i]);
        }
        ttq.instance = function (instanceId) {
            var inst = ttq._i[instanceId] || [];
            for (var j = 0; j < ttq.methods.length; j++) {
                ttq.setAndDefer(inst, ttq.methods[j]);
            }
            return inst;
        };
        ttq.load = function (sdkId, opts) {
            var scriptHost = 'https://analytics.tiktok.com/i18n/pixel/events.js';
            ttq._i = ttq._i || {};
            ttq._i[sdkId] = [];
            ttq._i[sdkId]._u = scriptHost;
            ttq._t = ttq._t || {};
            ttq._t[sdkId] = +new Date();
            ttq._e = ttq._e || {};
            ttq._e[sdkId] = [];
            opts = opts || { n: 'partner' };
            var partner = opts.partner;
            ttq._i[sdkId]._u = scriptHost;
            ttq._i[sdkId]._t = ttq._t[sdkId];
            ttq._i[sdkId]._e = ttq._e[sdkId];
            ttq._i[sdkId]._n = partner;
            opts.type = 'text/javascript';
            opts.async = true;
            opts.src = scriptHost + '?sdkid=' + sdkId + '&lib=' + t;
            var first = d.getElementsByTagName('script')[0];
            first.parentNode.insertBefore(opts, first);
        };
        ttq.load(id);
        ttq.page();
    }

    function start() {
        installSpaNavigationHooks();
        bootstrapTikTok(window, document, 'ttq', pixelId.trim());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
