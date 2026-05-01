'use strict';

/**
 * Dynamic sitemap.xml. Combines static pages with every published Sanity `post`.
 * Output is XML and is cached at the edge for 5 minutes so newly published posts
 * (daily blog pipeline) reach Google quickly without hammering Sanity on every
 * crawl. Image sitemap entries are added when a post has a mainImage so Google
 * Images can index the dark-romance hero photography too.
 */

const { getSanityClient } = require('../../lib/sanity');

const SITE_ORIGIN = (
    process.env.SITE_ORIGIN ||
    process.env.URL ||
    'https://larkelwood.com'
)
    .trim()
    .replace(/\/+$/, '');

const POSTS_QUERY = `
  *[_type == "post" && !(_id in path("drafts.**")) && defined(slug.current)]
    | order(coalesce(publishedAt, _updatedAt) desc) {
      "slug": slug.current,
      title,
      excerpt,
      publishedAt,
      _updatedAt,
      "imageUrl": coalesce(mainImage.asset->url, body[_type=="image"][0].asset->url),
      "imageAlt": coalesce(mainImage.alt, body[_type=="image"][0].alt)
    }
`;

const STATIC_URLS = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/blog/', changefreq: 'daily', priority: '0.9' },
    { loc: '/privacy-policy.html', changefreq: 'yearly', priority: '0.2' },
];

const headers = {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
    'X-Robots-Tag': 'noindex',
};

function escapeXml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function abs(path) {
    if (!path) {
        return SITE_ORIGIN + '/';
    }
    if (/^https?:\/\//i.test(path)) {
        return path;
    }
    return SITE_ORIGIN + (path.startsWith('/') ? path : '/' + path);
}

function isoOrNow(value) {
    if (!value) {
        return new Date().toISOString();
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        return new Date().toISOString();
    }
    return d.toISOString();
}

function imageEntry(post) {
    if (!post.imageUrl) {
        return '';
    }
    const url = post.imageUrl.includes('?')
        ? post.imageUrl
        : `${post.imageUrl}?w=1200&auto=format`;
    const caption =
        post.imageAlt ||
        post.title ||
        'Dark romance mood — Lark Elwood, Independent';
    return (
        '    <image:image>\n' +
        `      <image:loc>${escapeXml(url)}</image:loc>\n` +
        `      <image:title>${escapeXml(post.title || 'Lark Elwood')}</image:title>\n` +
        `      <image:caption>${escapeXml(caption)}</image:caption>\n` +
        '    </image:image>\n'
    );
}

function urlBlock({ loc, lastmod, changefreq, priority, image }) {
    const lines = [
        '  <url>',
        `    <loc>${escapeXml(abs(loc))}</loc>`,
    ];
    if (lastmod) {
        lines.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`);
    }
    if (changefreq) {
        lines.push(`    <changefreq>${escapeXml(changefreq)}</changefreq>`);
    }
    if (priority) {
        lines.push(`    <priority>${escapeXml(priority)}</priority>`);
    }
    let body = lines.join('\n') + '\n';
    if (image) {
        body += image;
    }
    body += '  </url>\n';
    return body;
}

exports.handler = async function handler(event) {
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
        return { statusCode: 405, headers, body: '' };
    }

    let posts = [];
    try {
        const client = getSanityClient({ useCdn: true });
        posts = await client.fetch(POSTS_QUERY);
    } catch (err) {
        console.warn('sitemap: Sanity fetch failed; emitting static-only sitemap:', err.message);
        posts = [];
    }

    const now = new Date().toISOString();
    const xmlParts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ];

    for (const u of STATIC_URLS) {
        xmlParts.push(
            urlBlock({
                loc: u.loc,
                lastmod: now,
                changefreq: u.changefreq,
                priority: u.priority,
            }),
        );
    }

    for (const post of posts) {
        if (!post || !post.slug) {
            continue;
        }
        xmlParts.push(
            urlBlock({
                loc: `/blog/${encodeURIComponent(post.slug)}`,
                lastmod: isoOrNow(post._updatedAt || post.publishedAt),
                changefreq: 'monthly',
                priority: '0.8',
                image: imageEntry(post),
            }),
        );
    }

    xmlParts.push('</urlset>');

    return {
        statusCode: 200,
        headers,
        body: xmlParts.join('\n'),
    };
};
