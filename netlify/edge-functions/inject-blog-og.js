/**
 * Injects Open Graph / Twitter meta and <title> for blog post URLs so crawlers (e.g. Pinterest)
 * see image and copy without executing client JS. Runs on `/blog/{slug}` only; list page and
 * static names pass through. Requires SANITY_PROJECT_ID (and optional SANITY_DATASET,
 * SANITY_API_VERSION) in Netlify environment — same as functions.
 */

function escAttr(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function fetchSanityPostMeta(projectId, dataset, apiVersion, slug) {
    const query = `*[_type == "post" && !(_id in path("drafts.**")) && slug.current == $slug][0]{
    title,
    excerpt,
    "slug": slug.current,
    "ogUrl": coalesce(mainImage.asset->url, body[_type=="image"][0].asset->url),
    "ogW": coalesce(mainImage.asset->metadata.dimensions.width, body[_type=="image"][0].asset->metadata.dimensions.width),
    "ogH": coalesce(mainImage.asset->metadata.dimensions.height, body[_type=="image"][0].asset->metadata.dimensions.height)
  }`;
    const u = new URL(`https://${projectId}.apicdn.sanity.io/v${apiVersion}/data/query/${dataset}`);
    u.searchParams.set('query', query);
    u.searchParams.set('$slug', slug);
    const r = await fetch(u.toString(), { headers: { Accept: 'application/json' } });
    if (!r.ok) {
        return null;
    }
    const data = await r.json();
    return data.result || null;
}

function ogImageUrl(raw) {
    if (!raw || typeof raw !== 'string') {
        return '';
    }
    const base = raw.split('?')[0];
    return `${base}?w=1200&auto=format`;
}

function injectHead(html, meta, canonicalUrl) {
    const title = meta.title ? `${meta.title} | Lark Elwood | Blog` : 'Post | Lark Elwood | Blog';
    const desc = (meta.excerpt || 'Read the latest from Lark Elwood.').trim();
    const ogUrl = meta.ogUrl ? ogImageUrl(meta.ogUrl) : '';
    const w = typeof meta.ogW === 'number' ? meta.ogW : '';
    const h = typeof meta.ogH === 'number' ? meta.ogH : '';

    const ogBlock =
        `<meta property="og:type" content="article">` +
        `<meta property="og:title" content="${escAttr(meta.title || 'Blog')}">` +
        `<meta property="og:description" content="${escAttr(desc)}">` +
        `<meta property="og:url" content="${escAttr(canonicalUrl)}">` +
        (ogUrl
            ? `<meta property="og:image" content="${escAttr(ogUrl)}">` +
              (w !== '' ? `<meta property="og:image:width" content="${escAttr(String(w))}">` : '') +
              (h !== '' ? `<meta property="og:image:height" content="${escAttr(String(h))}">` : '')
            : '') +
        `<meta name="twitter:card" content="summary_large_image">` +
        `<meta name="twitter:title" content="${escAttr(meta.title || 'Blog')}">` +
        `<meta name="twitter:description" content="${escAttr(desc)}">` +
        (ogUrl ? `<meta name="twitter:image" content="${escAttr(ogUrl)}">` : '') +
        `<link rel="canonical" href="${escAttr(canonicalUrl)}">`;

    let out = html.replace(/<title>[^<]*<\/title>/i, `<title>${escAttr(title)}</title>`);
    out = out.replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escAttr(desc)}">`);

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
