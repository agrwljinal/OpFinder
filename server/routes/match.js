const express = require('express');
const requireAuth = require('../middleware/auth');
const supabase = require('../supabaseClient');

const router = express.Router();
router.use(requireAuth);

const STATES = ['andhra pradesh','arunachal pradesh','assam','bihar','chhattisgarh','goa',
  'gujarat','haryana','himachal pradesh','jharkhand','karnataka','kerala','madhya pradesh',
  'maharashtra','manipur','meghalaya','mizoram','nagaland','odisha','punjab','rajasthan',
  'sikkim','tamil nadu','telangana','tripura','uttar pradesh','uttarakhand','west bengal',
  'delhi','jammu and kashmir','ladakh'];

const DEGREE_FAMILIES = {
  engineering: ['b.tech', 'btech', 'b tech', 'b.e.', 'm.tech', 'mtech', 'engineering'],
  medical: ['mbbs', 'medical', 'nursing', 'pharmacy', 'b.pharm', 'bds'],
  science: ['b.sc', 'bsc', 'm.sc', 'msc'],
  commerce: ['b.com', 'bcom', 'm.com', 'mcom', 'bba', 'mba'],
  arts: ['b.a.', 'm.a.', 'humanities'],
  law: ['llb', 'llm', 'law'],
  diploma: ['diploma', 'polytechnic'],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text, kw) => new RegExp(`(?<![a-z])${esc(kw)}(?![a-z])`).test(text);

// Collect all text from eligibility/evidence, whatever shape it is stored in
function criteriaText(opp) {
  const parts = [];
  const add = (v) => {
    if (!v) return;
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) v.forEach(add);
    else if (typeof v === 'object') Object.values(v).forEach(add);
  };
  add(opp.eligibility);
  add(opp.evidence);
  return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

const familiesIn = (text) =>
  Object.keys(DEGREE_FAMILIES).filter((f) => DEGREE_FAMILIES[f].some((k) => has(text, k)));

function yearsAllowed(text) {
  const set = new Set();
  for (const m of text.matchAll(/(\d)(?:st|nd|rd|th)?\s*(?:to|-|–|and)\s*(\d)(?:st|nd|rd|th)?[\s-]*year/g))
    for (let y = +m[1]; y <= +m[2]; y++) set.add(y);
  for (const m of text.matchAll(/(\d)(?:st|nd|rd|th)[\s-]*year/g)) set.add(+m[1]);
  for (const m of text.matchAll(/year\s*(\d)\b/g)) set.add(+m[1]);
  const words = { first: 1, second: 2, third: 3, fourth: 4 };
  for (const [w, n] of Object.entries(words))
    if (new RegExp(`\\b${w}[\\s-]*year`).test(text)) set.add(n);
  return set;
}

function incomeLimitLakh(text) {
  const m = text.match(
    /income[^.]{0,80}?(?:not exceed|does not exceed|below|less than|under|up to|upto|maximum|max\.?|within|<)\s*(?:of\s*)?(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|lacs?|lpa)?/
  );
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  if (m[2]) return v;
  return v >= 1000 ? v / 100000 : null;
}

