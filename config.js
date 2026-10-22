// Public settings. These are safe in a public repo: the Supabase anon key can only do what
// the row-level rules in supabase/setup.sql allow, which is nothing until a member signs in.
window.CONFIG = {
  supabaseUrl: 'https://dhmzdikzvkgozoreaiju.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRobXpkaWt6dmtnb3pvcmVhaWp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDk4ODYsImV4cCI6MjA5MDg4NTg4Nn0.h1M_SmUI1I3UaCV5KQyS-N3eA0SUQ3idvDAu-5awxnE',
  emailjs: { service: 'service_g1rz1mt', template: 'template_rnatuin', publicKey: 'T6Cb6b5afWAxtgXo' },
};
