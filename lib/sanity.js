'use strict';

const { createClient } = require('@sanity/client');

/**
 * Shared Sanity client for Netlify functions.
 * Set SANITY_PROJECT_ID in Netlify (and locally for `netlify dev`).
 * Optional: SANITY_DATASET (default: production), SANITY_API_VERSION.
 *
 * Expected document type: `post` with fields aligned with Sanity blog schemas:
 * - title (string)
 * - slug (slug)
 * - publishedAt (datetime, optional)
 * - excerpt (text, optional)
 * - body (array of Portable Text blocks, optional)
 */
function getSanityClient() {
    const projectId = process.env.SANITY_PROJECT_ID;
    if (!projectId || String(projectId).trim() === '') {
        throw new Error('SANITY_PROJECT_ID is not set');
    }

    return createClient({
        projectId: String(projectId).trim(),
        dataset: process.env.SANITY_DATASET || 'production',
        apiVersion: process.env.SANITY_API_VERSION || '2024-01-01',
        useCdn: true,
    });
}

module.exports = { getSanityClient };
