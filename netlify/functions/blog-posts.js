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
    'Cache-Control': 'public, max-age=60, s-maxage=300',
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
