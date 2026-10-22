# Us.

A private two-person site in a streaming-app style: memories, photos, a bucket list, a countdown and a status for each other.

The code is public. **Nothing personal is in it.** Names, stories, dates and photos live only in Supabase, behind a sign-in, and only the two accounts listed in the `members` table can read them.

## Setup (once)

1. **Supabase → SQL editor:** run `supabase/setup.sql`. This locks every table and creates a private `photos` storage bucket.
2. **Supabase → Authentication → Users:** add both accounts with **Add user → Create new user** (email and password).
3. **Supabase → Authentication → Sign In / Providers:** turn **off** "Allow new users to sign up", so nobody else can create an account.
4. **Supabase → SQL editor:** run your own private seed file (kept outside the repo; see `.gitignore`). It adds both emails to `members` and fills in the site details and first memories.
5. Deploy the folder as a static site (Netlify: no build command, publish directory `/`).

## Day to day

- **Photos → Add photos:** uploads are resized in the browser and their location data is removed before they leave the phone.
- **Settings** (admin account): add memories with a cover photo and a note photo, and edit names, dates, cities and the promise.
- **My Corner** (partner account): set a status and mood; the other person gets an email through EmailJS.

## Files

| File | What it is |
|---|---|
| `index.html` | Page layout |
| `styles.css` | The look |
| `app.js` | Sign-in, loading from Supabase, uploads |
| `config.js` | Public keys only (the Supabase anon key is safe to publish; access is enforced by the rules in `setup.sql`) |
| `supabase/setup.sql` | Tables, row-level security and storage rules |
