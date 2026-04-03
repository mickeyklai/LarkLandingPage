(function () {
    var capiUrl = '/.netlify/functions/meta-capi';

    function sendMetaCapiEvent(payload) {
        var body = Object.assign({ eventSourceUrl: window.location.href }, payload);
        fetch(capiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
            .then(function (res) {
                return res.text().then(function (text) {
                    var data = {};
                    if (text) {
                        try {
                            data = JSON.parse(text);
                        } catch (ignore) {
                            data = { ok: false, raw: text };
                        }
                    }
                    console.log('CAPI Event Sent:', data);
                });
            })
            .catch(function (err) {
                console.log('CAPI Event Sent:', {
                    ok: false,
                    error: err && err.message ? err.message : String(err),
                });
            });
    }

    window.sendMetaCapiEvent = sendMetaCapiEvent;

    function attachBookArcClicks() {
        document.querySelectorAll('a[href="#the-book"], a[href="/#the-book"]').forEach(function (el) {
            el.addEventListener('click', function () {
                sendMetaCapiEvent({ eventName: 'ViewContent' });
            });
        });
        document.querySelectorAll('a[href="#arc"], a[href="/#arc"]').forEach(function (el) {
            el.addEventListener('click', function () {
                sendMetaCapiEvent({ eventName: 'Subscribe' });
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachBookArcClicks);
    } else {
        attachBookArcClicks();
    }
})();
