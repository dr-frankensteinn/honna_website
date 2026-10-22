// Public settings. Nothing personal goes here: the repo is public.
window.CONFIG = {
  supabaseUrl: 'https://dhmzdikzvkgozoreaiju.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRobXpkaWt6dmtnb3pvcmVhaWp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMDk4ODYsImV4cCI6MjA5MDg4NTg4Nn0.h1M_SmUI1I3UaCV5KQyS-N3eA0SUQ3idvDAu-5awxnE',
  cloudinary: { cloud: 'dzf400tbf', preset: 'honnaa', folder: 'honna-photos' },
  emailjs: { service: 'service_g1rz1mt', template: 'template_rnatuin', publicKey: 'T6Cb6b5afWAxtgXo' },
  // One-way PBKDF2 fingerprints of the three lock-screen codes typed together.
  // The codes can't be read back from these.
  lock: {
    salt: 'honna.my/lock',
    iterations: 150000,
    admin: 'd165cd562d133af8d0b76ed62770ec52a01c22569e9db63afd200307c7b5a89d',
    partner: '9f33b029c72c9507c06f65cd44b86b6a3af2a3aca0241da8f7f09f52c295cd5e',
  },
};
