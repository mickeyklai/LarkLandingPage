'use strict';

/**
 * Netlify build: inject TIKTOK_PIXEL_ID (or NEXT_PUBLIC_ / VITE_ aliases) into index.html.
 * Keeps the pixel ID out of git while leaving a safe placeholder for local static preview.
 */

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var indexPath = path.join(root, 'index.html');
var marker = '__TIKTOK_PIXEL_ID_PLACEHOLDER__';

var id =
    process.env.TIKTOK_PIXEL_ID ||
    process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ||
    process.env.VITE_TIKTOK_PIXEL_ID ||
    '';

if (!id) {
    console.warn(
        'inject-tiktok-pixel-id: no TIKTOK_PIXEL_ID (or NEXT_PUBLIC_TIKTOK_PIXEL_ID / VITE_TIKTOK_PIXEL_ID) set; leaving placeholder — TikTok Pixel will not load until configured.',
    );
}

var html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes(marker)) {
    console.error('inject-tiktok-pixel-id: placeholder not found in index.html');
    process.exit(1);
}

html = html.split(marker).join(id);
fs.writeFileSync(indexPath, html, 'utf8');
console.log('inject-tiktok-pixel-id: updated index.html');
