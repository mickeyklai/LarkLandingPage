const { getStore } = require('@netlify/blobs');

const MAILERLITE_API = 'https://connect.mailerlite.com/api/subscribers';
const BLOB_STORE = 'arc-hebrew-applications';

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

function sanitizeText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

async function saveApplication(record) {
  const store = getStore({ name: BLOB_STORE, consistency: 'strong' });
  const safeEmail = record.email.replace(/[^a-z0-9@._-]/gi, '_');
  const key = `${record.submittedAt}-${safeEmail}`;
  await store.setJSON(key, record);
  return key;
}

async function syncToMailerLite({ email, name }) {
  const apiToken =
    process.env.MAILERLITE_API_TOKEN || process.env.MAILERLITE_API_KEY;
  const groupId = process.env.MAILERLITE_ARC_HE_GROUP_ID;
  if (!apiToken || !groupId) return { skipped: true };

  const res = await fetch(MAILERLITE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      email,
      fields: { name: name || '' },
      groups: [groupId],
    }),
  });

  if (res.status === 200 || res.status === 201) {
    return { ok: true };
  }

  const text = await res.text();
  console.warn('MailerLite ARC sync failed', res.status, text);
  return { ok: false };
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

  const name = sanitizeText(payload.name, 120);
  const rawEmail = sanitizeText(payload.email, 254);
  const email = rawEmail.toLowerCase();
  const social = sanitizeText(payload.social, 120);
  const message = sanitizeText(payload.message, 2000);

  if (name.length < 2) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ ok: false, error: 'Please enter your name.' }),
    };
  }

  const validEmail =
    email.length > 3 &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!validEmail) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Please enter a valid email address.',
      }),
    };
  }

  const record = {
    name,
    email,
    social,
    message,
    locale: 'he',
    submittedAt: new Date().toISOString(),
    userAgent: sanitizeText(
      event.headers['user-agent'] || event.headers['User-Agent'] || '',
      300,
    ),
  };

  try {
    const key = await saveApplication(record);
    await syncToMailerLite({ email, name });
    console.log('ARC application saved', key);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true }),
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
