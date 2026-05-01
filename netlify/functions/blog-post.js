'use strict';

const { getSanityClient } = require('../../lib/sanity');

const DETAIL_QUERY = `
  *[_type == "post" && !(_id in path("drafts.**")) && slug.current == $slug][0] {
    title,
    "slug": slug.current,
    publishedAt,
    _updatedAt,
    excerpt,
    seoTitle,
    seoDescription,
    keywords,
    focusKeyword,
    noindex,
    seoImage {
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
    },
    mainImage {
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
    },
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
      },
      _type == "patternDownload" => {
        _key,
        _type,
        description,
        linkText,
        "fileUrl": file.asset->url,
        "fileName": file.asset->originalFilename,
        file {
          asset->{
            url,
            originalFilename
          }
        }
      },
      _type == "object" && defined(file) && file._type == "file" => {
        _key,
        _type,
        description,
        linkText,
        "fileUrl": file.asset->url,
        "fileName": file.asset->originalFilename,
        file {
          asset->{
            url,
            originalFilename
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

function patternDownloadFileUrl(block) {
    if (!block || typeof block !== 'object') {
        return '';
    }
    const direct = typeof block.fileUrl === 'string' ? block.fileUrl.trim() : '';
    if (direct && /^https?:\/\//i.test(direct)) {
        return direct;
    }
    const asset = block.file && block.file.asset;
    if (asset && typeof asset === 'object' && typeof asset.url === 'string') {
        const u = asset.url.trim();
        if (u && /^https?:\/\//i.test(u)) {
            return u;
        }
    }
    return '';
}

function patternDownloadFileName(block) {
    if (!block || typeof block !== 'object') {
        return '';
    }
    const direct = typeof block.fileName === 'string' ? block.fileName.trim() : '';
    if (direct) {
        return direct;
    }
    const asset = block.file && block.file.asset;
    if (asset && typeof asset === 'object' && typeof asset.originalFilename === 'string') {
        return asset.originalFilename.trim();
    }
    return '';
}

function patternDownloadToHtml(block) {
    const url = patternDownloadFileUrl(block);
    if (!url) {
        return '';
    }
    const linkRaw =
        block && typeof block.linkText === 'string' && block.linkText.trim()
            ? block.linkText.trim()
            : 'Download pattern PDF';
    const descRaw =
        block && typeof block.description === 'string' ? block.description.trim() : '';
    const desc =
        descRaw === ''
            ? ''
            : `<p class="blog-pattern-pdf-desc">${escapeHtml(descRaw)}</p>`;
    const fileNameRaw = patternDownloadFileName(block);
    const fileHint =
        fileNameRaw !== '' ? escapeHtml(fileNameRaw) : '';
    const ariaLabel = fileHint ? `${escapeHtml(linkRaw)} (${fileHint})` : escapeHtml(linkRaw);
    return (
        '<aside class="blog-pattern-pdf">' +
        desc +
        '<a class="blog-pattern-pdf-link" href="' +
        escapeHtml(url) +
        '" download' +
        ' target="_blank" rel="noopener noreferrer"' +
        (fileHint ? ` aria-label="${ariaLabel}"` : '') +
        '>' +
        escapeHtml(linkRaw) +
        '</a>' +
        '</aside>'
    );
}

function imageBlockToHtml(url, loadingAttr, block) {
    if (!url) {
        return '';
    }
    const loading = loadingAttr === 'eager' ? 'eager' : 'lazy';
    const dim = imgDimensionAttrs(block);
    const altRaw = block && typeof block.alt === 'string' ? block.alt : '';
    const alt = escapeHtml(altRaw);
    const capRaw = block && typeof block.caption === 'string' ? block.caption.trim() : '';
    const caption =
        capRaw === ''
            ? ''
            : `<figcaption class="blog-prose-caption">${escapeHtml(capRaw)}</figcaption>`;
    return (
        '<figure class="blog-prose-figure">' +
        `<img src="${escapeHtml(url)}" alt="${alt}" loading="${loading}" decoding="async"${dim} />` +
        caption +
        '</figure>'
    );
}

function pickOgImageBlock(doc) {
    if (doc && doc.seoImage && doc.seoImage.asset) {
        return doc.seoImage;
    }
    if (doc && doc.mainImage && doc.mainImage.asset) {
        return doc.mainImage;
    }
    if (doc && Array.isArray(doc.body)) {
        const first = doc.body.find((b) => b && b._type === 'image' && b.asset);
        if (first) {
            return first;
        }
    }
    return null;
}

function ogImageFields(doc, imageOpts) {
    const block = pickOgImageBlock(doc);
    if (!block) {
        return { ogImage: '', ogImageWidth: null, ogImageHeight: null };
    }
    const builder =
        imageOpts.projectId &&
        String(imageOpts.projectId).trim() &&
        typeof imageOpts.createImageUrlBuilder === 'function'
            ? imageOpts.createImageUrlBuilder({
                  projectId: String(imageOpts.projectId).trim(),
                  dataset: imageOpts.dataset || 'production',
              })
            : null;
    let url = imageBlockUrl(block, builder);
    if (!url && block.asset && typeof block.asset.url === 'string') {
        const base = block.asset.url.split('?')[0];
        url = `${base}?w=1200&auto=format`;
    }
    const d = block.asset && block.asset.metadata && block.asset.metadata.dimensions;
    const w = d && typeof d.width === 'number' ? d.width : null;
    const h = d && typeof d.height === 'number' ? d.height : null;
    return { ogImage: url || '', ogImageWidth: w, ogImageHeight: h };
}

function collectImageUrls(blocks, { projectId, dataset, createImageUrlBuilder } = {}) {
    if (!Array.isArray(blocks)) {
        return [];
    }
    const builder =
        projectId && String(projectId).trim() && typeof createImageUrlBuilder === 'function'
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
function portableTextToHtml(blocks, { projectId, dataset, createImageUrlBuilder } = {}) {
    if (!Array.isArray(blocks)) {
        return '';
    }
    const builder =
        projectId && String(projectId).trim() && typeof createImageUrlBuilder === 'function'
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
        const isPatternDownload =
            block &&
            (block._type === 'patternDownload' ||
                (block._type === 'object' &&
                    block.file &&
                    typeof block.file === 'object' &&
                    block.file._type === 'file' &&
                    block.file.asset));
        if (isPatternDownload) {
            const cardHtml = patternDownloadToHtml(block);
            if (cardHtml) {
                parts.push(cardHtml);
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

        const { createImageUrlBuilder } = await import('@sanity/image-url');
        const imageOpts = {
            projectId: process.env.SANITY_PROJECT_ID,
            dataset: process.env.SANITY_DATASET || 'production',
            createImageUrlBuilder,
        };
        const bodyHtml = portableTextToHtml(doc.body, imageOpts);
        const imageUrls = collectImageUrls(doc.body, imageOpts);
        const og = ogImageFields(doc, imageOpts);
        const { body, ...rest } = doc;
        const seoTitle = (doc.seoTitle && String(doc.seoTitle).trim()) || '';
        const seoDescription =
            (doc.seoDescription && String(doc.seoDescription).trim()) || '';
        const keywords = Array.isArray(doc.keywords)
            ? doc.keywords.map((k) => String(k).trim()).filter(Boolean)
            : [];
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ...rest,
                bodyHtml,
                imageUrls,
                ogTitle: seoTitle || doc.title || '',
                ogDescription: seoDescription || doc.excerpt || '',
                ogImage: og.ogImage,
                ogImageWidth: og.ogImageWidth,
                ogImageHeight: og.ogImageHeight,
                seoTitle,
                seoDescription,
                keywords,
                noindex: doc.noindex === true,
            }),
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
