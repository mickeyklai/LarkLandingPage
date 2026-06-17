(function () {
    var listEl = document.getElementById('blog-posts');
    var statusEl = document.getElementById('blog-status');
    if (!listEl || !statusEl) {
        return;
    }

    function msg(key, fallback) {
        if (window.LarkI18n && typeof window.LarkI18n.t === 'function') {
            return window.LarkI18n.t(key, fallback);
        }
        return fallback;
    }

    function localeTag() {
        var loc = 'en';
        if (window.LarkI18n && typeof window.LarkI18n.getLocale === 'function') {
            loc = window.LarkI18n.getLocale() || 'en';
        }
        var map = { en: 'en-US', he: 'he-IL' };
        return map[loc] || 'en-US';
    }

    function showStatus(msgText, isError) {
        statusEl.hidden = false;
        statusEl.textContent = msgText;
        statusEl.classList.toggle('blog-status--error', !!isError);
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
            return d.toLocaleDateString(localeTag(), {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch (_) {
            return '';
        }
    }

    function blogPostHref(slug) {
        var base = '/blog/' + encodeURIComponent(slug);
        if (window.LarkI18n && typeof window.LarkI18n.getLocale === 'function') {
            var loc = window.LarkI18n.getLocale();
            if (loc && loc !== 'en') return '/' + loc + base;
        }
        return base;
    }

    function renderPosts(posts) {
        listEl.innerHTML = '';
        if (!posts || !posts.length) {
            var empty = document.createElement('p');
            empty.className = 'blog-empty';
            empty.textContent = msg('js.blog.empty', 'No posts yet. Check back soon.');
            listEl.appendChild(empty);
            return;
        }

        posts.forEach(function (post) {
            var slug = post.slug;
            if (!slug) {
                return;
            }
            var a = document.createElement('a');
            a.className = 'blog-card';
            a.href = blogPostHref(slug);

            var meta = document.createElement('p');
            meta.className = 'blog-card-meta';
            meta.textContent = formatDate(post.publishedAt) || msg('js.blog.journal', 'Journal');

            var h = document.createElement('h2');
            h.className = 'blog-card-title';
            h.textContent = post.title || msg('js.blog.untitled', 'Untitled');

            a.appendChild(meta);
            a.appendChild(h);

            if (post.excerpt) {
                var ex = document.createElement('p');
                ex.className = 'blog-card-excerpt';
                ex.textContent = post.excerpt;
                a.appendChild(ex);
            }

            var arrow = document.createElement('div');
            arrow.className = 'blog-card-arrow';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.textContent = msg('js.blog.read', 'Read →');
            a.appendChild(arrow);

            listEl.appendChild(a);
        });
    }

    function loadPosts() {
        showStatus(msg('js.blog.loading', 'Loading…'), false);

        fetch('/.netlify/functions/blog-posts')
            .then(function (res) {
                return res.json().then(function (data) {
                    if (!res.ok) {
                        throw new Error((data && data.error) || 'Request failed');
                    }
                    return data;
                });
            })
            .then(function (posts) {
                statusEl.hidden = true;
                renderPosts(posts);
            })
            .catch(function (err) {
                showStatus(err.message || msg('js.blog.loadError', 'Could not load posts.'), true);
            });
    }

    if (window.LarkI18n && typeof window.LarkI18n.whenReady === 'function') {
        window.LarkI18n.whenReady(loadPosts);
    } else {
        loadPosts();
    }
})();
