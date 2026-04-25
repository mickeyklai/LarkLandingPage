#!/usr/bin/env node
/**
 * Daily blog pipeline: one published Sanity `post` per run with Portable Text body
 * and at least one image block (required by the public site). Groq copy is tuned for SEO,
 * Lark Elwood / Independent / dark romance brand, Pinterest-adjacent angles, and a soft funnel to the site and book.
 * Hero images: Groq supplies heroImages[3] (alt, caption, prompt each). Body embeds those three; mainImage
 * starts as hero 1, then rotates through additional images for Make/Pinterest webhooks.
 * Filenames: lark-elwood-dark-romance-blog-{slug}-mood-{1..N}.jpg
 *
 * Image strategy (first match wins):
 * - HF_TOKEN — @huggingface/inference + FLUX.1-schnell (Inference Providers, provider "auto").
 *   Groq supplies `imagePrompt` (dark-romance mood, Pinterest-friendly); JPEG → Sanity.
 * - Else PEXELS_API_KEY — stock photo → Sanity upload.
 * - Else BLOG_IMAGE_POOL_REFS — comma-separated Sanity image asset _id values (Studio uploads).
 *
 * Idempotency: base slug is `${BLOG_RUN_DATE or UTC YYYY-MM-DD}-${topicSlug}`. If that slug
 * already exists, the script exits 0 without creating another (safe for cron retries).
 * For more than one post the same calendar day, set BLOG_MULTIPLE_PER_DAY=1 or pass --next-slug:
 * the script uses the base slug when free, otherwise `${base}-2`, `${base}-3`, …
 *
 * Required env:
 *   SANITY_PROJECT_ID, SANITY_API_WRITE_TOKEN (Editor: create documents + upload assets)
 *   GROQ_API_KEY (Groq Cloud for OpenAI-compatible chat completions)
 *   One image source: HF_TOKEN (preferred, Hugging Face FLUX) and/or PEXELS_API_KEY and/or
 *   BLOG_IMAGE_POOL_REFS
 *
 * Optional:
 *   SANITY_DATASET (default production), SANITY_API_VERSION (default 2024-01-01)
 *   GROQ_MODEL (default llama-3.3-70b-versatile)
 *   BLOG_RUN_DATE=YYYY-MM-DD — pin the calendar day (slug + topic rotation + idempotency)
 *   BLOG_MULTIPLE_PER_DAY — set "1" or "true" to allocate the next free slug (base, base-2, …) when base is taken
 *   BLOG_PUBLISHED_AT — ISO datetime for publishedAt (default: now UTC)
 *   HF_TOKEN — Hugging Face token (Inference); optional HF_IMAGE_MODEL (default FLUX.1-schnell),
 *     HF_IMAGE_PROVIDER (default auto), HF_IMAGE_WIDTH / HF_IMAGE_HEIGHT, HF_NUM_INFERENCE_STEPS
 *   PEXELS_API_KEY — stock photos → Sanity when HF_TOKEN unset
 *   BLOG_IMAGE_POOL_REFS — curated asset ids when neither HF nor Pexels is set
 *   BLOG_PEXELS_QUERIES — optional comma-separated Pexels search terms (rotation by day)
 *   GROQ_JSON_MODE — set "0" or "false" if the API rejects response_format json_object for your model
 *   BLOG_PUBLIC_URL — site origin for CTAs (default https://larkelwood.com). Groq closes each post
 *     with an invitation to join the reader list / newsletter at BLOG_READER_LIST_URL or …/#reader-list
 *   BLOG_READER_LIST_URL — optional full signup URL override (default: BLOG_PUBLIC_URL + /#reader-list)
 *   BLOG_NEWSLETTER_LINK_TEXT — anchor text for the auto-appended CTA link (default: "Join the reader list")
 *   BLOG_CTA_LINE_BEFORE / BLOG_CTA_LINE_AFTER — optional prose around that link in the CTA paragraph
 *   BLOG_MAINIMAGE_WEBHOOK_DELAY_MS — ms between mainImage patches (default 10000); set 0 to patch back-to-back
 *   BLOG_MAINIMAGE_PIN_PATCH_COUNT — total mainImage states per post, including the initial create image (default 10)
 *   BLOG_MAINIMAGE_PIN_PATCHES — set to "0" or "false" to skip mainImage patches (only first image as main)
 *
 * Flags:
 *   --dry-run — do not upload assets or create documents; log intended payload
 *   --stub    — with --dry-run, skip Groq/Pexels (placeholder copy only)
 *   --next-slug — same as BLOG_MULTIPLE_PER_DAY (extra posts same day get -2, -3, … suffix)
 *
 * Sanity token: create at sanity.io/manage → API → Tokens with Editor (or custom role with
 * `create` on `post` and `write` for assets). Never commit tokens.
 *
 * Local env: copy .env.example to .env.local, fill in secrets. This script loads .env then
 * .env.local from the repo root (gitignored). SANITY_PROJECT_ID matches studio/sanity.config.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Load KEY=value from repo root; .env.local (override=true) wins over .env. */
