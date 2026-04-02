'use strict';

/**
 * Netlify build: inject TIKTOK_PIXEL_ID and META_PIXEL_ID into index.html placeholders.
 * Secrets (TIKTOK_ACCESS_TOKEN, META_ACCESS_TOKEN) stay in env only — used by serverless only.
 */

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var indexPath = path.join(root, 'index.html');

var tiktokMarker = '__TIKTOK_PIXEL_ID_PLACEHOLDER__';
var metaMarker = '__META_PIXEL_ID_PLACEHOLDER__';

var tiktokId = process.env.TIKTOK_PIXEL_ID || '';
var metaId = process.env.META_PIXEL_ID || '';

if (!tiktokId) {
    console.warn(
        'inject-analytics-env: TIKTOK_PIXEL_ID not set; TikTok Pixel will not load until configured.',
    );
}
if (!metaId) {
    console.warn(
        'inject-analytics-env: META_PIXEL_ID not set; Meta Pixel will not load until configured.',
    );
}

var html = fs.readFileSync(indexPath, 'utf8');

if (!html.includes(tiktokMarker)) {
    console.error('inject-analytics-env: TikTok placeholder not found in index.html');
    process.exit(1);
}
if (!html.includes(metaMarker)) {
    console.error('inject-analytics-env: Meta placeholder not found in index.html');
    process.exit(1);
}

html = html.split(tiktokMarker).join(tiktokId);
html = html.split(metaMarker).join(metaId);
fs.writeFileSync(indexPath, html, 'utf8');
console.log('inject-analytics-env: updated index.html');