// Each check is { state: 'pass' | 'fail' | 'unknown', reason }
function evaluate(profile, opp) {
  const text = criteriaText(opp);
  const stripped = text.replace(/not verified/g, '').trim();
  if (stripped.length < 15) {
    return {
      status: 'Insufficient Information',
      score: 0,
      reasons: ['The eligibility criteria for this opportunity were not found or not verified.'],
    };
  }

  const checks = [];

  // Degree
  if (/all (streams|courses|disciplines|branches)|any (stream|course|discipline|branch)|open to all/.test(text)) {
    checks.push({ state: 'pass', reason: 'Open to all courses.' });
  } else {
    const wanted = familiesIn(text);
    if (wanted.length) {
      const mine = familiesIn((profile.degree || '').toLowerCase());
      if (!mine.length)
        checks.push({ state: 'unknown', reason: 'Course is mentioned, but your degree could not be classified.' });
      else if (mine.some((f) => wanted.includes(f)))
        checks.push({ state: 'pass', reason: `Your degree (${profile.degree}) matches the course requirement.` });
      else
        checks.push({ state: 'fail', reason: `Requires ${wanted.join(' / ')} students; your degree is ${profile.degree}.` });
    }
  }

  // Year
  const years = yearsAllowed(text);
  if (years.size) {
    if (!profile.year) checks.push({ state: 'unknown', reason: 'Year of study is required but missing from your profile.' });
    else if (years.has(profile.year)) checks.push({ state: 'pass', reason: `Year ${profile.year} is within the allowed years.` });
    else checks.push({ state: 'fail', reason: `Open to year ${[...years].join(', ')} students; you are in year ${profile.year}.` });
  } else if (/final[\s-]*year|last year/.test(text)) {
    checks.push({ state: 'unknown', reason: 'Final-year students only; cannot confirm from your profile.' });
  }

  // State
  const statesMentioned = STATES.filter((s) => has(text, s));
  if (statesMentioned.length) {
    const mine = (profile.state || '').toLowerCase();
    if (!mine) checks.push({ state: 'unknown', reason: 'A state is mentioned, but your state is missing from your profile.' });
    else if (statesMentioned.some((s) => mine.includes(s) || s.includes(mine)))
      checks.push({ state: 'pass', reason: `State requirement matches (${profile.state}).` });
    else if (/domicile|resident|permanent|native|belong/.test(text))
      checks.push({ state: 'fail', reason: `Limited to residents of ${statesMentioned.join(', ')}.` });
    else checks.push({ state: 'unknown', reason: `Mentions ${statesMentioned.join(', ')}; residency rules unclear.` });
  }

  // Income
  if (/income/.test(text)) {
    const limit = incomeLimitLakh(text);
    if (limit == null) checks.push({ state: 'unknown', reason: 'An income limit is mentioned, but it could not be read.' });
    else if (profile.income_lakh == null) checks.push({ state: 'unknown', reason: `Income limit is about ${limit} lakh, but your income is missing from your profile.` });
    else if (Number(profile.income_lakh) <= limit) checks.push({ state: 'pass', reason: `Your income (${profile.income_lakh} lakh) is within the ${limit} lakh limit.` });
    else checks.push({ state: 'fail', reason: `Your income (${profile.income_lakh} lakh) exceeds the ${limit} lakh limit.` });
  }

  // Criteria we cannot judge from the profile -> never guarantee
  if (/\d{2}(\.\d+)?\s*%|percent|cgpa|\bgpa\b|marks/.test(text))
    checks.push({ state: 'unknown', reason: 'Minimum marks/CGPA is mentioned and is not in your profile.' });
  if (/(?<![a-z])(sc|st|obc|ews|women|girls?|female|minority|pwd|disabled|differently abled)(?![a-z])/.test(text))
    checks.push({ state: 'unknown', reason: 'Category or gender requirements may apply; check the source page.' });

  // Skills: shown as information only, never decides status
  const skillHits = (profile.skills || []).filter((s) => has(text, String(s).toLowerCase()));
  const extra = skillHits.length ? [`Your skills mentioned in the criteria: ${skillHits.join(', ')}.`] : [];

  const pass = checks.filter((c) => c.state === 'pass').length;
  const fail = checks.filter((c) => c.state === 'fail').length;
  const unknown = checks.filter((c) => c.state === 'unknown').length;
  const reasons = [...checks.map((c) => c.reason), ...extra];

  let status;
  if (fail > 0) status = 'Not Eligible';
  else if (pass === 0) status = 'Insufficient Information';
  else if (unknown > 0) status = 'Possibly Eligible';
  else {
    status = 'Eligible';
    reasons.push('Always confirm the final criteria on the official page before applying.');
  }

  const total = pass + fail + unknown;
  return { status, score: total ? Math.round((pass / total) * 100) / 100 : 0, reasons };
}

// POST /api/match/:opportunityId
router.post('/:opportunityId', async (req, res) => {
  try {
    const { data: profile, error: pErr } = await supabase
      .from('profiles').select('*').eq('id', req.userId).maybeSingle();
    if (pErr) throw pErr;
    if (!profile) return res.status(404).json({ error: 'Complete your profile first.' });

    const { data: opp, error: oErr } = await supabase
      .from('opportunities').select('*').eq('id', req.params.opportunityId).maybeSingle();
    if (oErr) throw oErr;
    if (!opp) return res.status(404).json({ error: 'Opportunity not found.' });

    const result = evaluate(profile, opp);

    const { data: saved, error: mErr } = await supabase
      .from('matches')
      .upsert(
        { user_id: req.userId, opportunity_id: opp.id, ...result, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,opportunity_id' }
      )
      .select()
      .single();
    if (mErr) throw mErr;

    res.json({ success: true, match: saved });
  } catch (err) {
    console.error('Match error:', err);
    res.status(500).json({ error: err.message || 'Match calculation failed.' });
  }
});

// GET /api/match : all of this user's matches, with the opportunity attached
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('matches')
    .select('*, opportunities(*)')
    .eq('user_id', req.userId)
    .order('updated_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ matches: data });
});

module.exports = router;