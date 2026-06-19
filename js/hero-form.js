(function () {
    function msg(key, fallback) {
        if (window.LarkI18n && typeof window.LarkI18n.t === 'function') {
            return window.LarkI18n.t(key, fallback);
        }
        return fallback;
    }

    var subscribeUrl = '/.netlify/functions/subscribe';

    function isValidEmail(value) {
        var v = (value || '').trim();
        if (!v || v.length > 254) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    function bindSubscribeForm(cfg) {
        var form = document.getElementById(cfg.formId);
        var submitBtn = document.getElementById(cfg.submitId);
        var emailInput = document.getElementById(cfg.emailId);
        var successPanel = document.getElementById(cfg.successId);
        var errorEl = document.getElementById(cfg.errorId);
        var submitting = false;
        var submitDefaultLabel = submitBtn ? submitBtn.textContent : '';

        function setError(message) {
            if (!errorEl) return;
            if (message) {
                errorEl.textContent = message;
                errorEl.hidden = false;
            } else {
                errorEl.textContent = '';
                errorEl.hidden = true;
            }
        }

        if (!form || !emailInput || !submitBtn) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            setError('');

            if (submitting) return;

            var email = emailInput.value.trim();
            if (!isValidEmail(email)) {
                emailInput.focus();
                setError(msg(cfg.invalidEmailKey, 'please enter a valid email address.'));
                return;
            }

            submitting = true;
            submitBtn.disabled = true;
            emailInput.disabled = true;
            submitBtn.setAttribute('aria-busy', 'true');
            submitBtn.textContent = msg(cfg.joiningKey, 'Joining…');

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
                        form.hidden = true;
                        if (successPanel) successPanel.hidden = false;
                        if (typeof window.sendMetaCapiEvent === 'function') {
                            window.sendMetaCapiEvent({ eventName: 'Lead', email: email });
                        }
                        return;
                    }
                    var errText =
                        out.data && out.data.error
                            ? out.data.error
                            : msg(cfg.errorGenericKey, 'something went wrong. please try again.');
                    setError(errText);
                })
                .catch(function () {
                    setError(msg(cfg.errorGenericKey, 'something went wrong. please try again.'));
                })
                .then(function () {
                    submitting = false;
                    if (successPanel && !successPanel.hidden) {
                        submitBtn.removeAttribute('aria-busy');
                        submitBtn.disabled = false;
                        emailInput.disabled = false;
                        submitBtn.textContent = submitDefaultLabel;
                        return;
                    }
                    submitBtn.disabled = false;
                    emailInput.disabled = false;
                    submitBtn.removeAttribute('aria-busy');
                    submitBtn.textContent = submitDefaultLabel;
                });
        });
    }

    function initForms() {
        bindSubscribeForm({
            formId: 'heroQuickForm',
            submitId: 'heroQuickSubmit',
            emailId: 'quick-email',
            successId: 'heroCtaSuccess',
            errorId: 'heroCtaError',
            invalidEmailKey: 'js.hero.invalidEmail',
            joiningKey: 'js.hero.joining',
            errorGenericKey: 'js.hero.errorGeneric',
        });

        bindSubscribeForm({
            formId: 'closingSignupForm',
            submitId: 'closingSignupSubmit',
            emailId: 'closing-signup-email',
            successId: 'closingSignupSuccess',
            errorId: 'closingSignupError',
            invalidEmailKey: 'js.hero.invalidEmail',
            joiningKey: 'js.hero.joining',
            errorGenericKey: 'js.hero.errorGeneric',
        });
    }

    if (window.LarkI18n && typeof window.LarkI18n.whenReady === 'function') {
        window.LarkI18n.whenReady(initForms);
    } else {
        initForms();
    }
})();
