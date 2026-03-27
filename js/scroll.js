(function () {
    /* Tight gap under measured sticky header (JS positions targets; avoid large fudge or you get empty space). */
    var HEADER_PAD_PX = 6;
    /* Avoid duplicate scroll when we set location.hash; skip History API on file: (Chrome security / embedded preview). */
    var skipHashchangeScroll = false;

    function isMobileViewport() {
        return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    }

    function getScrollY() {
        return (
            window.scrollY ||
            window.pageYOffset ||
            document.documentElement.scrollTop ||
            document.body.scrollTop ||
            0
        );
    }

    function setScrollTop(y) {
        y = Math.max(0, Math.round(y));
        try {
            window.scrollTo({ top: y, left: 0, behavior: 'auto' });
        } catch (err) {
            window.scrollTo(0, y);
        }
        if (document.documentElement) document.documentElement.scrollTop = y;
        if (document.body) document.body.scrollTop = y;
    }

    function headerScrollPadding() {
        var hdr = document.querySelector('header');
        var h = hdr ? Math.round(hdr.getBoundingClientRect().height) : 0;
        return h + HEADER_PAD_PX;
    }

    function scrollToAnchorId(id, behavior) {
        if (!id) return false;
        var target = document.getElementById(id);
        if (!target) return false;
        var scrollTarget = target.querySelector('.section-kicker') || target;
        var top = scrollTarget.getBoundingClientRect().top + getScrollY() - headerScrollPadding();
        if (top < 0) top = 0;
        var allowSmooth =
            behavior === 'smooth' &&
            window.matchMedia &&
            !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (allowSmooth) {
            window.scrollTo({ top: top, left: 0, behavior: 'smooth' });
        } else {
            setScrollTop(top);
        }
        return true;
    }

    /* Re-correct scroll position after mobile URL bar shows/hides (svh layout shift safety net). */
    function scheduleScrollRefinements(id) {
        if (!isMobileViewport() || !id) return;
        var debounceTimer;
        var cleanup = function () {
            clearTimeout(debounceTimer);
            window.removeEventListener('resize', onResize);
        };
        var onResize = function () {
            /* Debounce: wait 80ms after the last resize fires so the URL bar animation has settled. */
            clearTimeout(debounceTimer);
            debounceTimer = window.setTimeout(function () {
                cleanup();
                scrollToAnchorId(id, 'auto');
            }, 80);
        };
        window.addEventListener('resize', onResize, { passive: true });
        /* Absolute fallback if no resize fires at all. */
        window.setTimeout(function () {
            cleanup();
            scrollToAnchorId(id, 'auto');
        }, 500);
    }

    function setFragmentInUrl(id) {
        var hash = '#' + encodeURIComponent(id);
        if (location.hash === hash) return;

        /* Briefly remove the element's id so the browser cannot auto-scroll to it
           when we update the URL (pushState/hashchange both trigger anchor scroll in
           some browsers). The id is restored in the next animation frame — invisible
           to the user but fast enough to prevent any browser-initiated scroll. */
        var el = document.getElementById(id);
        if (el) el.removeAttribute('id');

        skipHashchangeScroll = true;
        try {
            if (history.pushState) {
                history.pushState(null, '', hash);
            } else {
                location.hash = hash;
            }
        } catch (err) {
            location.hash = hash;
        }

        if (el) requestAnimationFrame(function () { el.id = id; });
    }

    function onSamePageAnchorClick(e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a) return;
        if (e.button !== 0 && e.button !== undefined) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var href = a.getAttribute('href');
        if (!href || href === '#') return;
        var id = decodeURIComponent(href.slice(1));
        if (!id || !document.getElementById(id)) return;
        e.preventDefault();
        scrollToAnchorId(id, 'auto');
        setFragmentInUrl(id);
    }

    document.addEventListener('click', onSamePageAnchorClick, false);

    window.addEventListener('hashchange', function () {
        if (skipHashchangeScroll) {
            skipHashchangeScroll = false;
            return;
        }
        var id = (location.hash || '').slice(1);
        if (!id) return;
        id = decodeURIComponent(id);
        scrollToAnchorId(id, 'auto');
        scheduleScrollRefinements(id);
    });

    window.addEventListener('popstate', function () {
        var id = (location.hash || '').slice(1);
        if (!id) {
            setScrollTop(0);
            return;
        }
        id = decodeURIComponent(id);
        scrollToAnchorId(id, 'auto');
        scheduleScrollRefinements(id);
    });

    function runInitialHashScroll() {
        var id = (location.hash || '').slice(1);
        if (!id) return;
        id = decodeURIComponent(id);
        function go() {
            scrollToAnchorId(id, 'auto');
            scheduleScrollRefinements(id);
        }
        requestAnimationFrame(function () {
            requestAnimationFrame(go);
        });
        window.addEventListener('load', go, { once: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runInitialHashScroll);
    } else {
        runInitialHashScroll();
    }
})();

/* ----------------------------------------------------------------
   Hero parallax
   Smoke layer: 0.5x scroll speed (appears to float in background)
   Eye layer:   1x  scroll speed (natural — no extra transform)
   Disabled for users who prefer reduced motion.
---------------------------------------------------------------- */
(function () {
    if (
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return;

    var smoke = document.querySelector('.hero-smoke');
    if (!smoke) return;

    var ticking = false;
    var lastY   = 0;

    function applyParallax() {
        /* Smoke is centred on the eye via translateX(-50%) translateY(-50%).
           The extra translateY term pushes it down as page scrolls up,
           making it drift at 0.5x speed relative to the eye layer. */
        var offset = (lastY * 0.5);
        smoke.style.transform = 'translateX(-50%) translateY(calc(-50% + ' + offset + 'px))';
        ticking = false;
    }

    window.addEventListener('scroll', function () {
        lastY = window.scrollY || window.pageYOffset || 0;
        if (!ticking) {
            requestAnimationFrame(applyParallax);
            ticking = true;
        }
    }, { passive: true });
})();
