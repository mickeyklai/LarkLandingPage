'use strict';

const { getSanityClient } = require('../../lib/sanity');

const DETAIL_QUERY = `
  *[_type == "post" && slug.current == $slug][0] {
    title,
    "slug": slug.current,
    publishedAt,
    excerpt,
    body
  }
`;

const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, s-maxage=300',
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
        } else if (mark === 'u') {
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

/** Minimal Portable Text → HTML (paragraphs, headings, blockquote, basic marks, links). */
function portableTextToHtml(blocks) {
    if (!Array.isArray(blocks)) {
        return '';
    }
    const parts = [];
    for (const block of blocks) {
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
        const client = getSanityClient();
        const doc = await client.fetch(DETAIL_QUERY, { slug });
        if (!doc) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Not found' }),
            };
        }

        const bodyHtml = portableTextToHtml(doc.body);
        const { body, ...rest } = doc;
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ...rest, bodyHtml }),
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
