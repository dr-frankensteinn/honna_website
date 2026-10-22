// Runs once a day on Netlify so the free Supabase project never sits idle long enough to pause.
// It calls public.ping() (see supabase/setup.sql), which reads no data.
// The URL and anon key are the same public values as in config.js.

const SUPABASE_URL = 'https://dhmzdikzvkgozoreaiju.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRobXpkaWt6dmtnb3pvcmVhaWp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDk4ODYsImV4cCI6MjA5MDg4NTg4Nn0.h1M_SmUI1I3UaCV5KQyS-N3eA0SUQ3idvDAu-5awxnE';

export default async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ping`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  console.log(`Supabase ping: ${res.status} ${await res.text()}`);
  return new Response(null, { status: res.ok ? 200 : 502 });
};

export const config = { schedule: '@daily' };
