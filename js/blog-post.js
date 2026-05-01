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

    function metaByProperty(prop) {
        var el = document.head.querySelector('meta[property="' + prop + '"]');
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute('property', prop);
            document.head.appendChild(el);
        }
        return el;
    }

    function metaByName(name) {
        var el = document.head.querySelector('meta[name="' + name + '"]');
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute('name', name);
            document.head.appendChild(el);
        }
        return el;
    }

    function upsertJsonLd(id, obj) {
        var existing = document.getElementById(id);
        if (existing) {
            existing.parentNode.removeChild(existing);
        }
        var s = document.createElement('script');
        s.type = 'application/ld+json';
        s.id = id;
        s.textContent = JSON.stringify(obj);
        document.head.appendChild(s);
    }

    function setOgFromPost(post) {
        if (!post) {
            return;
        }
        var absUrl = function (u) {
            if (!u) {
                return '';
            }
            try {
                return new URL(u, window.location.origin).href;
            } catch (_) {
                return u;
            }
        };

        var desc =
            (post.seoDescription && String(post.seoDescription).trim()) ||
            (post.excerpt && String(post.excerpt).trim()) ||
            'Dark romance journal entry by Lark Elwood, author of Independent.';
        var pageUrl = window.location.href.split('#')[0];
        var titleForOg = post.seoTitle || post.title || 'Lark Elwood — Dark Romance Journal';
        var keywords =
            Array.isArray(post.keywords) && post.keywords.length
                ? post.keywords.join(', ')
                : 'dark romance, Lark Elwood, Independent novel, morally grey hero';
        var noindex = post.noindex === true;
        var robots = noindex
            ? 'noindex, nofollow'
            : 'index, follow, max-image-preview:large, max-snippet:-1';

        metaByName('description').setAttribute('content', desc);
        metaByName('robots').setAttribute('content', robots);
        metaByName('googlebot').setAttribute('content', robots);
        metaByName('author').setAttribute('content', 'Lark Elwood');
        metaByName('keywords').setAttribute('content', keywords);
        metaByName('theme-color').setAttribute('content', '#0a0a0a');

        metaByProperty('og:type').setAttribute('content', 'article');
        metaByProperty('og:site_name').setAttribute('content', 'Lark Elwood');
        metaByProperty('og:locale').setAttribute('content', 'en_US');
        metaByProperty('og:title').setAttribute('content', titleForOg);
        metaByProperty('og:description').setAttribute('content', desc);
        metaByProperty('og:url').setAttribute('content', pageUrl);
        if (post.publishedAt) {
            metaByProperty('article:published_time').setAttribute(
                'content',
                new Date(post.publishedAt).toISOString(),
            );
        }
        if (post._updatedAt) {
            metaByProperty('article:modified_time').setAttribute(
                'content',
                new Date(post._updatedAt).toISOString(),
            );
        }
        metaByProperty('article:author').setAttribute(
            'content',
            'https://larkelwood.com/#author',
        );
        metaByProperty('article:section').setAttribute('content', 'Dark Romance');

        if (post.ogImage) {
            metaByProperty('og:image').setAttribute('content', absUrl(post.ogImage));
            if (post.ogImageWidth) {
                metaByProperty('og:image:width').setAttribute('content', String(post.ogImageWidth));
            }
            if (post.ogImageHeight) {
                metaByProperty('og:image:height').setAttribute('content', String(post.ogImageHeight));
            }
            metaByName('twitter:card').setAttribute('content', 'summary_large_image');
            metaByName('twitter:image').setAttribute('content', absUrl(post.ogImage));
        }

        metaByName('twitter:title').setAttribute('content', titleForOg);
        metaByName('twitter:description').setAttribute('content', desc);
        metaByName('twitter:site').setAttribute('content', '@larkelwood');
        metaByName('twitter:creator').setAttribute('content', '@larkelwood');

        var link = document.head.querySelector('link[rel="canonical"]');
        if (!link) {
            link = document.createElement('link');
            link.setAttribute('rel', 'canonical');
            document.head.appendChild(link);
        }
        link.setAttribute('href', pageUrl);

        // BlogPosting + Breadcrumb JSON-LD (mirror of edge function output for
        // crawlers that only see the JS-rendered page, e.g. some lightweight
        // bots and re-crawls before the edge function runs).
        var article = {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
            headline: (post.title || 'Lark Elwood').slice(0, 110),
            description: desc,
            inLanguage: 'en',
            articleSection: 'Dark Romance',
            keywords: keywords,
            isPartOf: { '@id': 'https://larkelwood.com/blog/#blog' },
            about: {
                '@type': 'Book',
                '@id': 'https://larkelwood.com/#book',
                name: 'Independent',
            },
            author: {
                '@type': 'Person',
                '@id': 'https://larkelwood.com/#author',
                name: 'Lark Elwood',
                url: 'https://larkelwood.com/',
            },
            publisher: {
                '@type': 'Person',
                '@id': 'https://larkelwood.com/#author',
                name: 'Lark Elwood',
                url: 'https://larkelwood.com/',
                logo: {
                    '@type': 'ImageObject',
                    url: 'https://larkelwood.com/assets/og-lark-elwood.jpg',
                    width: 1200,
                    height: 630,
                },
            },
        };
        if (post.publishedAt) {
            article.datePublished = new Date(post.publishedAt).toISOString();
        }
        if (post._updatedAt) {
            article.dateModified = new Date(post._updatedAt).toISOString();
        } else if (post.publishedAt) {
            article.dateModified = new Date(post.publishedAt).toISOString();
        }
        if (post.ogImage) {
            article.image = {
                '@type': 'ImageObject',
                url: absUrl(post.ogImage),
                width: post.ogImageWidth || undefined,
                height: post.ogImageHeight || undefined,
            };
        }
        upsertJsonLd('ld-article', article);

        upsertJsonLd('ld-breadcrumb', {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://larkelwood.com/' },
                {
                    '@type': 'ListItem',
                    position: 2,
                    name: 'Dark Romance Journal',
                    item: 'https://larkelwood.com/blog/',
                },
                { '@type': 'ListItem', position: 3, name: post.title || 'Post', item: pageUrl },
            ],
        });
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

    fetch(url, { cache: 'no-store' })
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

            setOgFromPost(post);

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

            // If HTML is missing some figures (stale cache, older deploy), append the rest from imageUrls.
            var urls = post.imageUrls;
            if (urls && urls.length) {
                var nImg = proseEl.querySelectorAll('img').length;
                for (var i = nImg; i < urls.length; i++) {
                    var src = urls[i];
                    if (!src) {
                        continue;
                    }
                    var fig = document.createElement('figure');
                    fig.className = 'blog-prose-figure';
                    var img = document.createElement('img');
                    img.src = src;
                    img.alt = '';
                    img.decoding = 'async';
                    img.loading = i === 0 && nImg === 0 ? 'eager' : 'lazy';
                    fig.appendChild(img);
                    proseEl.appendChild(fig);
                }
            }
        })
        .catch(function (err) {
            showStatus(err.message || 'Could not load this post.', true);
        });
})();
