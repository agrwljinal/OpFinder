const express = require('express');
const supabase = require('../supabaseClient');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Create or update an opportunity (matched by url)
router.post('/', async (req, res) => {
  const { title, url, category, deadline, eligibility, evidence } = req.body;
  if (!title || !url) return res.status(400).json({ error: 'title and url are required' });

  const { data, error } = await supabase
    .from('opportunities')
    .upsert({ title, url, category, deadline, eligibility, evidence }, { onConflict: 'url' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ opportunity: data });
});

router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('opportunities').select('*').order('fetched_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ opportunities: data });
});

module.exports = router;