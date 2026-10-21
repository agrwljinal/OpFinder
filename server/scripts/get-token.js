require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) return console.error(error.message);
  console.log('USER ID:', data.user.id);
  console.log('TOKEN:', data.session.access_token);
})();