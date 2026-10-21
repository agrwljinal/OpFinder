require('dotenv').config();

const KEY = process.env.TINYFISH_API_KEY;
if (!KEY) {
  console.error('TINYFISH_API_KEY is missing in server/.env');
  process.exit(1);
}

(async () => {
  // 1. SEARCH
  const q = 'engineering scholarships for Indian students 2026 eligibility deadline';
  const sRes = await fetch(
    'https://api.search.tinyfish.ai?query=' + encodeURIComponent(q),
    { headers: { 'X-API-Key': KEY } }
  );
  if (!sRes.ok) {
    console.error('Search failed:', sRes.status, await sRes.text());
    return;
  }
  const search = await sRes.json();
  console.log('SEARCH RESULTS:');
  search.results.slice(0, 5).forEach((r) => console.log('-', r.title, '->', r.url));

  // 2. FETCH the top 2 pages
  const urls = search.results.slice(0, 2).map((r) => r.url);
  const fRes = await fetch('https://api.fetch.tinyfish.ai', {
    method: 'POST',
    headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls, format: 'markdown' }),
  });
  if (!fRes.ok) {
    console.error('Fetch failed:', fRes.status, await fRes.text());
    return;
  }
  const pages = await fRes.json();
  console.log('\nFETCHED PAGES:');
  pages.results.forEach((p) => {
    console.log('-', p.url, '| characters:', (p.text || '').length);
    console.log('  preview:', (p.text || '').slice(0, 200).replace(/\s+/g, ' '));
  });
  if (pages.errors?.length) console.log('Errors:', pages.errors);
})();