/** Canonical site origin for public blog URLs (matches SITE_URL / Netlify). */
export const SITE_ORIGIN = 'https://larkelwood.com';

export function postPublicUrl(slugCurrent) {
  if (!slugCurrent || String(slugCurrent).trim() === '') {
    return '';
  }
  return `${SITE_ORIGIN}/blog/${String(slugCurrent).replace(/^\/+|\/+$/g, '')}`;
}
