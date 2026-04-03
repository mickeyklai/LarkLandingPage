(function () {
    var articleEl = document.getElementById('blog-article');
    var statusEl = document.getElementById('blog-status');
    var titleEl = document.getElementById('blog-article-title');
    var metaEl = document.getElementById('blog-article-meta');
    var dekEl = document.getElementById('blog-article-dek');
    var proseEl = document.getElementById('blog-prose');

    if (!articleEl || !statusEl || !titleEl || !metaEl || !dekEl || !proseEl) {
        return;
    }

    function showStatus(msg, isError) {
        statusEl.hidden = false;
        statusEl.textContent = msg;
        statusEl.classList.toggle('blog-status--error', !!isError);
        articleEl.hidden = true;
    }

    function hideStatus() {
        statusEl.hidden = true;
        articleEl.hidden = false;
    }

    function getSlugFromPath() {
        var path = window.location.pathname.replace(/\/+$/, '');
        var parts = path.split('/').filter(Boolean);
        var last = parts[parts.length - 1];
        if (!last || last === 'post.html') {
            return '';
        }
        return decodeURIComponent(last);
    }

    function formatDate(iso) {
        if (!iso) {
            return '';
        }
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) {
                return '';
            }
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch (_) {
            return '';
        }
    }

    var slug = getSlugFromPath();
    if (!slug) {
        showStatus('No article selected.', true);
        return;
    }

    showStatus('Loading…', false);

    var url = '/.netlify/functions/blog-post?slug=' + encodeURIComponent(slug);

    fetch(url)
        .then(function (res) {
            return res.json().then(function (data) {
                if (res.status === 404) {
                    throw new Error('This post could not be found.');
                }
                if (!res.ok) {
                    throw new Error((data && data.error) || 'Request failed');
                }
                return data;
            });
        })
        .then(function (post) {
            hideStatus();
            document.title =
                (post.title ? post.title + ' | ' : '') + 'Lark Elwood | Blog';

            titleEl.textContent = post.title || 'Untitled';
            metaEl.textContent = formatDate(post.publishedAt) || 'Journal';

            if (post.excerpt) {
                dekEl.hidden = false;
                dekEl.textContent = post.excerpt;
            } else {
                dekEl.hidden = true;
                dekEl.textContent = '';
            }

            proseEl.innerHTML = post.bodyHtml || '';
        })
        .catch(function (err) {
            showStatus(err.message || 'Could not load this post.', true);
        });
})();
