(function () {
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

    if (heroForm && heroEmailInput && heroSubmitBtn) {
        heroForm.addEventListener('submit', function (e) {
            e.preventDefault();
            setHeroError('');

            if (heroSubmitting) return;

            var email = heroEmailInput.value.trim();
            if (!isValidEmail(email)) {
                heroEmailInput.focus();
                setHeroError('Please enter a valid email address.');
                return;
            }

            heroSubmitting = true;
            heroSubmitBtn.disabled = true;
            heroEmailInput.disabled = true;
            heroSubmitBtn.setAttribute('aria-busy', 'true');
            heroSubmitBtn.textContent = 'Joining…';

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
                        return;
                    }
                    var msg =
                        out.data && out.data.error
                            ? out.data.error
                            : 'Something went wrong. Please try again.';
                    setHeroError(msg);
                })
                .catch(function () {
                    setHeroError('Something went wrong. Please try again.');
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
})();
