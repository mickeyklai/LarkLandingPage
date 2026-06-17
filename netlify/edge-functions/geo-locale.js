/**
 * Geo-based locale routing: Israel → /he/*, all other countries → English paths.
 * Runs at the edge before HTML is served so Israeli visitors never see English URLs.
 */

const HEBREW_PREFIX = '/he';
const LOCALE_PREFIX = /^\/he(\/|$)/;

function shouldSkip(pathname) {
    if (/^\/(\.netlify|netlify)\//.test(pathname)) return true;
    if (/^\/(i18n|assets|css|js|studio)\//.test(pathname)) return true;
    if (/\.(css|js|json|xml|png|jpg|jpeg|svg|ico|woff2?|txt)(\?|$)/i.test(pathname)) return true;
    if (pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/feed.xml' || pathname === '/rss.xml') {
        return true;
    }
    return false;
}

function toHebrewPath(pathname) {
    if (pathname === '/') return '/he/';
    return HEBREW_PREFIX + pathname;
}

function toEnglishPath(pathname) {
    if (pathname === '/he' || pathname === '/he/') return '/';
    return pathname.replace(/^\/he(?=\/)/, '') || '/';
}

export default async (request, context) => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (shouldSkip(pathname)) {
        return context.next();
    }

    if (/^\/he\/blog(\/|$)/.test(pathname)) {
        const target = new URL('/he/', url.origin);
        target.search = url.search;
        target.hash = url.hash;
        return Response.redirect(target.toString(), 302);
    }

    const country = context.geo?.country?.code;
    if (!country) {
        return context.next();
    }

    const isHebrew = LOCALE_PREFIX.test(pathname);

    if (country === 'IL' && !isHebrew) {
        const target = new URL(toHebrewPath(pathname), url.origin);
        target.search = url.search;
        target.hash = url.hash;
        return Response.redirect(target.toString(), 302);
    }

    if (country !== 'IL' && isHebrew) {
        const target = new URL(toEnglishPath(pathname), url.origin);
        target.search = url.search;
        target.hash = url.hash;
        return Response.redirect(target.toString(), 302);
    }

    return context.next();
};
