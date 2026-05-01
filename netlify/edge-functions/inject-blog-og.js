/**
 * Server-side SEO injection for blog post URLs `/blog/{slug}`.
 * Crawlers (Google, Pinterest, Twitter, Facebook) don't execute the SPA JS, so
 * everything they need has to be in the initial HTML response. This function
 * fetches the post from Sanity at the edge and injects:
 *
 *   - <title> with dark-romance brand suffix
 *   - <meta name="description"> (post excerpt or seoDescription)
 *   - <meta name="keywords">
 *   - Open Graph / Twitter (image, title, description, canonical)
 *   - <link rel="canonical">
 *   - JSON-LD: BlogPosting (Article) + BreadcrumbList — required for Google
 *     to surface the post as a rich result and a journal entry of the brand.
 *
 * Runs on `/blog/*` only; the index and `post.html` literal pass through.
 * Requires SANITY_PROJECT_ID (and optional SANITY_DATASET, SANITY_API_VERSION).
 */

const SITE_ORIGIN = 'https://larkelwood.com';
const AUTHOR_NAME = 'Lark Elwood';
const PUBLISHER_LOGO = 'https://larkelwood.com/assets/og-lark-elwood.jpg';

function escAttr(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escJson(s) {
    // For JSON.stringify-encoded values that get embedded into <script type="application/ld+json">
    return String(s ?? '').replace(/</g, '\\u003c');
}

async function fetchSanityPostMeta(projectId, dataset, apiVersion, slug) {
    const query = `*[_type == "post" && !(_id in path("drafts.**")) && slug.current == $slug][0]{
    title,
    excerpt,
    seoSnippet,
    "slug": slug.current,
    publishedAt,
    _updatedAt,
    seoTitle,
    seoDescription,
    keywords,
    targetTrope,
    relatedAuthorsBooks,
    noindex,
    "ogUrl": coalesce(seoImage.asset->url, mainImage.asset->url, body[_type=="image"][0].asset->url),
    "ogW": coalesce(seoImage.asset->metadata.dimensions.width, mainImage.asset->metadata.dimensions.width, body[_type=="image"][0].asset->metadata.dimensions.width),
    "ogH": coalesce(seoImage.asset->metadata.dimensions.height, mainImage.asset->metadata.dimensions.height, body[_type=="image"][0].asset->metadata.dimensions.height),
    "ogAlt": coalesce(seoImage.alt, mainImage.alt, body[_type=="image"][0].alt)
  }`;
    // Use api (not apicdn) so new posts + image patches are visible to crawlers immediately.
    const u = new URL(`https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}`);
    u.searchParams.set('query', query);
    u.searchParams.set('$slug', slug);
    try {
        const r = await fetch(u.toString(), { headers: { Accept: 'application/json' } });
        if (!r.ok) {
            return null;
        }
        const data = await r.json();
        return data.result || null;
    } catch (_) {
        return null;
    }
}

function ogImageUrl(raw) {
    if (!raw || typeof raw !== 'string') {
        return '';
    }
    const base = raw.split('?')[0];
    // Pinterest / Facebook crawlers are more reliable with JPEG og:image than WebP.
    return `${base}?w=1200&fm=jpg&q=82&fit=max`;
}

/** Merge Sanity keywords + trope + related names for meta + JSON-LD (deduped). */
function mergedKeywordList(meta) {
    const seen = new Set();
    const out = [];
    function add(val) {
        const x = String(val ?? '').trim();
        if (!x) return;
        const k = x.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        out.push(x);
    }
    if (Array.isArray(meta.keywords)) {
        meta.keywords.forEach(add);
    }
    if (meta.targetTrope) add(meta.targetTrope);
    if (Array.isArray(meta.relatedAuthorsBooks)) {
        meta.relatedAuthorsBooks.forEach(add);
    }
    return out.slice(0, 24);
}

function mentionsFromRelated(meta) {
    if (!Array.isArray(meta.relatedAuthorsBooks)) {
        return [];
    }
    const clean = [
        ...new Set(meta.relatedAuthorsBooks.map((x) => String(x || '').trim()).filter(Boolean)),
    ].slice(0, 14);
    return clean.map((name) => ({
        '@type': 'Thing',
        name,
        description: 'Editorial genre comparison / reader discovery — Lark Elwood dark romance.',
    }));
}

function aboutEntities(meta) {
    const about = [
        {
            '@type': 'Book',
            '@id': `${SITE_ORIGIN}/#book`,
            name: 'Independent',
            author: { '@id': `${SITE_ORIGIN}/#author` },
            genre: ['Dark Romance'],
        },
    ];
    const trope = meta.targetTrope && String(meta.targetTrope).trim();
    if (trope) {
        about.push({
            '@type': 'DefinedTerm',
            name: trope,
            inDefinedTermSet: {
                '@type': 'DefinedTermSet',
                name: 'Romance fiction tropes',
            },
        });
    }
    return about;
}

function buildArticleJsonLd(meta, canonicalUrl, ogUrl) {
    const fullDesc =
        (meta.seoDescription && String(meta.seoDescription).trim()) ||
        (meta.seoSnippet && String(meta.seoSnippet).trim()) ||
        (meta.excerpt && String(meta.excerpt).trim()) ||
        'Dark romance journal entry from Lark Elwood, author of Independent.';
    const snippet = (meta.seoSnippet && String(meta.seoSnippet).trim()) || '';
    const kwList = mergedKeywordList(meta);

    const obj = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
        headline: (meta.title || 'Lark Elwood').slice(0, 110),
        description: fullDesc.slice(0, 500),
        author: {
            '@type': 'Person',
            '@id': `${SITE_ORIGIN}/#author`,
            name: AUTHOR_NAME,
            url: SITE_ORIGIN + '/',
        },
        publisher: {
            '@type': 'Person',
            '@id': `${SITE_ORIGIN}/#author`,
            name: AUTHOR_NAME,
            url: SITE_ORIGIN + '/',
            logo: {
                '@type': 'ImageObject',
                url: PUBLISHER_LOGO,
                width: 1200,
                height: 630,
            },
        },
        inLanguage: 'en',
        articleSection: 'Dark Romance',
        about: aboutEntities(meta),
        isPartOf: { '@id': `${SITE_ORIGIN}/blog/#blog` },
    };
    if (snippet) {
        obj.abstract = snippet.slice(0, 320);
    }
    const mentions = mentionsFromRelated(meta);
    if (mentions.length) {
        obj.mentions = mentions;
    }
    if (meta.publishedAt) {
        obj.datePublished = new Date(meta.publishedAt).toISOString();
    }
    if (meta._updatedAt) {
        obj.dateModified = new Date(meta._updatedAt).toISOString();
    } else if (meta.publishedAt) {
        obj.dateModified = new Date(meta.publishedAt).toISOString();
    }
    if (kwList.length) {
        obj.keywords = kwList.join(', ');
    }
    if (ogUrl) {
        obj.image = {
            '@type': 'ImageObject',
            url: ogUrl,
            width: typeof meta.ogW === 'number' ? meta.ogW : undefined,
            height: typeof meta.ogH === 'number' ? meta.ogH : undefined,
        };
    }
    return JSON.stringify(obj);
}

