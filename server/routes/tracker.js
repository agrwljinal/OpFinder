const express = require('express');
const supabase = require('../supabaseClient');
const requireAuth = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['saved', 'applying', 'applied', 'rejected', 'accepted'];

// Save an opportunity to the tracker
router.post('/save', async (req, res) => {
  const { opportunity_id, status = 'saved', match, match_reasons, document_checklist, notes } = req.body;
  if (!opportunity_id) return res.status(400).json({ error: 'opportunity_id is required' });
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const { data, error } = await supabase
    .from('application_tracker')
    .upsert(
      {
        user_id: req.userId,
        opportunity_id,
        status,
        match,
        match_reasons,
        document_checklist,
        notes,
      },
      { onConflict: 'user_id,opportunity_id' }
    )
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ item: data });
});

// List a user's tracked opportunities
router.get('/:userId', async (req, res) => {
  if (req.params.userId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  const { data, error } = await supabase
    .from('application_tracker')
    .select('*, opportunities(*)')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data });
});

// Update status / notes / document checklist
router.put('/:id', async (req, res) => {
  const changes = {};
  for (const f of ['status', 'notes', 'document_checklist']) {
    if (req.body[f] !== undefined) changes[f] = req.body[f];
  }
  if (changes.status && !STATUSES.includes(changes.status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  changes.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('application_tracker')
    .update(changes)
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Item not found' });
  res.json({ item: data });
});

// Remove from tracker
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('application_tracker')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;