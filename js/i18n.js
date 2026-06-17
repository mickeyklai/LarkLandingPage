(function () {
    var DEFAULT = 'en';

    var SUPPORTED = [DEFAULT];
    var OG_LOCALE = {};
    var LOCALE_RTL = {};
    var LOCALE_META = {};
    var localePathRe = /^$/;
    var localePrefixRe = /^$/;

    var currentLocale = DEFAULT;
    var strings = {};
    var ready = false;
    var readyQueue = [];

    function buildFromConfig(cfg) {
        DEFAULT = cfg.default || 'en';
        SUPPORTED = Object.keys(cfg.locales || {});
        if (SUPPORTED.indexOf(DEFAULT) === -1) SUPPORTED.unshift(DEFAULT);

        OG_LOCALE = {};
        LOCALE_RTL = {};

        SUPPORTED.forEach(function (code) {
            var meta = cfg.locales[code] || {};
            LOCALE_META[code] = meta;
            OG_LOCALE[code] = meta.ogLocale || code;
            if (meta.rtl) LOCALE_RTL[code] = true;
        });

        var prefixes = SUPPORTED.filter(function (code) { return code !== DEFAULT; });
        if (prefixes.length) {
            var group = prefixes.join('|');
            localePathRe = new RegExp('^\\/(' + group + ')(\\/|$)');
            localePrefixRe = new RegExp('^\\/(' + group + ')(?=\\/|$)');
        } else {
            localePathRe = /^$/;
            localePrefixRe = /^$/;
        }
    }

    function loadConfig() {
        return fetch('/i18n/locales.json', { credentials: 'same-origin' })
            .then(function (res) {
                if (!res.ok) throw new Error('locales config load failed');
                return res.json();
            })
            .then(function (cfg) {
                buildFromConfig(cfg);
            })
            .catch(function () {
                buildFromConfig({
                    default: 'en',
                    locales: {
                        en: { ogLocale: 'en_US' },
                        he: { ogLocale: 'he_IL', rtl: true },
                    },
                });
            });
    }

    function getLocaleFromPath() {
        var m = window.location.pathname.match(localePathRe);
        return m ? m[1] : null;
    }

    function normalizeLocale(code) {
        if (!code) return DEFAULT;
        var base = String(code).toLowerCase().split('-')[0];
        return SUPPORTED.indexOf(base) !== -1 ? base : DEFAULT;
    }

    function getLocale() {
        return currentLocale;
    }

    function getNested(obj, key) {
        if (!obj || !key) return undefined;
        var parts = key.split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }

    function t(key, fallback) {
        var val = getNested(strings, key);
        if (val == null || val === '') {
            return fallback != null ? fallback : key;
        }
        return val;
    }

    function fetchLocale(locale) {
        return fetch('/i18n/' + locale + '.json', { credentials: 'same-origin' })
            .then(function (res) {
                if (!res.ok) throw new Error('locale load failed');
                return res.json();
            });
    }

    function applyDocumentLocale() {
        document.documentElement.lang = currentLocale;
        document.documentElement.dir = LOCALE_RTL[currentLocale] ? 'rtl' : 'ltr';
    }

    function setMetaContent(selector, content) {
        if (!content || String(content).indexOf('meta.') === 0) return;
        var el = document.querySelector(selector);
        if (el) el.setAttribute('content', content);
    }

    function applyHebrewStructuredData() {
        if (currentLocale !== 'he') return;
        var name = t('brand.name');
        if (!name || name === 'brand.name') return;
        document.querySelectorAll('script[type="application/ld+json"]').forEach(function (script) {
            if (script.textContent.indexOf('Lark Elwood') === -1) return;
            script.textContent = script.textContent.replace(/Lark Elwood/g, name);
        });
    }

    function applyMeta() {
        var title = t('meta.title');
        if (title && title !== 'meta.title') document.title = title;

        var desc = t('meta.description');
        if (desc && desc !== 'meta.description') {
            setMetaContent('meta[name="description"]', desc);
        }

        var ogLocale = OG_LOCALE[currentLocale] || OG_LOCALE.en;
        var ogLocaleEl = document.querySelector('meta[property="og:locale"]');
        if (ogLocaleEl) ogLocaleEl.setAttribute('content', ogLocale);

        var ogTitle = t('meta.ogTitle');
        if (ogTitle && ogTitle !== 'meta.ogTitle') {
            setMetaContent('meta[property="og:title"]', ogTitle);
            setMetaContent('meta[name="twitter:title"]', ogTitle);
        }

        var ogDesc = t('meta.ogDescription');
        if (ogDesc && ogDesc !== 'meta.ogDescription') {
            setMetaContent('meta[property="og:description"]', ogDesc);
            setMetaContent('meta[name="twitter:description"]', ogDesc);
        }

        setMetaContent('meta[name="author"]', t('meta.author'));
        setMetaContent('meta[property="og:site_name"]', t('meta.ogSiteName'));

        applyHebrewStructuredData();
    }

    function applyToDom() {
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            var val = t(key);
            if (val && val !== key) el.textContent = val;
        });

        document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-html');
            var val = t(key);
            if (val && val !== key) el.innerHTML = val;
        });

        document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
            var spec = el.getAttribute('data-i18n-attr');
            spec.split(';').forEach(function (pair) {
                var parts = pair.split(':');
                if (parts.length !== 2) return;
                var attr = parts[0].trim();
                var key = parts[1].trim();
                var val = t(key);
                if (val && val !== key) el.setAttribute(attr, val);
            });
        });

        document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-aria');
            var val = t(key);
            if (val && val !== key) el.setAttribute('aria-label', val);
        });

        applyMeta();
        fixLocaleLinks();
        applyLocaleFeatures();
    }

    function hideOrphanSocialSeps() {
        document.querySelectorAll('.hero-social-hint').forEach(function (wrap) {
            wrap.querySelectorAll('.sep').forEach(function (sep) {
                var prev = sep.previousElementSibling;
                var next = sep.nextElementSibling;
                var hide = !prev || prev.hidden || !next || next.hidden;
                sep.hidden = hide;
                if (hide) {
                    sep.style.display = 'none';
                } else {
                    sep.style.removeProperty('display');
                }
            });
        });
    }

    function applyLocaleFeatures() {
        var meta = LOCALE_META[currentLocale] || {};

        if (meta.blog === false) {
            document.querySelectorAll('a[href="/blog/"], a[href^="/blog/"]').forEach(function (el) {
                el.hidden = true;
                el.setAttribute('aria-hidden', 'true');
            });
        }

        if (meta.arc === false) {
            document.querySelectorAll('a[href="#arc"], a[href="/#arc"], a[href*="/#arc"]').forEach(function (el) {
                el.hidden = true;
                el.setAttribute('aria-hidden', 'true');
            });
            var arcSection = document.getElementById('arc');
            if (arcSection) {
                arcSection.hidden = true;
                arcSection.setAttribute('aria-hidden', 'true');
            }
            document.querySelectorAll('.faq-item').forEach(function (item) {
                var q = item.querySelector('.faq-question');
                var key = q && (q.getAttribute('data-i18n') || q.getAttribute('data-i18n-html'));
                if (key === 'faq.q5.question') {
                    item.hidden = true;
                    item.setAttribute('aria-hidden', 'true');
                }
            });
        }

        if (meta.faq === false) {
            document.querySelectorAll('a[href="#faq"], a[href="/#faq"], a[href*="/#faq"]').forEach(function (el) {
                el.hidden = true;
                el.setAttribute('aria-hidden', 'true');
            });
            var faqSection = document.getElementById('faq');
            if (faqSection) {
                faqSection.hidden = true;
                faqSection.setAttribute('aria-hidden', 'true');
            }
        }

        if (Array.isArray(meta.followChannels) && meta.followChannels.length) {
            var allowed = meta.followChannels;
            document.querySelectorAll('[data-follow-channel]').forEach(function (el) {
                var channel = el.getAttribute('data-follow-channel');
                if (allowed.indexOf(channel) === -1) {
                    el.hidden = true;
                    el.style.display = 'none';
                    el.setAttribute('aria-hidden', 'true');
                } else {
                    el.hidden = false;
                    el.style.removeProperty('display');
                    el.removeAttribute('aria-hidden');
                }
            });
            hideOrphanSocialSeps();
        }

        if (meta.channelUrls) {
            Object.keys(meta.channelUrls).forEach(function (channel) {
                var url = meta.channelUrls[channel];
                if (!url) return;
                document.querySelectorAll('[data-follow-channel="' + channel + '"]').forEach(function (el) {
                    el.setAttribute('href', url);
                });
            });
        }

        if (currentLocale === 'he') {
            loadHebrewAssets(meta);
        }
    }

    function loadHebrewAssets(meta) {
        if (!document.querySelector('script[data-he-arc-form]') && meta.arcForm && meta.arc !== false) {
            var script = document.createElement('script');
            script.src = '/js/he/arc-form.js';
            script.setAttribute('data-he-arc-form', '1');
            document.body.appendChild(script);
        }
    }

    function stripLocalePrefix(pathname) {
        return pathname.replace(localePrefixRe, '') || '/';
    }

    function localizedPath(pathname, locale) {
        var bare = stripLocalePrefix(pathname);
        if (locale === DEFAULT) return bare;
        if (bare.indexOf('/#') === 0) return '/' + locale + bare;
        if (bare === '/') return '/' + locale + '/';
        return '/' + locale + bare;
    }

    function fixLocaleLinks() {
        if (currentLocale === DEFAULT) return;
        document.querySelectorAll('a[href^="/"]').forEach(function (a) {
            var href = a.getAttribute('href');
            if (!href || href.indexOf('//') === 0) return;
            if (localePathRe.test(href)) return;
            if (/^\/blog(\/|$)/.test(href)) return;
            if (/\.(xml|html|jpg|png|svg|css|js)(\?|#|$)/.test(href)) return;
            a.setAttribute('href', localizedPath(href, currentLocale));
        });
    }

    function whenReady(fn) {
        if (ready) fn();
        else readyQueue.push(fn);
    }

    function finishInit() {
        ready = true;
        readyQueue.forEach(function (fn) { fn(); });
        readyQueue = [];
        document.documentElement.classList.remove('i18n-pending');
    }

    function init() {
        var fromPath = getLocaleFromPath();
        currentLocale = fromPath ? normalizeLocale(fromPath) : DEFAULT;
        applyDocumentLocale();

        if (currentLocale === DEFAULT) {
            finishInit();
            return;
        }

        fetchLocale(currentLocale)
            .then(function (data) {
                strings = data || {};
                applyToDom();
            })
            .catch(function () {
                currentLocale = DEFAULT;
                applyDocumentLocale();
            })
            .then(finishInit);
    }

    window.LarkI18n = {
        t: t,
        getLocale: getLocale,
        whenReady: whenReady,
    };

    function bootstrap() {
        loadConfig().then(init);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
