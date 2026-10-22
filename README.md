# Us.

A private two-person site in a streaming-app style: memories, photos, a bucket list, a countdown and a status for each other.

The code is public. **Nothing personal is in it.** Names, stories, dates and photo links live in Supabase; photos live on Cloudinary.

## How it fits together

| Piece | Where |
|---|---|
| Memories | Supabase `timeline` table (`date`, `title`, `desc`, `journal_img`) |
| Photos | Uploaded to Cloudinary; links in the Supabase `photos` table |
| Bucket list | Supabase `bucketlist` table (`together`, or a person's name in lower case) |
| Her status | Supabase `status` table, row 1 |
| Site details (names, dates, cities, the promise) | Supabase `status` table, row 2, as JSON. Edited from **Settings** |
| Lock screen | Checks the three codes against one-way fingerprints in `config.js` |

The lock screen only hides the page; the tables themselves are open to anyone who has the public key.

## Day to day

- **Photos → Add photos:** pick as many as you like. They're resized in the browser and their location data is removed before upload.
- **Settings** (his codes): add memories and edit names, dates, cities and the promise.
- **My Corner** (her codes): set a status and mood; he gets an email through EmailJS.

## Changing a lock code

Run this with the new three codes typed together and paste the result into `config.js` (`admin` or `partner`):

```
python -c "import hashlib;print(hashlib.pbkdf2_hmac('sha256',b'NEWCODES',b'honna.my/lock',150000).hex())"
```

## Deploying

Netlify, linked to this repo: no build command, publish directory `/`. `netlify/functions/keepalive.mjs` touches the database once a day so the free Supabase project doesn't pause.
