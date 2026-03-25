const MAILERLITE_API = 'https://connect.mailerlite.com/api/subscribers';

const jsonHeaders = {
  'Content-Type': 'application/json',
};

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

function parseMailerLiteError(body) {
  if (!body || typeof body !== 'object') {
    return 'Something went wrong. Please try again in a moment.';
  }
  if (body.errors && typeof body.errors === 'object') {
    const firstKey = Object.keys(body.errors)[0];
    const first = firstKey && body.errors[firstKey];
    if (Array.isArray(first) && first[0]) return String(first[0]);
  }
  if (body.message === 'Unauthenticated.') {
    return 'Something went wrong. Please try again in a moment.';
  }
  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }
  return 'Something went wrong. Please try again in a moment.';
}

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

  const apiToken =
    process.env.MAILERLITE_API_TOKEN || process.env.MAILERLITE_API_KEY;
  const groupId =
    process.env.MAILERLITE_GROUP_ID || process.env.MAILERLITE_READER_GROUP_ID;

  if (!apiToken || !groupId) {
    console.error(
      'Missing MAILERLITE_API_TOKEN (or MAILERLITE_API_KEY) or MAILERLITE_GROUP_ID (or MAILERLITE_READER_GROUP_ID)',
    );
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Something went wrong. Please try again later.',
      }),
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

  const raw = typeof payload.email === 'string' ? payload.email.trim() : '';
  const email = raw.toLowerCase();
  const valid =
    email.length > 3 &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!valid) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Please enter a valid email address.',
      }),
    };
  }

  try {
    const res = await fetch(MAILERLITE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        email,
        groups: [groupId],
      }),
    });

    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (res.status === 200 || res.status === 201) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true }),
      };
    }

    if (res.status === 422) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          ok: false,
          error: parseMailerLiteError(data),
        }),
      };
    }

    if (res.status === 429) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Too many attempts. Please wait a minute and try again.',
        }),
      };
    }

    console.error('MailerLite error', res.status, text);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Something went wrong. Please try again in a moment.',
      }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Something went wrong. Please try again in a moment.',
      }),
    };
  }
};
