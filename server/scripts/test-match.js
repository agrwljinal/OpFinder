require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
let token;

const call = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
  token = (await sb.auth.signInAnonymously()).data.session.access_token;

  const opp = (await call('POST', '/opportunities', {
    title: 'Match Test Scholarship',
    url: 'https://example.com/match-test',
    category: 'scholarship',
    eligibility: ['Open to second year B.Tech students in Uttar Pradesh. Family income should not exceed 6 lakh per annum.'],
  })).opportunity;

  const empty = (await call('POST', '/opportunities', {
    title: 'Empty Criteria Test', url: 'https://example.com/match-empty', category: 'scholarship',
    eligibility: [],
  })).opportunity;

  const cases = [
    ['Expect Eligible', { degree: 'B.Tech', year: 2, state: 'Uttar Pradesh', income_lakh: 4 }, opp.id],
    ['Expect Possibly Eligible (income missing)', { degree: 'B.Tech', year: 2, state: 'Uttar Pradesh', income_lakh: null }, opp.id],
    ['Expect Not Eligible (wrong year)', { degree: 'B.Tech', year: 3, state: 'Uttar Pradesh', income_lakh: 4 }, opp.id],
    ['Expect Insufficient Information', { degree: 'B.Tech', year: 2 }, empty.id],
  ];

  for (const [label, profile, oppId] of cases) {
    await call('POST', '/profile', profile);
    const r = await call('POST', `/match/${oppId}`);
    console.log(label, '->', r.match?.status || r);
  }
})();