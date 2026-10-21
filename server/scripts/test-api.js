require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
let token, userId, oppId, itemId;
let passed = 0, failed = 0;

async function call(method, path, body, withAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (withAuth) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function check(name, ok, detail = '') {
  if (ok) { passed++; console.log('PASS', name); }
  else { failed++; console.log('FAIL', name, detail); }
}

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
  const { data: auth, error } = await sb.auth.signInAnonymously();
  if (error) return console.error('Sign-in failed:', error.message);
  token = auth.session.access_token;
  userId = auth.user.id;
  console.log('Signed in as', userId, '\n');

  let r = await call('GET', '/health', null, false);
  check('GET /health', r.status === 200, r.status);

  r = await call('POST', '/profile', {
    full_name: 'Test Student', degree: 'B.Tech', year: 2,
    skills: ['python'], state: 'UP', category: 'scholarship',
  });
  check('POST /profile -> 201', r.status === 201, JSON.stringify(r.data));

  r = await call('GET', `/profile/${userId}`);
  check('GET /profile/:id -> 200', r.status === 200 && r.data?.profile?.degree === 'B.Tech', JSON.stringify(r.data));

  r = await call('PUT', `/profile/${userId}`, { year: 3 });
  check('PUT /profile/:id -> year 3', r.status === 200 && r.data?.profile?.year === 3, JSON.stringify(r.data));

  r = await call('POST', '/opportunities', {
    title: 'Test Scholarship', url: 'https://example.com/test-scholarship', category: 'scholarship',
  });
  oppId = r.data?.opportunity?.id;
  check('POST /opportunities -> 201', r.status === 201 && !!oppId, JSON.stringify(r.data));

  r = await call('POST', '/tracker/save', {
    opportunity_id: oppId, status: 'saved',
    document_checklist: ['Marksheet', 'Income certificate'],
  });
  itemId = r.data?.item?.id;
  check('POST /tracker/save -> 201', r.status === 201 && !!itemId, JSON.stringify(r.data));

  r = await call('GET', `/tracker/${userId}`);
  check('GET /tracker/:userId -> has item', r.status === 200 && r.data?.items?.length >= 1, JSON.stringify(r.data));

  r = await call('PUT', `/tracker/${itemId}`, { status: 'applying' });
  check('PUT /tracker/:id -> applying', r.status === 200 && r.data?.item?.status === 'applying', JSON.stringify(r.data));

  r = await call('GET', `/profile/${userId}`, null, false);
  check('No token -> 401', r.status === 401, r.status);

  r = await call('GET', '/profile/00000000-0000-0000-0000-000000000000');
  check("Other user's profile -> 403", r.status === 403, r.status);

  console.log(`\n${passed} passed, ${failed} failed`);
})();