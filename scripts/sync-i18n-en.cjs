#!/usr/bin/env node
/**
 * Extracts default English strings from index.html data-i18n keys into i18n/en.json.
 * Run after adding new data-i18n attributes: node scripts/sync-i18n-en.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const enPath = path.join(root, 'i18n', 'en.json');

const html = fs.readFileSync(indexPath, 'utf8');

function setNested(obj, key, value) {
  const parts = key.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const en = fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf8')) : {};

const textRe = /data-i18n="([^"]+)"[^>]*>([^<]*)</g;
let m;
while ((m = textRe.exec(html)) !== null) {
  setNested(en, m[1], m[2].trim());
}

const htmlRe = /data-i18n-html="([^"]+)"[^>]*>([\s\S]*?)<\/[a-z]+>/gi;
while ((m = htmlRe.exec(html)) !== null) {
  setNested(en, m[1], m[2].trim());
}

const attrRe = /data-i18n-attr="([^"]+)"[^>]*(?:placeholder|aria-label)="([^"]*)"/g;
while ((m = attrRe.exec(html)) !== null) {
  const specs = m[1].split(';');
  specs.forEach((spec) => {
    const [attr, key] = spec.split(':').map((s) => s.trim());
    if (attr && key) setNested(en, key, m[2]);
  });
}

const ariaRe = /data-i18n-aria="([^"]+)"[^>]*aria-label="([^"]*)"/g;
while ((m = ariaRe.exec(html)) !== null) {
  setNested(en, m[1], m[2]);
}

fs.mkdirSync(path.dirname(enPath), { recursive: true });
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');
console.log('Wrote', enPath);