function loadEnvFiles() {
    const root = path.join(__dirname, '..');
    function loadFile(name, override) {
        const full = path.join(root, name);
        if (!fs.existsSync(full)) {
            return;
        }
        const text = fs.readFileSync(full, 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }
            const m = trimmed.match(/^export\s+(.+)$/);
            const body = m ? m[1].trim() : trimmed;
            const eq = body.indexOf('=');
            if (eq === -1) {
                continue;
            }
            const key = body.slice(0, eq).trim();
            let val = body.slice(eq + 1).trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            if (!key) {
                continue;
            }
            if (override || process.env[key] === undefined) {
                process.env[key] = val;
            }
        }
    }
    loadFile('.env', false);
    loadFile('.env.local', true);
}

loadEnvFiles();

const crypto = require('crypto');
const { createClient } = require('@sanity/client');

const TOPIC_SLUGS = [
    'dark-romance-cupcakes',
    'dark-romance-dessert-table',
    'dark-romance-dresses',
    'gothic-date-night-styling',
    'dark-romance-hair-moodboard',
    'dark-romance-nails-aesthetic',
    'dark-romance-home-styling',
    'gothic-bedroom-and-library-atmosphere',
    'enemies-to-lovers-guide',
    'best-dark-romance-tropes',
    'forbidden-love-trope-deep-dive',
    'morally-grey-hero-obsession',
    'villain-gets-the-girl-analysis',
    'dark-romance-bookshelf-curation',
    'independent-book-club-notes',
    'romance-trope-watch',
    'dark-academia-reading-corner',
    'midnight-kitchen-mood',
    'dark-romance-party-ideas',
    'dark-romance-reader-list-journal',
];

const DEFAULT_PEXELS_QUERIES = [
    'dark romance couple hands close up moody',
    'gothic fashion black dress dramatic lighting',
    'dark cupcakes chocolate dessert moody',
    'dark manicure nails black burgundy aesthetic',
    'romantic candlelight dinner black table setting',
    'cozy gothic home decor candles books',
    'dark hair styling waves dramatic portrait crop',
    'gothic window rain night interior',
    'red roses black background still life',
    'abandoned mansion chandelier darkness',
    'stormy ocean night dramatic sky',
];

function randomKey() {
    return crypto.randomBytes(8).toString('hex');
}

function utcDateString(d = new Date()) {
    return d.toISOString().slice(0, 10);
}

/** Homepage origin for newsletter CTA (no trailing slash). */
function blogPublicUrl() {
    const u = (process.env.BLOG_PUBLIC_URL || 'https://larkelwood.com').trim().replace(/\/+$/, '');
    return u || 'https://larkelwood.com';
}

/** Exact URL the model must cite in the closing paragraph (reader list / newsletter on the landing page). */
function readerListCtaUrl() {
    const override = (process.env.BLOG_READER_LIST_URL || '').trim();
    if (override) {
        return override;
    }
    return `${blogPublicUrl()}/#reader-list`;
}

function topicIndexForDate(isoDate) {
    const t = Date.parse(`${isoDate}T12:00:00Z`);
    if (Number.isNaN(t)) {
        return 0;
    }
    const d = new Date(t);
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    const day = Math.floor((d - start) / 86400000);
    return day % TOPIC_SLUGS.length;
}

function topicSlugForDate(isoDate) {
    return TOPIC_SLUGS[topicIndexForDate(isoDate)];
}

function parseArgs(argv) {
    const dryRun = argv.includes('--dry-run');
    const stub = argv.includes('--stub');
    const nextSlug = argv.includes('--next-slug');
    return { dryRun, stub, nextSlug };
}