function buildBreadcrumbJsonLd(meta, canonicalUrl) {
    const obj = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN + '/' },
            { '@type': 'ListItem', position: 2, name: 'Dark romance reading lists', item: SITE_ORIGIN + '/blog/' },
            { '@type': 'ListItem', position: 3, name: meta.title || 'Post', item: canonicalUrl },
        ],
    };
    return JSON.stringify(obj);
}

function injectHead(html, meta, canonicalUrl) {
    const seoTitleRaw =
        (meta.seoTitle && String(meta.seoTitle).trim()) ||
        (meta.title ? String(meta.title).trim() : '');
    const title = seoTitleRaw
        ? `${seoTitleRaw} — Lark Elwood (Dark Romance)`
        : 'Dark romance reading lists — Lark Elwood';
    const desc = (
        (meta.seoDescription && String(meta.seoDescription).trim()) ||
        (meta.seoSnippet && String(meta.seoSnippet).trim()) ||
        (meta.excerpt && String(meta.excerpt).trim()) ||
        'Dark romance journal entry by Lark Elwood, author of Independent.'
    ).slice(0, 320);
    const ogUrl = meta.ogUrl ? ogImageUrl(meta.ogUrl) : '';
    const ogAlt = meta.ogAlt || meta.title || 'Lark Elwood — dark romance';
    const w = typeof meta.ogW === 'number' ? meta.ogW : '';
    const h = typeof meta.ogH === 'number' ? meta.ogH : '';
    const noindex = meta.noindex === true;
    const robots = noindex
        ? 'noindex, nofollow'
        : 'index, follow, max-image-preview:large, max-snippet:-1';
    let keywordsArr = mergedKeywordList(meta);
    if (!keywordsArr.length) {
        keywordsArr = ['dark romance', 'Lark Elwood', 'Independent novel', 'morally grey hero'];
    }
    const keywords = keywordsArr.join(', ');

    const articleJsonLd = buildArticleJsonLd(meta, canonicalUrl, ogUrl);
    const breadcrumbJsonLd = buildBreadcrumbJsonLd(meta, canonicalUrl);

    const ogBlock =
        `<meta name="robots" content="${escAttr(robots)}">` +
        `<meta name="googlebot" content="${escAttr(robots)}">` +
        `<meta name="author" content="${escAttr(AUTHOR_NAME)}">` +
        `<meta name="keywords" content="${escAttr(keywords)}">` +
        `<meta name="theme-color" content="#0a0a0a">` +
        `<meta property="og:type" content="article">` +
        `<meta property="og:site_name" content="Lark Elwood">` +
        `<meta property="og:locale" content="en_US">` +
        `<meta property="og:title" content="${escAttr(meta.title || 'Five dark romance picks — Lark Elwood')}">` +
        `<meta property="og:description" content="${escAttr(desc)}">` +
        `<meta property="og:url" content="${escAttr(canonicalUrl)}">` +
        (ogUrl
            ? `<meta property="og:image" content="${escAttr(ogUrl)}">` +
              `<meta property="og:image:secure_url" content="${escAttr(ogUrl)}">` +
              `<meta property="og:image:alt" content="${escAttr(ogAlt)}">` +
              (w !== '' ? `<meta property="og:image:width" content="${escAttr(String(w))}">` : '') +
              (h !== '' ? `<meta property="og:image:height" content="${escAttr(String(h))}">` : '')
            : '') +
        (meta.publishedAt
            ? `<meta property="article:published_time" content="${escAttr(new Date(meta.publishedAt).toISOString())}">`
            : '') +
        (meta._updatedAt
            ? `<meta property="article:modified_time" content="${escAttr(new Date(meta._updatedAt).toISOString())}">`
            : '') +
        `<meta property="article:author" content="${escAttr(SITE_ORIGIN + '/#author')}">` +
        `<meta property="article:section" content="Dark Romance">` +
        keywordsArr
            .slice(0, 12)
            .map((k) => `<meta property="article:tag" content="${escAttr(k)}">`)
            .join('') +
        `<meta name="twitter:card" content="summary_large_image">` +
        `<meta name="twitter:site" content="@larkelwood">` +
        `<meta name="twitter:creator" content="@larkelwood">` +
        `<meta name="twitter:title" content="${escAttr(meta.title || 'Five dark romance picks — Lark Elwood')}">` +
        `<meta name="twitter:description" content="${escAttr(desc)}">` +
        (ogUrl
            ? `<meta name="twitter:image" content="${escAttr(ogUrl)}">` +
              `<meta name="twitter:image:alt" content="${escAttr(ogAlt)}">`
            : '') +
        `<link rel="canonical" href="${escAttr(canonicalUrl)}">` +
        `<link rel="alternate" type="application/rss+xml" title="Lark Elwood — Five-Book Dark Romance Lists" href="${escAttr(SITE_ORIGIN + '/feed.xml')}">` +
        `<script type="application/ld+json">${escJson(articleJsonLd)}</script>` +
        `<script type="application/ld+json">${escJson(breadcrumbJsonLd)}</script>`;

    let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${escAttr(title)}</title>`);
    out = out.replace(
        /<meta\s+name="description"[^>]*>/i,
        `<meta name="description" content="${escAttr(desc)}">`,
    );

    if (out.includes('<!-- blog-og-inject -->')) {
        out = out.replace('<!-- blog-og-inject -->', ogBlock);
    } else {
        out = out.replace(/<meta charset="UTF-8">/i, `<meta charset="UTF-8">\n    ${ogBlock}`);
    }

    return out;
}

export default async (request, context) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] !== 'blog' || parts.length < 2) {
        return context.next();
    }

    const slug = parts[1];
    if (slug === 'index.html' || slug === 'post.html' || slug === '') {
        return context.next();
    }

    if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
        return context.next();
    }

    const projectId = Deno.env.get('SANITY_PROJECT_ID');
    const dataset = Deno.env.get('SANITY_DATASET') || 'production';
    const apiVersion = Deno.env.get('SANITY_API_VERSION') || '2024-01-01';

    if (!projectId || String(projectId).trim() === '') {
        return context.next();
    }

    const meta = await fetchSanityPostMeta(String(projectId).trim(), dataset, apiVersion, slug);
    if (!meta || !meta.title) {
        return context.next();
    }

    const res = await context.next();
    if (res.status !== 200) {
        return res;
    }

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) {
        return res;
    }

    const html = await res.text();
    const canonicalUrl = `${url.origin}/blog/${encodeURIComponent(slug)}`;
    const injected = injectHead(html, meta, canonicalUrl);
    const headers = new Headers(res.headers);
    headers.delete('content-length');

    return new Response(injected, { status: res.status, headers });
};
