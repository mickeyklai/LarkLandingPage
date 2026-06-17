(function () {
    if (!window.LarkI18n || window.LarkI18n.getLocale() !== 'he') return;

    function msg(key, fallback) {
        return window.LarkI18n.t(key, fallback);
    }

    var applyUrl = '/.netlify/functions/arc-apply';
    var arcSubmitting = false;
    var dialog = null;
    var form = null;

    function stripTallyAttrs(el) {
        if (!el || !el.attributes) return;
        Array.prototype.slice.call(el.attributes).forEach(function (attr) {
            if (attr.name.indexOf('data-tally') === 0) {
                el.removeAttribute(attr.name);
            }
        });
    }

    function prepareTriggerButton() {
        var btn = document.getElementById('openNewsletter');
        if (!btn) return null;

        var clean = btn.cloneNode(true);
        stripTallyAttrs(clean);
        clean.removeAttribute('aria-haspopup');
        clean.setAttribute('aria-haspopup', 'dialog');
        clean.setAttribute('aria-controls', 'heArcDialog');
        btn.parentNode.replaceChild(clean, btn);
        return clean;
    }

    function buildModal() {
        if (document.getElementById('heArcDialog')) {
            dialog = document.getElementById('heArcDialog');
            form = document.getElementById('arcHeForm');
            return { dialog: dialog, form: form };
        }

        dialog = document.createElement('dialog');
        dialog.className = 'he-arc-dialog';
        dialog.id = 'heArcDialog';

        dialog.innerHTML =
            '<div class="he-arc-dialog-surface">' +
            '<button type="button" class="he-arc-dialog-close" id="heArcDialogClose" aria-label="' +
            msg('arc.form.close', 'סגירה') +
            '">&times;</button>' +
            '<h2 class="he-arc-dialog-title" id="heArcDialogTitle">' +
            msg('arc.form.modalTitle', 'הגשת מועמדות לצוות ARC') +
            '</h2>' +
            '<p class="he-arc-dialog-lead">' +
            msg('arc.form.modalLead', '') +
            '</p>' +
            '<div id="heArcFormHost"></div>' +
            '</div>';

        document.body.appendChild(dialog);

        var host = dialog.querySelector('#heArcFormHost');
        form = document.createElement('form');
        form.className = 'arc-form';
        form.id = 'arcHeForm';
        form.action = '#';
        form.method = 'post';
        form.noValidate = true;
        form.setAttribute('aria-label', msg('arc.form.aria', 'טופס הגשת מועמדות לצוות ARC'));

        form.innerHTML =
            '<div class="arc-form-field">' +
            '<label class="arc-form-label" for="arc-name">' +
            msg('arc.form.nameLabel', 'שם מלא') +
            '</label>' +
            '<input class="arc-form-input" type="text" id="arc-name" name="name" autocomplete="name" required maxlength="120" placeholder="' +
            msg('arc.form.namePlaceholder', 'שם ושם משפחה') +
            '">' +
            '</div>' +
            '<div class="arc-form-field">' +
            '<label class="arc-form-label" for="arc-email">' +
            msg('arc.form.emailLabel', 'אימייל') +
            '</label>' +
            '<input class="arc-form-input" type="email" id="arc-email" name="email" autocomplete="email" required maxlength="254" placeholder="' +
            msg('arc.form.emailPlaceholder', 'כתובת אימייל') +
            '">' +
            '</div>' +
            '<div class="arc-form-field">' +
            '<label class="arc-form-label" for="arc-social">' +
            msg('arc.form.socialLabel', 'אינסטגרם / טיקטוק') +
            '</label>' +
            '<input class="arc-form-input" type="text" id="arc-social" name="social" autocomplete="off" maxlength="120" placeholder="' +
            msg('arc.form.socialPlaceholder', '@username (אופציונלי)') +
            '">' +
            '</div>' +
            '<div class="arc-form-field">' +
            '<label class="arc-form-label" for="arc-message">' +
            msg('arc.form.messageLabel', 'למה את מתאימה?') +
            '</label>' +
            '<textarea class="arc-form-textarea" id="arc-message" name="message" rows="4" maxlength="2000" placeholder="' +
            msg('arc.form.messagePlaceholder', '') +
            '"></textarea>' +
            '</div>' +
            '<label class="arc-form-consent">' +
            '<input class="arc-form-checkbox" type="checkbox" id="arc-consent" name="consent" required>' +
            '<span class="arc-form-consent-text"></span>' +
            '</label>' +
            '<button type="submit" class="btn-arc arc-form-submit" id="arcHeSubmit">' +
            msg('arc.form.submit', 'שליחת מועמדות') +
            '</button>' +
            '<div class="arc-form-success" id="arcHeSuccess" role="status" aria-live="polite" hidden>' +
            '<p class="arc-form-success-title">' +
            msg('arc.form.successTitle', 'הבקשה נשלחה.') +
            '</p>' +
            '<p class="arc-form-success-note">' +
            msg('arc.form.successNote', '') +
            '</p>' +
            '</div>' +
            '<p class="arc-form-feedback arc-form-feedback--error" id="arcHeError" role="alert" aria-live="assertive" hidden></p>';

        var consentText = form.querySelector('.arc-form-consent-text');
        if (consentText) {
            consentText.innerHTML = msg(
                'arc.form.consent',
                'אני מאשרת שהספר מכיל תוכן למבוגרות בלבד, ואני מסכימה ל<a href="/he/privacy-policy.html">מדיניות הפרטיות</a>.',
            );
        }

        host.appendChild(form);
        return { dialog: dialog, form: form };
    }

    function resetFormState() {
        if (!form) return;
        form.reset();
        form.querySelectorAll('.arc-form-field, .arc-form-consent, .arc-form-submit').forEach(function (el) {
            el.hidden = false;
        });
        var success = form.querySelector('#arcHeSuccess');
        if (success) success.hidden = true;
        setArcError('');
        var submitBtn = form.querySelector('#arcHeSubmit');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = msg('arc.form.submit', 'שליחת מועמדות');
            submitBtn.removeAttribute('aria-busy');
        }
        form.querySelectorAll('input, textarea').forEach(function (el) {
            el.disabled = false;
        });
        arcSubmitting = false;
    }

    function openModal() {
        if (!dialog) return;
        resetFormState();
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
        var first = form && form.querySelector('#arc-name');
        if (first) {
            window.setTimeout(function () {
                first.focus();
            }, 50);
        }
    }

    function closeModal() {
        if (!dialog) return;
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
    }

    function bindModal(triggerBtn) {
        var closeBtn = dialog.querySelector('#heArcDialogClose');

        if (triggerBtn) {
            triggerBtn.addEventListener(
                'click',
                function (e) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    openModal();
                },
                true,
            );
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                closeModal();
            });
        }

        dialog.addEventListener('cancel', function (e) {
            e.preventDefault();
            closeModal();
        });

        dialog.addEventListener('click', function (e) {
            if (e.target === dialog) closeModal();
        });

        dialog.addEventListener('close', resetFormState);
    }

    function setArcError(message) {
        if (!form) return;
        var arcErrorEl = form.querySelector('#arcHeError');
        if (!arcErrorEl) return;
        if (message) {
            arcErrorEl.textContent = message;
            arcErrorEl.hidden = false;
        } else {
            arcErrorEl.textContent = '';
            arcErrorEl.hidden = true;
        }
    }

    function isValidEmail(value) {
        var v = (value || '').trim();
        if (!v || v.length > 254) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    function bindForm() {
        if (!form) return;

        var arcSubmitBtn = form.querySelector('#arcHeSubmit');
        var arcSuccessPanel = form.querySelector('#arcHeSuccess');
        var arcSubmitDefaultLabel = arcSubmitBtn ? arcSubmitBtn.textContent : '';

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            setArcError('');

            if (arcSubmitting) return;

            var nameInput = form.querySelector('#arc-name');
            var emailInput = form.querySelector('#arc-email');
            var socialInput = form.querySelector('#arc-social');
            var messageInput = form.querySelector('#arc-message');
            var consentInput = form.querySelector('#arc-consent');

            var name = nameInput ? nameInput.value.trim() : '';
            var email = emailInput ? emailInput.value.trim() : '';
            var social = socialInput ? socialInput.value.trim() : '';
            var message = messageInput ? messageInput.value.trim() : '';
            var consent = consentInput ? consentInput.checked : false;

            if (name.length < 2) {
                if (nameInput) nameInput.focus();
                setArcError(msg('js.arc.nameRequired', 'אנא הזיני את שמך.'));
                return;
            }

            if (!isValidEmail(email)) {
                if (emailInput) emailInput.focus();
                setArcError(msg('js.arc.invalidEmail', 'אנא הזיני כתובת אימייל תקינה.'));
                return;
            }

            if (!consent) {
                if (consentInput) consentInput.focus();
                setArcError(msg('js.arc.consentRequired', 'אנא אשרי את תנאי ההגשה.'));
                return;
            }

            arcSubmitting = true;
            arcSubmitBtn.disabled = true;
            form.querySelectorAll('input, textarea, button').forEach(function (el) {
                el.disabled = true;
            });
            arcSubmitBtn.setAttribute('aria-busy', 'true');
            arcSubmitBtn.textContent = msg('js.arc.submitting', 'שולחת…');

            fetch(applyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    email: email,
                    social: social,
                    message: message,
                    locale: 'he',
                }),
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
                        form.querySelectorAll('.arc-form-field, .arc-form-consent, .arc-form-submit').forEach(function (el) {
                            el.hidden = true;
                        });
                        if (arcSuccessPanel) arcSuccessPanel.hidden = false;
                        if (typeof window.sendMetaCapiEvent === 'function') {
                            window.sendMetaCapiEvent({ eventName: 'Lead', email: email });
                        }
                        window.setTimeout(function () {
                            closeModal();
                        }, 2200);
                        return;
                    }
                    var errText =
                        out.data && out.data.error
                            ? out.data.error
                            : msg('js.arc.errorGeneric', 'משהו השתבש. אנא נסי שוב.');
                    setArcError(errText);
                })
                .catch(function () {
                    setArcError(msg('js.arc.errorGeneric', 'משהו השתבש. אנא נסי שוב.'));
                })
                .then(function () {
                    arcSubmitting = false;
                    if (arcSuccessPanel && !arcSuccessPanel.hidden) {
                        arcSubmitBtn.removeAttribute('aria-busy');
                        return;
                    }
                    form.querySelectorAll('input, textarea, button').forEach(function (el) {
                        el.disabled = false;
                    });
                    arcSubmitBtn.removeAttribute('aria-busy');
                    arcSubmitBtn.textContent = arcSubmitDefaultLabel;
                });
        });
    }

    function init() {
        var triggerBtn = prepareTriggerButton();
        var built = buildModal();
        dialog = built.dialog;
        form = built.form;
        bindModal(triggerBtn);
        bindForm();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