function envTruthy(name) {
    const v = String(process.env[name] || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

function envFileHint() {
    const root = path.join(__dirname, '..');
    return `Put secrets in ${path.join(root, '.env.local')} (copy from .env.example). Run from repo root: npm run publish:daily-blog`;
}

function getWriteClient() {
    const projectId = process.env.SANITY_PROJECT_ID;
    const token = process.env.SANITY_API_WRITE_TOKEN;
    if (!projectId || String(projectId).trim() === '') {
        throw new Error(`SANITY_PROJECT_ID is not set. ${envFileHint()}`);
    }
    if (!token || String(token).trim() === '') {
        throw new Error(
            `SANITY_API_WRITE_TOKEN is not set. Create one at https://www.sanity.io/manage → API → Tokens (Editor role). ${envFileHint()}`,
        );
    }
    return createClient({
        projectId: String(projectId).trim(),
        dataset: process.env.SANITY_DATASET || 'production',
        apiVersion: process.env.SANITY_API_VERSION || '2024-01-01',
        token: String(token).trim(),
        useCdn: false,
    });
}

async function postExists(client, slug) {
    const id = await client.fetch(`*[_type == "post" && slug.current == $slug][0]._id`, { slug });
    return Boolean(id);
}

/** @param {object | null} client Sanity write client or null in some dry-run paths */
async function resolveSlugForRun(client, baseSlug, multiplePerDay) {
    if (!client) {
        return { slug: baseSlug, shouldSkip: false };
    }
    if (!multiplePerDay) {
        if (await postExists(client, baseSlug)) {
            return { slug: baseSlug, shouldSkip: true };
        }
        return { slug: baseSlug, shouldSkip: false };
    }
    if (!(await postExists(client, baseSlug))) {
        return { slug: baseSlug, shouldSkip: false };
    }
    let n = 2;
    for (;;) {
        const candidate = `${baseSlug}-${n}`;
        if (!(await postExists(client, candidate))) {
            return { slug: candidate, shouldSkip: false };
        }
        n += 1;
        if (n > 500) {
            throw new Error('Too many posts for the same base slug (suffix limit 500)');
        }
    }
}

function parsePoolRefs() {
    const raw = process.env.BLOG_IMAGE_POOL_REFS || '';
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function pexelsQueries() {
    const raw = process.env.BLOG_PEXELS_QUERIES;
    if (raw && raw.trim()) {
        return raw.split(',').map((s) => s.trim()).filter(Boolean);
    }
    return DEFAULT_PEXELS_QUERIES;
}

/**
 * Lark blog / Pinterest hero images: sensual dark-romance mood with body language allowed.
 * Strong composition and contrast so the thumbnail reads in a feed; avoid full identifiable faces.
 */
const HF_STYLE_PREFIX =
    'Pinterest-worthy ultra sharp editorial photograph, dark romance aesthetic, ' +
    'people and sensual interaction allowed (hands, eyes, torsos, lips-to-bottom framing), ' +
    'AVOID full identifiable faces and direct portrait framing, ' +
    'single bold focal point readable at tiny thumbnail size, seductive mysterious mood, ' +
    'velvet crimson ink-black and bruised-plum palette, dramatic cinematic lighting on surfaces and textures, ' +
    'luxury gothic thriller mood curiosity hook, ' +
    '4k professional photograph, perfectly exposed, ';

const HF_STYLE_SUFFIX =
    ', rich jewel-tone color grade, high contrast edges, glossy depth, ' +
    'scroll-stopping composition, tasteful sensual darkness without explicit content';

const HF_NEGATIVE_PROMPT =
    'full face, fully visible face, centered portrait, frontal portrait, close-up face, identifiable face, selfie, ' +
    'silhouette of person, crowd, group crowd, ' +
    'old, elderly, cartoon, anime, illustration, painting, drawing, sketch, ' +
    'blurry, low quality, low resolution, pixelated, ' +
    'text, watermark, logo, typography, bright pastel, cheerful, ' +
    'children, childish, ' +
    'nudity, nude, naked, NSFW, explicit, pornographic, sexual act, ' +
    'exposed breasts, exposed genitals';

function enhanceImagePrompt(raw) {
    const core =
        String(raw || '').trim() ||
        'rain-streaked gothic window, velvet chaise, a couple from lips to waist with clasped hands, single guttering candle, open book with worn spine, no full face visible';
    return `${HF_STYLE_PREFIX}${core}${HF_STYLE_SUFFIX}`;
}

async function generateHfImageJpeg(imagePrompt) {
    const hfToken = process.env.HF_TOKEN && String(process.env.HF_TOKEN).trim();
    if (!hfToken) {
        throw new Error('HF_TOKEN is not set');
    }
    const { InferenceClient } = require('@huggingface/inference');
    const model = (process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell').trim();
    const provider = (process.env.HF_IMAGE_PROVIDER || 'auto').trim();
    const width = Math.min(1536, Math.max(256, Number(process.env.HF_IMAGE_WIDTH) || 1216));
    const height = Math.min(1536, Math.max(256, Number(process.env.HF_IMAGE_HEIGHT) || 832));
    const numInferenceSteps = Math.min(12, Math.max(1, Number(process.env.HF_NUM_INFERENCE_STEPS) || 5));

    const client = new InferenceClient(hfToken);
    const inputs = enhanceImagePrompt(imagePrompt);
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const blob = await client.textToImage({
                model,
                inputs,
                provider,
                parameters: {
                    num_inference_steps: numInferenceSteps,
                    width,
                    height,
                    negative_prompt: HF_NEGATIVE_PROMPT,
                },
            });
            const buf = Buffer.from(await blob.arrayBuffer());
            if (!buf.length) {
                throw new Error('HF returned empty image');
            }
            return buf;
        } catch (e) {
            lastErr = e;
            if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 2500 * attempt));
            }
        }
    }
    throw new Error(`Hugging Face image generation failed after retries: ${lastErr && lastErr.message}`);
}

/** Sanity asset originalFilename: slug + brand + slot for CDN SEO. */
function seoBlogImageFilename(slugCurrent, ext, slotIndex) {
    const safe = String(slugCurrent || 'post')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 72);
    const e = (ext || 'jpg').replace(/^\./, '').toLowerCase();
    const slot = typeof slotIndex === 'number' && slotIndex >= 1 ? `-mood-${slotIndex}` : '';
    return `lark-elwood-dark-romance-blog-${safe}${slot}.${e}`;
}

function sanitizeImageCaption(s) {
    return String(s || '')
        .replace(
            /\b(hugging\s*face|huggingface|hf\.co|flux\.?1?|openai|dall-?e|midjourney|stable\s*diffusion|pexels|shutterstock|ai[- ]?generated|stock\s*photo)\b/gi,
            '',
        )
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, '')
        .trim()
        .slice(0, 220);
}

function figureCaptionFromMeta(slotCaption, postTitle, { source, photographer }) {
    const raw = sanitizeImageCaption(slotCaption);
    const fallback = postTitle
        ? `${String(postTitle).trim()} · Lark Elwood · dark romance · Independent`
        : 'Lark Elwood — dark romance author · Independent';
    const primary = raw || fallback;
    if (source === 'pexels' && photographer) {
        return `${primary} · Photo: ${photographer} / Pexels`;
    }
    return primary;
}

function dryHeroSlot(i, alt) {
    return {
        assetId: `(dry-run hero-${i + 1})`,
        attribution: '',
        alt: alt || `Mood ${i + 1}`,
    };
}

