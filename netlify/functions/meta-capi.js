const crypto = require('crypto');

const GRAPH_VERSION = 'v21.0';
const jsonHeaders = { 'Content-Type': 'application/json' };

function corsHeaders(event) {
    const origin = event.headers.origin || event.headers.Origin;
    const allowed = process.env.SITE_URL;
    const allowOrigin =
        allowed && origin && origin.replace(/\/$/, '') === allowed.replace(/\/$/, '')
            ? origin
            : '*';
    return {
        ...jsonHeaders,
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
}

function sha256Hex(value) {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Server-side Meta Conversions API — uses META_PIXEL_ID + META_ACCESS_TOKEN (never exposed to browser).
 * POST JSON: { eventName, eventId?, eventSourceUrl?, email? }
 * eventId: optional; use same value client-side with fbq('track', ..., { eventID: '...' }) for deduplication.
 */
exports.handler = async function handler(event) {
    const headers = corsHeaders(event);

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
        };
    }

    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
        console.error('meta-capi: missing META_PIXEL_ID or META_ACCESS_TOKEN');
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ ok: false, error: 'Server misconfiguration.' }),
        };
    }

    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ ok: false, error: 'Invalid request.' }),
        };
    }

    const eventName =
        typeof payload.eventName === 'string' ? payload.eventName.trim() : '';
    const allowedNames = new Set(['CompleteRegistration', 'Lead', 'Subscribe']);
    if (!eventName || !allowedNames.has(eventName)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                ok: false,
                error: 'Invalid or missing eventName.',
            }),
        };
    }

    const eventSourceUrl =
        typeof payload.eventSourceUrl === 'string' && payload.eventSourceUrl.trim()
            ? payload.eventSourceUrl.trim().slice(0, 2048)
            : process.env.SITE_URL || 'https://larkelwood.com/';

    const eventId =
        typeof payload.eventId === 'string' && payload.eventId.trim()
            ? payload.eventId.trim().slice(0, 64)
            : undefined;

    const userData = {};
    const rawEmail =
        typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        userData.em = [sha256Hex(rawEmail)];
    }

    const data = {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: eventSourceUrl,
        user_data: userData,
    };
    if (eventId) data.event_id = eventId;

    if (
        payload.customData &&
        typeof payload.customData === 'object' &&
        !Array.isArray(payload.customData)
    ) {
        data.custom_data = payload.customData;
    }

    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`);
    url.searchParams.set('access_token', accessToken);

    try {
        const res = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: [data] }),
        });

        const text = await res.text();
        let body = null;
        if (text) {
            try {
                body = JSON.parse(text);
            } catch {
                body = null;
            }
        }

        if (!res.ok) {
            console.error('meta-capi Graph error', res.status, text);
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    ok: false,
                    error: 'Upstream error.',
                }),
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ok: true, events_received: body?.events_received }),
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ ok: false, error: 'Request failed.' }),
        };
    }
};
