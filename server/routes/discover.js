const express = require('express');
const requireAuth = require('../middleware/auth');
const supabase = require('../supabaseClient');
const router = express.Router();

router.use(requireAuth);

const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY;

// Helper: Run TinyFish Search API
async function tinyfishSearch(query) {
  const url = `https://api.search.tinyfish.ai?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { 'X-API-Key': TINYFISH_API_KEY }
  });
  if (!response.ok) throw new Error(`TinyFish Search failed with status ${response.status}`);
  const data = await response.json();
  return data.results || [];
}

// Helper: Run TinyFish Fetch API
async function tinyfishFetch(urls) {
  const response = await fetch('https://api.fetch.tinyfish.ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': TINYFISH_API_KEY
    },
    body: JSON.stringify({ urls, format: 'markdown' })
  });
  if (!response.ok) throw new Error(`TinyFish Fetch failed with status ${response.status}`);
  const data = await response.json();
  return data.results || [];
}

// Helper: Check if deadline is active or expired
function checkDeadlineStatus(deadlineStr) {
  if (!deadlineStr || deadlineStr === 'Not verified') return 'Active';
  const parsedDate = new Date(deadlineStr);
  if (isNaN(parsedDate.getTime())) return 'Active'; // default if unparseable
  return parsedDate >= new Date() ? 'Active' : 'Expired';
}

// GET /api/discover - Fetch live student opportunities
router.get('/', async (req, res) => {
  try {
    const query = req.query.q || 'latest student scholarships hackathons internships India 2026';
    
    // 1. Search TinyFish for live URLs
    const searchResults = await tinyfishSearch(query);
    if (!searchResults.length) {
      return res.json({ success: true, count: 0, opportunities: [] });
    }

    // Grab top 5 search URLs
    const targetUrls = searchResults.slice(0, 5).map(item => item.url);

    // 2. Fetch page content via TinyFish Fetch API
    const fetchedPages = await tinyfishFetch(targetUrls);

    // 3. Parse and normalize structured listings
    const discoveredItems = fetchedPages.map((page) => {
      const searchMeta = searchResults.find(s => s.url === page.url) || {};
      const title = searchMeta.title || 'Untitled Opportunity';
      
      // Default to "Not verified" unless parsed from page text
      const rawDeadline = 'Not verified'; 
      const status = checkDeadlineStatus(rawDeadline);

      return {
        title,
        url: page.final_url || page.url,
        category: title.toLowerCase().includes('hackathon') ? 'Hackathon' : 
                  title.toLowerCase().includes('internship') ? 'Internship' : 'Scholarship',
        deadline: rawDeadline,
        status,
        eligibility: {
          raw_text: page.text ? page.text.substring(0, 500) : 'Not verified'
        },
        evidence: {
          source_snippet: searchMeta.snippet || 'Extracted via TinyFish Search/Fetch'
        }
      };
    });

    // 4. Upsert into Supabase `opportunities` table
    const savedOpportunities = [];
    for (const item of discoveredItems) {
      const { data, error } = await supabase
        .from('opportunities')
        .upsert(
          {
            title: item.title,
            url: item.url,
            category: item.category,
            deadline: item.deadline,
            eligibility: item.eligibility,
            evidence: item.evidence
          },
          { onConflict: 'url' }
        )
        .select()
        .single();

      if (!error && data) {
        savedOpportunities.push({ ...data, active_status: item.status });
      }
    }

    res.json({
      success: true,
      count: savedOpportunities.length,
      opportunities: savedOpportunities
    });

  } catch (error) {
    console.error('Discovery Error:', error);
    res.status(500).json({ error: error.message || 'Discovery pipeline failed' });
  }
});

module.exports = router;