function heroSpecForSlot(heroSpecs, idx, total, context) {
    const base = heroSpecs[idx % heroSpecs.length] || {};
    const n = idx + 1;
    const seedTitle = String((context && context.postTitle) || '').trim();
    const seedTopic = String((context && context.topicSlug) || '').trim().replace(/-/g, ' ');
    const altBase = String(base.imageAlt || `Lark Elwood dark romance · Independent mood`).replace(/\(\d+\s+of\s+\d+\)$/i, '').trim();
    const capBase = String(base.imageCaption || `Lark Elwood · Independent · mood`).trim();
    const promptBase = String(base.imagePrompt || '').trim();
    const cycle = Math.floor(idx / heroSpecs.length);
    const anchor = [seedTitle, seedTopic].filter(Boolean).join(' | ');
    const prompt =
        cycle > 0
            ? `${promptBase}; keep the same article theme${anchor ? ` (${anchor})` : ''}; variation ${
                  cycle + 1
              }: same core subject and props, fresh angle/composition/lighting/palette, sensual body-language allowed, no full identifiable faces`
            : promptBase;
    return {
        imageAlt: `${altBase} (${n} of ${total})`,
        imageCaption: `${capBase} · mood ${n}`,
        imagePrompt: prompt,
    };
}

/** N distinct/rotating assets for body + mainImage rotation. Pool refs can repeat if fewer than N are available. */
async function resolveHeroImageSlots(client, runDate, dryRun, meta, heroSpecs, slotCount) {
    const pool = parsePoolRefs();
    const hf = process.env.HF_TOKEN && String(process.env.HF_TOKEN).trim();
    const pexelsKey = process.env.PEXELS_API_KEY && String(process.env.PEXELS_API_KEY).trim();
    const slugCurrent = (meta.slugCurrent && String(meta.slugCurrent).trim()) || `post-${runDate}`;
    const postTitle = meta.postTitle && String(meta.postTitle).trim();
    const topicSlug = meta.topicSlug && String(meta.topicSlug).trim();
    const totalSlots = Math.max(3, Number(slotCount) || 3);

    if (!Array.isArray(heroSpecs) || heroSpecs.length < 1) {
        throw new Error('heroSpecs must be a non-empty array');
    }

    if (hf && dryRun) {
        return {
            slots: Array.from({ length: totalSlots }, (_, i) =>
                dryHeroSlot(i, heroSpecForSlot(heroSpecs, i, totalSlots, { postTitle, topicSlug }).imageAlt),
            ),
        };
    }

    if (hf && !dryRun) {
        const slots = [];
        for (let i = 0; i < totalSlots; i += 1) {
            const spec = heroSpecForSlot(heroSpecs, i, totalSlots, { postTitle, topicSlug });
            const promptFor =
                (spec.imagePrompt && String(spec.imagePrompt).trim()) ||
                'storm beyond tall arched windows, dripping wax candle, stacked antique books, black lace on marble, close framing from lips to waist, no full identifiable face';
            const buf = await generateHfImageJpeg(promptFor);
            const filename = seoBlogImageFilename(slugCurrent, 'jpg', i + 1);
            const doc = await client.assets.upload('image', buf, { filename });
            slots.push({
                assetId: doc._id,
                attribution: figureCaptionFromMeta(spec.imageCaption, postTitle, { source: 'hf' }),
                alt: spec.imageAlt,
            });
        }
        return { slots };
    }

    if (pexelsKey && dryRun && !pool.length && !hf) {
        return {
            slots: Array.from({ length: totalSlots }, (_, i) =>
                dryHeroSlot(i, heroSpecForSlot(heroSpecs, i, totalSlots, { postTitle, topicSlug }).imageAlt),
            ),
        };
    }

    if (pexelsKey && !dryRun) {
        const queries = pexelsQueries();
        const specSeed = heroSpecForSlot(heroSpecs, 0, totalSlots, { postTitle, topicSlug });
        const promptWords = String(specSeed.imagePrompt || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter((w) => w && w.length > 3 && !['with', 'from', 'that', 'this', 'dark', 'romance'].includes(w))
            .slice(0, 6);
        const dynamicQuery = promptWords.join(' ').trim();
        const q = dynamicQuery || queries[topicIndexForDate(runDate) % queries.length];
        const url = new URL('https://api.pexels.com/v1/search');
        url.searchParams.set('query', q);
        url.searchParams.set('per_page', String(Math.min(80, totalSlots)));
        url.searchParams.set('orientation', 'landscape');
        const res = await fetch(url.toString(), {
            headers: { Authorization: pexelsKey },
        });
        if (!res.ok) {
            const t = await res.text().catch(() => '');
            throw new Error(`Pexels API error ${res.status}: ${t.slice(0, 200)}`);
        }
        const data = await res.json();
        const photos = (data.photos || []).slice(0, totalSlots);
        if (photos.length < totalSlots) {
            throw new Error(`Pexels returned fewer than ${totalSlots} photos; widen query or try another day`);
        }
        const slots = [];
        for (let i = 0; i < totalSlots; i += 1) {
            const photo = photos[i];
            const srcUrl = photo.src.large2x || photo.src.large || photo.src.original;
            const imgRes = await fetch(srcUrl);
            if (!imgRes.ok) {
                throw new Error(`Failed to download Pexels image: ${imgRes.status}`);
            }
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const ext = (photo.src.original || '').includes('.png') ? 'png' : 'jpg';
            const filename = seoBlogImageFilename(slugCurrent, ext, i + 1);
            const doc = await client.assets.upload('image', buf, { filename });
            const ph = photo.photographer;
            const photographer =
                typeof ph === 'string'
                    ? ph.trim()
                    : ph && typeof ph.name === 'string'
                      ? ph.name.trim()
                      : '';
            const spec = heroSpecForSlot(heroSpecs, i, totalSlots, { postTitle, topicSlug });
            slots.push({
                assetId: doc._id,
                attribution: figureCaptionFromMeta(spec.imageCaption, postTitle, {
                    source: 'pexels',
                    photographer,
                }),
                alt: spec.imageAlt,
            });
        }
        return { slots };
    }

    if (pool.length) {
        const slots = [];
        const start = topicIndexForDate(runDate) % pool.length;
        for (let i = 0; i < totalSlots; i += 1) {
            const ref = pool[(start + i) % pool.length];
            const spec = heroSpecForSlot(heroSpecs, i, totalSlots, { postTitle, topicSlug });
            slots.push({
                assetId: ref,
                attribution: figureCaptionFromMeta(spec.imageCaption, postTitle, { source: 'pool' }),
                alt: spec.imageAlt,
            });
        }
        return { slots };
    }

    if (dryRun) {
        return {
            slots: Array.from({ length: totalSlots }, (_, i) =>
                dryHeroSlot(i, heroSpecForSlot(heroSpecs, i, totalSlots, { postTitle, topicSlug }).imageAlt),
            ),
        };
    }

    throw new Error(
        `Set HF_TOKEN, or PEXELS_API_KEY, or BLOG_IMAGE_POOL_REFS (≥1 ref; ≥${totalSlots} distinct refs recommended for unique mainImage patches).`,
    );
}

async function patchMainImageForPinWebhooks(client, docId, slots) {
    const off = process.env.BLOG_MAINIMAGE_PIN_PATCHES;
    if (off === '0' || off === 'false' || String(off || '').toLowerCase() === 'no') {
        return;
    }
    if (!slots || slots.length < 2) {
        return;
    }
    const countRaw = process.env.BLOG_MAINIMAGE_PIN_PATCH_COUNT;
    const countParsed = Number(countRaw);
    const totalStates = Number.isFinite(countParsed) && countParsed >= 1 ? Math.floor(countParsed) : 10;
    const rotationSlots = slots.slice(0, totalStates);
    if (rotationSlots.length < 2) {
        return;
    }
    const raw = process.env.BLOG_MAINIMAGE_WEBHOOK_DELAY_MS;
    const ms = raw === '' || raw === undefined ? 10000 : Number(raw);
    const delay = Number.isFinite(ms) && ms >= 0 ? ms : 10000;

    let previousRef = String(rotationSlots[0].assetId || '');
    for (let i = 1; i < rotationSlots.length; i += 1) {
        if (delay > 0) {
            await new Promise((r) => setTimeout(r, delay));
        }
        const s = rotationSlots[i];
        const nextRef = String(s.assetId || '');
        if (nextRef && nextRef === previousRef) {
            // eslint-disable-next-line no-console
            console.warn(
                `mainImage patch ${i + 1}/${rotationSlots.length} skipped: same asset as previous (use ≥${rotationSlots.length} distinct BLOG_IMAGE_POOL_REFS for unique webhooks).`,
            );
            continue;
        }
        await client
            .patch(docId)
            .set({
                mainImage: {
                    _type: 'image',
                    asset: { _type: 'reference', _ref: s.assetId },
                    alt: s.alt,
                },
            })
            .commit();
        previousRef = nextRef;
        // eslint-disable-next-line no-console
        console.log(`mainImage → hero ${i + 1}/${rotationSlots.length} (${s.assetId})`);
    }
}

function stripJsonFence(text) {
    let s = String(text || '').trim();
    if (s.startsWith('```')) {
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    }
    return s.trim();
}

function normalizeHeroImages(parsed, title) {
    const arr = parsed.heroImages;
    if (!Array.isArray(arr) || arr.length !== 3) {
        throw new Error('Groq JSON must include heroImages: exactly 3 objects { imageAlt, imageCaption, imagePrompt }');
    }
    const t = String(title || '').trim() || 'Lark Elwood journal';
    return arr.map((item, idx) => {
        const ip = String(item.imagePrompt || '').trim();
        const ia = String(item.imageAlt || '')
            .trim()
            .slice(0, 200);
        const ic = sanitizeImageCaption(
            item.imageCaption || `${t} · Lark Elwood · dark romance · Independent · mood ${idx + 1}`,
        );
        return {
            imagePrompt:
                ip ||
                'velvet darkness, guttering candle, rain-streaked gothic window, ink and sealed letter, sensual hands and body language, no full identifiable face',
            imageAlt:
                ia ||
                `${t} — Lark Elwood dark romance · Independent mood (${idx + 1} of 3)`,
            imageCaption: ic || `${t} · mood ${idx + 1} · Lark Elwood`,
        };
    });
}

async function generateCopy({ runDate, topicSlug, stub }) {
    if (stub) {
        const t = `Journal note — ${runDate}`;
        return {
            title: t,
            excerpt: 'Stub excerpt for dry run. Replace with real keys to generate copy via Groq.',
            paragraphs: [
                'This paragraph is placeholder text for a dry run with --stub.',
                'Live posts blend Pinterest-adjacent hooks—style, food, books, tropes—with Lark Elwood’s dark romance brand and Independent.',
                'Copy is tuned for search: author name, dark romance, and the novel woven in naturally, ending with a soft path to the site and the book.',
                'Another beat about atmosphere and trope energy without breaking the intimate, dangerous tone.',
                'A fifth paragraph keeps rhythm before the sign-off beat.',
                'A closing thematic beat—no raw URLs here; the pipeline appends a proper linked sign-off.',
            ],
            heroImages: [
                {
                    imageAlt: 'Velvet and storm glass — Lark Elwood dark romance blog (1 of 3)',
                    imageCaption: 'Dark romance aesthetic · Lark Elwood · Independent — candlelit mood',
                    imagePrompt:
                        'rain hammering a leaded glass window above a clawfoot desk, single candle, ink bottle and sealed letter, torn silk ribbon, velvet darkness, two hands intertwined, framed lips-to-waist',
                },
                {
                    imageAlt: 'Crimson roses and black lace — Lark Elwood Independent mood (2 of 3)',
                    imageCaption: 'Gothic romance still life · Lark Elwood · Independent',
                    imagePrompt:
                        'wilted deep red roses on black marble beside a tarnished silver dagger prop, single taper candle, velvet drape, black lace sleeve and hand on marble, no full face visible',
                },
                {
                    imageAlt: 'Midnight library — dark romance reads · Lark Elwood (3 of 3)',
                    imageCaption: 'Books and shadows · Lark Elwood dark romance',
                    imagePrompt:
                        'towering shelves of leather-bound books, single reading lamp pool of warm light, wingback chair with crossed legs and hand holding open book, storm outside tall windows, face out of frame',
                },
            ],
        };
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY is not set (or pass --stub with --dry-run)');
    }

    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    const themeHuman = topicSlug.replace(/-/g, ' ');
    const siteOrigin = blogPublicUrl();
    const newsletterUrl = readerListCtaUrl();
    const prompt = `You are Lark Elwood, author of the dark romance novel Independent. You write journal-style posts for larkelwood.com that grow the author brand and pull readers toward the book.

Your output is consumed by strict automation: invalid JSON, fewer than 6 paragraphs, or fewer than 3 heroImages objects will be rejected. Count before you answer.

Site & newsletter (context only—do NOT paste URLs in paragraphs):
- Public site home: ${siteOrigin}
- Reader list / newsletter lives on the homepage (fans get email updates, release news, extras around Independent).
- Do not include ${newsletterUrl} or any raw https:// string in "paragraphs". A signup link is appended automatically. End on warmth and invitation—no URLs, no markdown links.

Brand & SEO (natural language—never keyword stuffing):
- Weave discoverable phrases where they belong: dark romance, Lark Elwood, Independent (novel), morally grey romance, forbidden tension, tropes, reader community, newsletter / reader list.
- Cover broad search intent around dark-romance lifestyle + fandom: dresses, cupcakes/desserts, home styling, nails, hair, bookshelves/libraries, trope explainers.
- Title + excerpt: strong hook for Google and Pinterest saves.
- One clear angle per post; reader should want your site and the book.
- Include naturally varied long-tail phrasing from the selected angle (for example: "dark romance cupcakes", "dark romance dress ideas", "enemies to lovers tropes", "dark romance home decor", "gothic library atmosphere") without sounding robotic.

Content angles (pick what fits "${themeHuman}"; stay flexible):
- Pinterest-adjacent on-brand: aesthetics, velvet / goth mood, food-as-mood, style/beauty, bookshelves/libraries, trope essays, villain hunger in fiction—always your dark-romance lens.
- Category rotation is expected across days: food, dresses/style, hair, nails, interiors/home, reading culture, trope education, and emotional relationship dynamics.
- Even when category-led, keep a direct bridge to Lark Elwood and Independent in the title, excerpt, and body.

Voice: step into the darkness; literary but readable; sensual tension without explicit porn. Pick second OR first person and hold it.

Reader arc: open with atmosphere and curiosity; middle deepens stakes or craft; last paragraph turns toward belonging (newsletter / staying close)—still no URLs.

Editorial anchor: ${runDate}. Seed theme: "${themeHuman}".

OUTPUT CONTRACT (must all be true):
1) "paragraphs" is an array of at least 6 non-empty strings (each roughly 2–5 sentences). No bullet lists. No HTML.
2) "heroImages" is an array of exactly 3 objects. Each object has exactly these keys: "imageAlt", "imageCaption", "imagePrompt" (all strings, non-empty after trim).
3) Each imagePrompt: 25–45 words, cinematic dark romance mood. People and sexy interaction are allowed (hands, eyes, body language), but avoid full identifiable faces; cropped framing (e.g., lips-to-bottom) is preferred.
4) Image-topic alignment is mandatory: each imagePrompt must depict the concrete subject of the post (if the post is about dark-romance cupcakes, show cupcakes/table serving details; if about dresses, show dress/fabric/styling details; if about enemies-to-lovers tropes, show symbolic scene cues that match that trope angle).
5) Image 1 / 2 / 3 must stay on the same article theme but use clearly different compositions (different props, room, weather, camera angle, or palette)—not near-duplicates.
6) Each imageAlt: ≤200 chars, includes Lark Elwood + dark romance + Independent where it still sounds natural for screen readers. No vendor/tool/stock/AI names.
7) Each imageCaption: ≤220 chars, Pinterest-friendly line for under the image; brand + book; no vendor/tool names.
8) Last paragraph: emotional CTA toward reader list / newsletter idea only—no http, no pasted domain.

Return a single JSON object ONLY (no markdown, no prose outside the object). Shape and key order:
{
  "title": "…",
  "excerpt": "…",
  "paragraphs": ["…","…","…","…","…","…"],
  "heroImages": [
    {
      "imageAlt": "Example: Storm glass and ink — Lark Elwood dark romance blog · Independent mood (1 of 3)",
      "imageCaption": "Example: Candlelit desk, gothic rain — Lark Elwood · Independent",
      "imagePrompt": "Example: Rain hammering tall leaded windows above a clawfoot desk, guttering candle, sealed letter and black wax, velvet drape pooling on floorboards, two hands touching, lips-to-waist framing"
    },
    {
      "imageAlt": "Example: Crimson roses on marble — Lark Elwood dark romance (2 of 3)",
      "imageCaption": "Example: Still life, obsession in objects — Lark Elwood · Independent",
      "imagePrompt": "Example: Deep red roses on black marble beside tarnished silver and torn ribbon, single taper flame, ink smear on parchment corner, bruised-plum shadows, lace-covered hand resting on stone"
    },
    {
      "imageAlt": "Example: Midnight library glow — dark romance reads · Lark Elwood (3 of 3)",
      "imageCaption": "Example: Shelves and storm light — Lark Elwood",
      "imagePrompt": "Example: Floor-to-ceiling leather books, one brass reading lamp pool of gold, wingback chair, crossed legs and one hand turning a page, thunder beyond tall windows, face out of frame"
    }
  ]
}

Replace every Example with your own original copy for this post (do not copy the examples verbatim).`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            temperature: 0.72,
            max_tokens: 6144,
            ...(process.env.GROQ_JSON_MODE === '0' || process.env.GROQ_JSON_MODE === 'false'
                ? {}
                : { response_format: { type: 'json_object' } }),
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a JSON generator. Reply with one valid JSON object only—no markdown fences, no commentary. If unsure, satisfy the user message Output CONTRACT counts first.',
                },
                { role: 'user', content: prompt },
            ],
        }),
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Groq API ${res.status}: ${errText.slice(0, 400)}`);
    }

    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const parsed = JSON.parse(stripJsonFence(content));

    if (!parsed.title || !Array.isArray(parsed.paragraphs)) {
        throw new Error('Groq JSON missing title or paragraphs array');
    }

    const paragraphs = parsed.paragraphs.map((p) => String(p).trim()).filter(Boolean);
    if (paragraphs.length < 6) {
        throw new Error(
            `Groq returned only ${paragraphs.length} non-empty paragraphs; need at least 6 for the three-image layout.`,
        );
    }

    const title = String(parsed.title).trim();
    const heroImages = normalizeHeroImages(parsed, title);

    return {
        title,
        excerpt: String(parsed.excerpt || '').trim(),
        paragraphs,
        heroImages,
    };
}

function textBlock(text, style) {
    return {
        _type: 'block',
        _key: randomKey(),
        style: style || 'normal',
        markDefs: [],
        children: [{ _type: 'span', marks: [], text }],
    };
}

function imageBlock(assetId, alt, caption) {
    return {
        _type: 'image',
        _key: randomKey(),
        asset: { _type: 'reference', _ref: assetId },
        alt: alt || '',
        ...(caption ? { caption } : {}),
    };
}

/** Remove pasted signup URLs so we do not duplicate the programmatic CTA link. */
function stripSignupUrlsFromParagraphs(paragraphs, newsletterUrl) {
    const nu = String(newsletterUrl || '').trim();
    const origin = blogPublicUrl();
    const needles = [];
    if (nu) {
        needles.push(nu);
    }
    needles.push(`${origin}/#reader-list`, `${origin}#reader-list`, origin);
    const uniq = [...new Set(needles.filter(Boolean))];

    return paragraphs.map((p) => {
        let t = String(p);
        for (const pat of uniq) {
            const esc = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            t = t.replace(new RegExp(esc, 'gi'), ' ');
        }
        return t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
    });
}

