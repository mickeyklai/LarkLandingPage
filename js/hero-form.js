(function () {
    function msg(key, fallback) {
        if (window.LarkI18n && typeof window.LarkI18n.t === 'function') {
            return window.LarkI18n.t(key, fallback);
        }
        return fallback;
    }

    var heroForm = document.getElementById('heroQuickForm');
    var heroSubmitBtn = document.getElementById('heroQuickSubmit');
    var heroEmailInput = document.getElementById('quick-email');
    var heroSuccessPanel = document.getElementById('heroCtaSuccess');
    var heroErrorEl = document.getElementById('heroCtaError');
    var subscribeUrl = '/.netlify/functions/subscribe';
    var heroSubmitDefaultLabel = heroSubmitBtn ? heroSubmitBtn.textContent : '';
    var heroSubmitting = false;

    function setHeroError(message) {
        if (!heroErrorEl) return;
        if (message) {
            heroErrorEl.textContent = message;
            heroErrorEl.hidden = false;
        } else {
            heroErrorEl.textContent = '';
            heroErrorEl.hidden = true;
        }
    }

    function isValidEmail(value) {
        var v = (value || '').trim();
        if (!v || v.length > 254) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    function bindForm() {
        if (!heroForm || !heroEmailInput || !heroSubmitBtn) return;
        heroSubmitDefaultLabel = heroSubmitBtn.textContent;

        heroForm.addEventListener('submit', function (e) {
            e.preventDefault();
            setHeroError('');

            if (heroSubmitting) return;

            var email = heroEmailInput.value.trim();
            if (!isValidEmail(email)) {
                heroEmailInput.focus();
                setHeroError(msg('js.hero.invalidEmail', 'please enter a valid email address.'));
                return;
            }

            heroSubmitting = true;
            heroSubmitBtn.disabled = true;
            heroEmailInput.disabled = true;
            heroSubmitBtn.setAttribute('aria-busy', 'true');
            heroSubmitBtn.textContent = msg('js.hero.joining', 'Joining…');

            fetch(subscribeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email }),
            })
                .then(function (res) {
                    return res.text().then(function (text) {
                        var data = {};
                        if (text) {
                            try {
                                data = JSON.parse(text);
                            } catch (ignore) {}
                        }
                        return { res: res, data: data };
                    });
                })
                .then(function (out) {
                    if (out.res.ok && out.data && out.data.ok) {
                        heroForm.hidden = true;
                        if (heroSuccessPanel) heroSuccessPanel.hidden = false;
                        if (typeof window.sendMetaCapiEvent === 'function') {
                            window.sendMetaCapiEvent({ eventName: 'Lead', email: email });
                        }
                        return;
                    }
                    var errText =
                        out.data && out.data.error
                            ? out.data.error
                            : msg('js.hero.errorGeneric', 'something went wrong. please try again.');
                    setHeroError(errText);
                })
                .catch(function () {
                    setHeroError(msg('js.hero.errorGeneric', 'something went wrong. please try again.'));
                })
                .then(function () {
                    heroSubmitting = false;
                    if (heroSuccessPanel && !heroSuccessPanel.hidden) {
                        heroSubmitBtn.removeAttribute('aria-busy');
                        heroSubmitBtn.disabled = false;
                        heroEmailInput.disabled = false;
                        heroSubmitBtn.textContent = heroSubmitDefaultLabel;
                        return;
                    }
                    heroSubmitBtn.disabled = false;
                    heroEmailInput.disabled = false;
                    heroSubmitBtn.removeAttribute('aria-busy');
                    heroSubmitBtn.textContent = heroSubmitDefaultLabel;
                });
        });
    }

    if (window.LarkI18n && typeof window.LarkI18n.whenReady === 'function') {
        window.LarkI18n.whenReady(bindForm);
    } else {
        bindForm();
    }
})();
