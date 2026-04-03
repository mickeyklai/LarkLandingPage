(function () {
    var listEl = document.getElementById('blog-posts');
    var statusEl = document.getElementById('blog-status');
    if (!listEl || !statusEl) {
        return;
    }

    function showStatus(msg, isError) {
        statusEl.hidden = false;
        statusEl.textContent = msg;
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
            return d.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch (_) {
            return '';
        }
    }

    function renderPosts(posts) {
        listEl.innerHTML = '';
        if (!posts || !posts.length) {
            var empty = document.createElement('p');
            empty.className = 'blog-empty';
            empty.textContent = 'No posts yet. Check back soon.';
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
            a.href = '/blog/' + encodeURIComponent(slug);

            var meta = document.createElement('p');
            meta.className = 'blog-card-meta';
            meta.textContent = formatDate(post.publishedAt) || 'Journal';

            var h = document.createElement('h2');
            h.className = 'blog-card-title';
            h.textContent = post.title || 'Untitled';

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
            arrow.textContent = 'Read →';
            a.appendChild(arrow);

            listEl.appendChild(a);
        });
    }

    showStatus('Loading…', false);

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
            showStatus(err.message || 'Could not load posts.', true);
        });
})();