/** Final paragraph: real Portable Text link (renders as <a> in netlify/functions/blog-post.js). */
function readerListCtaBlock(newsletterUrl) {
    const url = String(newsletterUrl || '').trim() || readerListCtaUrl();
    const linkKey = randomKey();
    const linkLabel =
        (process.env.BLOG_NEWSLETTER_LINK_TEXT || 'Join the reader list').trim() || 'Join the reader list';
    const before = (
        process.env.BLOG_CTA_LINE_BEFORE ||
        'If you want the rest in your inbox—release crumbs, desk confessions, and what simmers behind '
    ).trim();
    const after = (process.env.BLOG_CTA_LINE_AFTER || 'on the homepage.').trim();

    return {
        _type: 'block',
        _key: randomKey(),
        style: 'normal',
        markDefs: [{ _type: 'link', _key: linkKey, href: url }],
        children: [
            { _type: 'span', marks: [], text: before },
            { _type: 'span', marks: ['em'], text: 'Independent' },
            { _type: 'span', marks: [], text: '—' },
            { _type: 'span', marks: [linkKey], text: linkLabel },
            { _type: 'span', marks: [], text: ` ${after}` },
        ],
    };
}

/** Three in-body images (slots 0–2) then remaining prose + newsletter CTA. */
function buildBodyThreeImages(paragraphs, slots, newsletterUrl) {
    const cta = String(newsletterUrl || '').trim() || readerListCtaUrl();
    const cleaned = stripSignupUrlsFromParagraphs(Array.isArray(paragraphs) ? paragraphs : [], cta).filter(
        Boolean,
    );
    if (!Array.isArray(slots) || slots.length !== 3) {
        throw new Error('buildBodyThreeImages requires exactly 3 image slots');
    }
    if (cleaned.length < 6) {
        throw new Error(`Need at least 6 paragraphs for three-image layout, got ${cleaned.length}`);
    }

    const body = [];
    body.push(textBlock(cleaned[0], 'normal'));
    body.push(imageBlock(slots[0].assetId, slots[0].alt, slots[0].attribution));
    body.push(textBlock(cleaned[1], 'normal'));
    body.push(imageBlock(slots[1].assetId, slots[1].alt, slots[1].attribution));
    body.push(textBlock(cleaned[2], 'normal'));
    body.push(imageBlock(slots[2].assetId, slots[2].alt, slots[2].attribution));
    for (let i = 3; i < cleaned.length; i += 1) {
        body.push(textBlock(cleaned[i], 'normal'));
    }
    body.push(readerListCtaBlock(cta));
    return body;
}

