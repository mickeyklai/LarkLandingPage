'use strict';

const { getSanityClient } = require('../../lib/sanity');

const LIST_QUERY = `
  *[_type == "post" && !(_id in path("drafts.**")) && defined(slug.current)] | order(coalesce(publishedAt, _updatedAt) desc) {
    title,
    "slug": slug.current,
    publishedAt,
    excerpt
  }
`;

const headers = {
    'Content-Type': 'application/json',
    // Short CDN cache so /blog/ “All posts” catches new publishes quickly (Make users refresh same day).
    'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
};

exports.handler = async function handler(event) {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    try {
        const client = getSanityClient({ useCdn: false });
        const posts = await client.fetch(LIST_QUERY);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(posts),
        };
    } catch (err) {
        console.error('blog-posts:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: err.message || 'Failed to fetch posts',
            }),
        };
    }
};
