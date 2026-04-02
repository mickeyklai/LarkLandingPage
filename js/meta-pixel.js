/**
 * Meta (Facebook) Pixel: DOM-ready init, PageView on load and SPA-style navigation
 * (history.pushState/replaceState, popstate, hashchange).
 * Pixel ID: window.__META_PIXEL_ID__ (injected at Netlify build from META_PIXEL_ID).
 */
(function () {
    var PLACEHOLDER = '__META_PIXEL_ID_PLACEHOLDER__';
    var pixelId = window.__META_PIXEL_ID__;

    function isValidPixelId(id) {
        if (!id || typeof id !== 'string') return false;
        if (id === PLACEHOLDER) return false;
        id = id.trim();
        if (!id) return false;
        return /^\d{5,24}$/.test(id);
    }

    if (!isValidPixelId(pixelId)) return;

    function metaPageView() {
        try {
            if (window.fbq) window.fbq('track', 'PageView');
        } catch (e) { /* ignore */ }
    }

    function installSpaNavigationHooks() {
        var originalPush = history.pushState;
        var originalReplace = history.replaceState;

        function wrapped(orig) {
            return function () {
                var ret = orig.apply(history, arguments);
                metaPageView();
                return ret;
            };
        }

        history.pushState = wrapped(originalPush);
        history.replaceState = wrapped(originalReplace);

        window.addEventListener('popstate', metaPageView, false);
        window.addEventListener('hashchange', metaPageView, false);
    }

    function bootstrapMeta(id) {
        /* Standard fbq loader — queues until fbevents.js loads. */
        var fbRoot = window;
        if (fbRoot.fbq) return;
        var fbq = (fbRoot.fbq = function () {
            if (fbq.callMethod) {
                fbq.callMethod.apply(fbq, arguments);
            } else {
                fbq.queue.push(arguments);
            }
        });
        if (!fbRoot._fbq) fbRoot._fbq = fbq;
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = '2.0';
        fbq.queue = [];
        var t = document.createElement('script');
        t.async = true;
        t.src = 'https://connect.facebook.net/en_US/fbevents.js';
        var s = document.getElementsByTagName('script')[0];
        s.parentNode.insertBefore(t, s);
        fbq('init', id);
        fbq('track', 'PageView');
    }

    function start() {
        installSpaNavigationHooks();
        bootstrapMeta(pixelId.trim());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