async function main() {
    const { dryRun, stub, nextSlug } = parseArgs(process.argv.slice(2));
    const runDate = process.env.BLOG_RUN_DATE || utcDateString();
    const topicSlug = topicSlugForDate(runDate);
    const baseSlug = `${runDate}-${topicSlug}`;
    const multiplePerDay = nextSlug || envTruthy('BLOG_MULTIPLE_PER_DAY');

    const publishedAt =
        process.env.BLOG_PUBLISHED_AT && String(process.env.BLOG_PUBLISHED_AT).trim()
            ? String(process.env.BLOG_PUBLISHED_AT).trim()
            : new Date().toISOString();

    let client = null;
    if (!dryRun || (process.env.SANITY_API_WRITE_TOKEN && process.env.SANITY_PROJECT_ID)) {
        try {
            client = getWriteClient();
        } catch (e) {
            if (!dryRun) {
                throw e;
            }
        }
    }

    const { slug: slugCurrent, shouldSkip } = await resolveSlugForRun(client, baseSlug, multiplePerDay);
    if (shouldSkip) {
        // eslint-disable-next-line no-console
        console.log(
            dryRun
                ? '[dry-run] Post already exists; would skip create.'
                : 'Post already exists for this slug; idempotent exit.',
        );
        process.exit(0);
    }

    // eslint-disable-next-line no-console
    console.log(
        multiplePerDay && slugCurrent !== baseSlug
            ? `Run date (UTC): ${runDate}  topic: ${topicSlug}  baseSlug: ${baseSlug}  slug: ${slugCurrent} (multiple per day)`
            : `Run date (UTC): ${runDate}  topic: ${topicSlug}  slug: ${slugCurrent}`,
    );

    const copy = await generateCopy({ runDate, topicSlug, stub });
    const bodyImageCount = 3;
    const countRaw = process.env.BLOG_MAINIMAGE_PIN_PATCH_COUNT;
    const parsedCount = Number(countRaw);
    const mainImageRotationCount = Number.isFinite(parsedCount) && parsedCount >= 1 ? Math.floor(parsedCount) : 10;
    const heroSlotCount = Math.max(bodyImageCount, mainImageRotationCount);
    const { slots } = await resolveHeroImageSlots(client || {}, runDate, dryRun, {
        slugCurrent,
        postTitle: copy.title,
        topicSlug,
    }, copy.heroImages, heroSlotCount);

    const ctaUrl = readerListCtaUrl();
    const allDrySlots = slots.every((s) => String(s.assetId).startsWith('('));
    const bodySlots = slots.slice(0, bodyImageCount);
    const body =
        copy.paragraphs.length >= 6
            ? buildBodyThreeImages(copy.paragraphs, bodySlots, ctaUrl)
            : [
                  textBlock(copy.paragraphs[0] || 'Intro'),
                  textBlock(copy.paragraphs[1] || 'More'),
                  readerListCtaBlock(ctaUrl),
              ];

    const skipImageRef = allDrySlots;
    const firstHero = slots[0];
    const doc = {
        _type: 'post',
        title: copy.title,
        slug: { _type: 'slug', current: slugCurrent },
        publishedAt,
        excerpt: copy.excerpt,
        ...(skipImageRef
            ? {}
            : {
                  mainImage: {
                      _type: 'image',
                      asset: { _type: 'reference', _ref: firstHero.assetId },
                      alt: firstHero.alt,
                  },
              }),
        body,
    };

    if (dryRun) {
        // eslint-disable-next-line no-console
        console.log('[dry-run] Document preview:', JSON.stringify(doc, null, 2));
        process.exit(0);
    }

    if (!client) {
        throw new Error('SANITY write client unavailable (set SANITY_PROJECT_ID and SANITY_API_WRITE_TOKEN)');
    }

    const created = await client.create(doc);
    // eslint-disable-next-line no-console
    console.log('Created post:', created._id, 'slug:', slugCurrent);

    await patchMainImageForPinWebhooks(client, created._id, slots);

    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
