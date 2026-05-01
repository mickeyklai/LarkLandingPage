/**
 * Server-side SEO injection for the homepage. Two jobs:
 *   1. Render the latest 6 Sanity blog posts directly into the HTML so search
 *      engines see real internal links from larkelwood.com (the strongest URL)
 *      to every fresh blog post the moment it's crawled. This is the biggest
 *      lever for ranking the dark-romance blog and pulling its authority
 *      back to the homepage.
 *   2. Inject an ItemList JSON-LD with those posts so Google understands
 *      the homepage carries the journal feed.
 *
 * Only triggers on `/` and `/index.html`. Uses the primary Sanity API (not apicdn)
 * so the latest posts match what serverless functions return right after publish.
 *
 * Requires SANITY_PROJECT_ID (and optional SANITY_DATASET, SANITY_API_VERSION).
 */

function escAttr(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escText(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatDate(iso) {
    if (!iso) {
        return '';
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        return '';
    }
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

function isoDate(iso) {
    if (!iso) {
        return '';
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
        return '';
    }
    return d.toISOString();
}

async function fetchLatestPosts(projectId, dataset, apiVersion) {
    const query = `*[_type == "post" && !(_id in path("drafts.**")) && defined(slug.current)]
      | order(coalesce(publishedAt, _updatedAt) desc) [0...6] {
        title,
        "slug": slug.current,
        excerpt,
        publishedAt
      }`;
    const u = new URL(
        `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}`,
    );
    u.searchParams.set('query', query);
    try {
        const r = await fetch(u.toString(), {
            headers: { Accept: 'application/json' },
        });
        if (!r.ok) {
            return [];
        }
        const data = await r.json();
        return Array.isArray(data.result) ? data.result : [];
    } catch (_) {
        return [];
    }
}

function buildLatestPostsHtml(posts) {
    if (!Array.isArray(posts) || posts.length === 0) {
        return '';
    }
    const cards = posts
        .map((p) => {
            if (!p || !p.slug) {
                return '';
            }
            const url = `/blog/${encodeURIComponent(p.slug)}`;
            const title = p.title || 'Untitled';
            const date = formatDate(p.publishedAt) || 'Journal';
            const dateAttr = isoDate(p.publishedAt) || '';
            const excerpt = p.excerpt || '';
            return (
                `<a class="home-journal-card" href="${escAttr(url)}">` +
                `<p class="home-journal-card-meta">` +
                (dateAttr
                    ? `<time datetime="${escAttr(dateAttr)}">${escText(date)}</time>`
                    : escText(date)) +
                `</p>` +
                `<h3 class="home-journal-card-title">${escText(title)}</h3>` +
                (excerpt
                    ? `<p class="home-journal-card-excerpt">${escText(excerpt)}</p>`
                    : '') +
                `<span class="home-journal-card-arrow" aria-hidden="true">Read &rarr;</span>` +
                `</a>`
            );
        })
        .filter(Boolean)
        .join('');
    return (
        `<section class="home-journal-section content-section" id="journal" aria-labelledby="journal-heading">` +
        `<div class="section-inner">` +
        `<span class="section-kicker">Book roundups</span>` +
        `<h2 class="section-heading text-center" id="journal-heading">Five-book dark romance reading lists</h2>` +
        `<p class="home-journal-lead">New five-novel stacks from Lark Elwood: comps, tropes, spice, and obsession—each list nudges you toward debut <em>Independent</em> if today's picks own your ribs.</p>` +
        `<div class="home-journal-grid">${cards}</div>` +
        `<p class="home-journal-more"><a class="home-journal-more-link" href="/blog/">All reading lists &amp; vibes &rarr;</a></p>` +
        `</div>` +
        `</section>`
    );
}

function buildItemListJsonLd(posts) {
    if (!Array.isArray(posts) || posts.length === 0) {
        return '';
    }
    const items = posts
        .map((p, idx) => {
            if (!p || !p.slug) {
                return null;
            }
            return {
                '@type': 'ListItem',
                position: idx + 1,
                url: `https://larkelwood.com/blog/${encodeURIComponent(p.slug)}`,
                name: p.title || 'Untitled',
            };
        })
        .filter(Boolean);
    if (items.length === 0) {
        return '';
    }
    const obj = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Lark Elwood — Latest five-book dark romance roundups',
        itemListElement: items,
    };
    return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

export default async (request, context) => {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path !== '/' && path !== '/index.html') {
        return context.next();
    }

    const projectId = Deno.env.get('SANITY_PROJECT_ID');
    const dataset = Deno.env.get('SANITY_DATASET') || 'production';
    const apiVersion = Deno.env.get('SANITY_API_VERSION') || '2024-01-01';

    const res = await context.next();
    if (res.status !== 200) {
        return res;
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) {
        return res;
    }

    if (!projectId || String(projectId).trim() === '') {
        return res;
    }

    const html = await res.text();

    const slot = '<!-- home-journal-inject -->';
    const ldSlot = '<!-- home-itemlist-inject -->';
    if (!html.includes(slot)) {
        return new Response(html, { status: res.status, headers: res.headers });
    }

    const posts = await fetchLatestPosts(
        String(projectId).trim(),
        dataset,
        apiVersion,
    );

    let injected = html.replace(slot, buildLatestPostsHtml(posts) || '');
    if (injected.includes(ldSlot)) {
        injected = injected.replace(ldSlot, buildItemListJsonLd(posts));
    }

    const headers = new Headers(res.headers);
    headers.delete('content-length');
    return new Response(injected, { status: res.status, headers });
};
