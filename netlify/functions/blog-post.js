'use strict';

const { createImageUrlBuilder } = require('@sanity/image-url');
const { getSanityClient } = require('../../lib/sanity');

const DETAIL_QUERY = `
  *[_type == "post" && slug.current == $slug][0] {
    title,
    "slug": slug.current,
    publishedAt,
    excerpt,
    body[]{
      ...,
      _type == "image" => {
        ...,
        asset->{
          _id,
          url,
          metadata {
            dimensions {
              width,
              height
            }
          }
        }
      }
    }
  }
`;

const headers = {
    'Content-Type': 'application/json',
    // Avoid stale JSON at the edge/browser after schema or serializer changes (images in body).
    'Cache-Control': 'public, max-age=0, must-revalidate, s-maxage=60',
};

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function wrapMarks(text, marks, markDefs) {
    let out = text;
    for (const mark of marks || []) {
        if (mark === 'strong' || mark === 'b') {
            out = `<strong>${out}</strong>`;
        } else if (mark === 'em' || mark === 'i') {
            out = `<em>${out}</em>`;
        } else if (mark === 'strike-through') {
            out = `<del>${out}</del>`;
        } else if (mark === 'code') {
            out = `<code>${out}</code>`;
        } else if (mark === 'u' || mark === 'underline') {
            out = `<u>${out}</u>`;
        } else {
            const def = (markDefs || []).find((m) => m._key === mark);
            if (def && def._type === 'link' && def.href) {
                const href = escapeHtml(def.href);
                const ext = /^https?:\/\//i.test(def.href);
                const extra = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
                out = `<a href="${href}"${extra}>${out}</a>`;
            }
        }
    }
    return out;
}

function serializeSpans(children, markDefs) {
    if (!Array.isArray(children)) {
        return '';
    }
    return children
        .map((child) => {
            if (!child || child._type !== 'span') {
                return '';
            }
            const raw = escapeHtml(child.text || '');
            return wrapMarks(raw, child.marks, markDefs);
        })
        .join('');
}

function imageBlockUrl(block, builder) {
    const asset = block && block.asset;
    if (!asset || typeof asset !== 'object') {
        return '';
    }

    let url = '';
    if (builder) {
        try {
            url = builder.image(block).width(1400).auto('format').url();
        } catch (_) {
            /* malformed crop/ref — try direct asset URL below */
        }
    }

    if (!url && typeof asset.url === 'string' && /^https?:\/\//i.test(asset.url)) {
        const base = asset.url.split('?')[0];
        url = `${base}?w=1400&auto=format`;
    }

    return url || '';
}

function imgDimensionAttrs(block) {
    const d = block && block.asset && block.asset.metadata && block.asset.metadata.dimensions;
    if (!d || typeof d.width !== 'number' || typeof d.height !== 'number') {
        return '';
    }
    const w = Math.round(d.width);
    const h = Math.round(d.height);
    if (w <= 0 || h <= 0) {
        return '';
    }
    return ` width="${w}" height="${h}"`;
}

function imageBlockToHtml(url, loadingAttr, block) {
    if (!url) {
        return '';
    }
    const loading = loadingAttr === 'eager' ? 'eager' : 'lazy';
    const dim = imgDimensionAttrs(block);
    return (
        '<figure class="blog-prose-figure">' +
        `<img src="${escapeHtml(url)}" alt="" loading="${loading}" decoding="async"${dim} />` +
        '</figure>'
    );
}

function collectImageUrls(blocks, { projectId, dataset } = {}) {
    if (!Array.isArray(blocks)) {
        return [];
    }
    const builder =
        projectId && String(projectId).trim()
            ? createImageUrlBuilder({ projectId: String(projectId).trim(), dataset: dataset || 'production' })
            : null;
    const urls = [];
    for (const block of blocks) {
        if (block && block._type === 'image') {
            const u = imageBlockUrl(block, builder);
            if (u) {
                urls.push(u);
            }
        }
    }
    return urls;
}

/** Minimal Portable Text → HTML (paragraphs, headings, blockquote, images, basic marks, links). */
function portableTextToHtml(blocks, { projectId, dataset } = {}) {
    if (!Array.isArray(blocks)) {
        return '';
    }
    const builder =
        projectId && String(projectId).trim()
            ? createImageUrlBuilder({ projectId: String(projectId).trim(), dataset: dataset || 'production' })
            : null;
    let imageIndex = 0;
    const parts = [];
    for (const block of blocks) {
        if (block && block._type === 'image') {
            const url = imageBlockUrl(block, builder);
            imageIndex += 1;
            const loadingAttr = imageIndex === 1 ? 'eager' : 'lazy';
            const imgHtml = imageBlockToHtml(url, loadingAttr, block);
            if (imgHtml) {
                parts.push(imgHtml);
            }
            continue;
        }
        if (!block || block._type !== 'block' || !block.children) {
            continue;
        }
        const inner = serializeSpans(block.children, block.markDefs);
        const style = block.style || 'normal';
        if (style === 'h1') {
            parts.push(`<h1>${inner}</h1>`);
        } else if (style === 'h2') {
            parts.push(`<h2>${inner}</h2>`);
        } else if (style === 'h3') {
            parts.push(`<h3>${inner}</h3>`);
        } else if (style === 'h4') {
            parts.push(`<h4>${inner}</h4>`);
        } else if (style === 'blockquote') {
            parts.push(`<blockquote><p>${inner}</p></blockquote>`);
        } else {
            parts.push(`<p>${inner}</p>`);
        }
    }
    return parts.join('\n');
}

exports.handler = async function handler(event) {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    const slug =
        event.queryStringParameters && event.queryStringParameters.slug
            ? String(event.queryStringParameters.slug).trim()
            : '';

    if (!slug) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing slug' }),
        };
    }

    try {
        const client = getSanityClient({ useCdn: false });
        const doc = await client.fetch(DETAIL_QUERY, { slug });
        if (!doc) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Not found' }),
            };
        }

        const imageOpts = {
            projectId: process.env.SANITY_PROJECT_ID,
            dataset: process.env.SANITY_DATASET || 'production',
        };
        const bodyHtml = portableTextToHtml(doc.body, imageOpts);
        const imageUrls = collectImageUrls(doc.body, imageOpts);
        const { body, ...rest } = doc;
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ...rest, bodyHtml, imageUrls }),
        };
    } catch (err) {
        console.error('blog-post:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: err.message || 'Failed to fetch post',
            }),
        };
    }
};
