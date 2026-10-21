const express = require('express');
const supabase = require('../supabaseClient');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const FIELDS = ['full_name', 'degree', 'year', 'skills', 'state', 'category', 'income_lakh'];
const pick = (body) =>
  Object.fromEntries(FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));

// Create
router.post('/', async (req, res) => {
  const { degree, year } = req.body;
  if (!degree || !year) return res.status(400).json({ error: 'degree and year are required' });

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ ...pick(req.body), id: req.userId })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ profile: data });
});

// Read
router.get('/:id', async (req, res) => {
  if (req.params.id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', req.userId).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Profile not found' });
  res.json({ profile: data });
});

// Update
router.put('/:id', async (req, res) => {
  if (req.params.id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...pick(req.body), updated_at: new Date().toISOString() })
    .eq('id', req.userId)
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Profile not found' });
  res.json({ profile: data });
});

module.exports = router;