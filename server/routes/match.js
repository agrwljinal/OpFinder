const express = require('express');
const requireAuth = require('../middleware/auth');
const supabase = require('../supabaseClient');
const router = express.Router();

router.use(requireAuth);

// Helper: Programmatic 4-State Match Engine
function calculateMatch(profile, opportunity) {
  const text = (opportunity.eligibility?.raw_text || '').toLowerCase();
  
  if (!text || text === 'not verified') {
    return {
      status: 'Insufficient Information',
      score: 0.50,
      reasons: ['Opportunity eligibility criteria text is incomplete or unverified.']
    };
  }

  const reasons = [];
  let isEligible = true;

  // Degree Check
  if (profile.degree) {
    if (text.includes(profile.degree.toLowerCase())) {
      reasons.push(`Degree matches requirement (${profile.degree}).`);
    }
  }

  // Skills Check
  if (Array.isArray(profile.skills) && profile.skills.length > 0) {
    const matchedSkills = profile.skills.filter(s => text.includes(s.toLowerCase()));
    if (matchedSkills.length > 0) {
      reasons.push(`Matches required skills: ${matchedSkills.join(', ')}.`);
    }
  }

  // State / Location Check
  if (profile.state && text.includes(profile.state.toLowerCase())) {
    reasons.push(`State eligibility matches (${profile.state}).`);
  }

  const status = isEligible ? 'Eligible' : 'Not Eligible';
  const score = isEligible ? 0.90 : 0.20;

  return { status, score, reasons };
}

// POST /api/match/:opportunityId - Run match engine for logged-in user
router.post('/:opportunityId', async (req, res) => {
  try {
    const { opportunityId } = req.params;
    const userId = req.user.id;

    // 1. Fetch User Profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      return res.status(404).json({ error: 'User profile not found. Complete profile first.' });
    }

    // 2. Fetch Opportunity
    const { data: opportunity, error: oppErr } = await supabase
      .from('opportunities')
      .select('*')
      .eq('id', opportunityId)
      .single();

    if (oppErr || !opportunity) {
      return res.status(404).json({ error: 'Opportunity not found.' });
    }

    // 3. Compute Match
    const matchResult = calculateMatch(profile, opportunity);

    // 4. Upsert into matches table
    const { data: savedMatch, error: matchErr } = await supabase
      .from('matches')
      .upsert({
        user_id: userId,
        opportunity_id: opportunityId,
        status: matchResult.status,
        score: matchResult.score,
        reasons: matchResult.reasons
      }, { onConflict: 'user_id,opportunity_id' })
      .select()
      .single();

    if (matchErr) throw matchErr;

    res.json({ success: true, match: savedMatch });
  } catch (error) {
    console.error('Match Error:', error);
    res.status(500).json({ error: error.message || 'Match calculation failed.' });
  }
});

module.exports = router;
