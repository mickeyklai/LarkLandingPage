(function () {
    var STORAGE_KEY = 'lark_cookie_consent';
    var STORAGE_VALUE = 'accepted';

    function hasConsent() {
        try {
            return window.localStorage.getItem(STORAGE_KEY) === STORAGE_VALUE;
        } catch (_) {
            return false;
        }
    }

    function saveConsent() {
        try {
            window.localStorage.setItem(STORAGE_KEY, STORAGE_VALUE);
        } catch (_) {
            /* ignore quota / private mode */
        }
    }

    function msg(key, fallback) {
        if (window.LarkI18n && typeof window.LarkI18n.t === 'function') {
            return window.LarkI18n.t(key, fallback);
        }
        return fallback;
    }

    function showBanner() {
        if (hasConsent()) {
            return;
        }

        var root = document.createElement('div');
        root.id = 'cookie-consent';
        root.className = 'cookie-consent';
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', msg('js.cookie.aria', 'Cookie notice'));
        root.setAttribute('hidden', '');

        var inner = document.createElement('div');
        inner.className = 'cookie-consent-inner';

        var text = document.createElement('p');
        text.className = 'cookie-consent-text';
        text.innerHTML = msg(
            'js.cookie.text',
            'We use cookies to improve your experience and understand how readers use this site. <a href="/privacy-policy.html">Privacy policy</a>.'
        );

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cookie-consent-accept';
        btn.textContent = msg('js.cookie.accept', 'Accept');

        inner.appendChild(text);
        inner.appendChild(btn);
        root.appendChild(inner);
        document.body.appendChild(root);

        requestAnimationFrame(function () {
            root.removeAttribute('hidden');
            root.classList.add('cookie-consent--visible');
        });

        btn.addEventListener('click', function () {
            saveConsent();
            root.classList.remove('cookie-consent--visible');

            var removed = false;
            function removeFromDom() {
                if (removed) {
                    return;
                }
                removed = true;
                if (root.parentNode) {
                    root.parentNode.removeChild(root);
                }
            }

            root.addEventListener(
                'transitionend',
                function onTe(ev) {
                    if (ev.target !== root) {
                        return;
                    }
                    if (ev.propertyName !== 'opacity' && ev.propertyName !== 'transform') {
                        return;
                    }
                    root.removeEventListener('transitionend', onTe);
                    removeFromDom();
                }
            );

            window.setTimeout(removeFromDom, 400);
        });
    }

    if (window.LarkI18n && typeof window.LarkI18n.whenReady === 'function') {
        window.LarkI18n.whenReady(showBanner);
    } else {
        showBanner();
    }
})();
