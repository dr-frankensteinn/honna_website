// Everything personal (names, stories, photos, dates) comes from the database.
// Nothing personal belongs in this file: the repo is public.

const { supabaseUrl, supabaseKey, cloudinary: CL, emailjs: EJ, lock: LOCK } = window.CONFIG;
const sb = supabase.createClient(supabaseUrl, supabaseKey);
const SETTINGS_ROW = 2; // the status table's row 2 holds the site details as JSON in `mood`
const ROLE_KEY = 'us.role';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = () => lucide.createIcons();

const S = { me: null, settings: {}, timeline: [], photos: [], bucket: [], status: null };
const set = k => S.settings[k] || '';
const city = k => { const c = S.settings[k]; if (c && typeof c === 'object') return c; try { return JSON.parse(c) || {}; } catch { return {}; } };
const isAdmin = () => S.me?.role === 'admin';
const myName = () => set(isAdmin() ? 'name_him' : 'name_her');
let statusTimer, clockTimer, page = 'home';

// ---------------------------------------------------------------- lock ----

async function fingerprint(code) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(LOCK.salt), iterations: LOCK.iterations }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function boot() {
  let role = null;
  try { role = localStorage.getItem(ROLE_KEY); } catch {}
  try {
    if (role === 'admin' || role === 'partner') await enter(role);
    else showLogin();
  } catch (e) {
    console.error(e);
    showLogin("Couldn't reach the server. Check your connection and try again.");
  } finally {
    $('#loading').classList.add('gone');
  }
}

function showLogin(msg = '') {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#loginMsg').textContent = msg;
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  $('#loginMsg').textContent = '';
  const fp = await fingerprint(['#key1', '#key2', '#key3'].map(id => $(id).value.trim()).join(''));
  const role = fp === LOCK.admin ? 'admin' : fp === LOCK.partner ? 'partner' : null;
  btn.disabled = false;
  if (!role) { $('#loginMsg').textContent = 'Incorrect'; return; }
  e.target.reset();
  try { localStorage.setItem(ROLE_KEY, role); } catch {}
  await enter(role);
});

async function enter(role) {
  S.me = { role };
  $('#login').hidden = true;
  $('#app').hidden = false;
  document.querySelectorAll('[data-role]').forEach(el => { el.hidden = el.dataset.role !== role; });
  await loadAll();
  const name = myName() || (isAdmin() ? 'Admin' : 'Me');
  const av = $('#profileBtn');
  av.textContent = name[0].toUpperCase();
  av.className = `avatar ${role}`;
  $('#menuName').textContent = name;
  go('home');
  checkAnniversary();
  try { emailjs.init(EJ.publicKey); } catch (e) { console.warn('EmailJS:', e); }
  clearInterval(statusTimer);
  statusTimer = setInterval(refreshStatus, 30000);
}

function signOut() {
  clearInterval(statusTimer);
  stopNight();
  try { localStorage.removeItem(ROLE_KEY); } catch {}
  Object.assign(S, { me: null, settings: {}, timeline: [], photos: [], bucket: [], status: null });
  showLogin();
}

// ------------------------------------------------------------------- data --

async function loadAll() {
  const [tl, ph, bl, st] = await Promise.all([
    sb.from('timeline').select('*').order('id'),
    sb.from('photos').select('*').order('id', { ascending: false }),
    sb.from('bucketlist').select('*').order('id'),
    sb.from('status').select('*').in('id', [1, SETTINGS_ROW]),
  ]);
  [tl, ph, bl, st].forEach(r => r.error && console.error(r.error));
  const rows = st.data || [];
  S.status = rows.find(r => r.id === 1) || null;
  try { S.settings = JSON.parse(rows.find(r => r.id === SETTINGS_ROW)?.mood || '{}'); } catch { S.settings = {}; }
  S.timeline = tl.data || [];
  S.photos = ph.data || [];
  S.bucket = bl.data || [];
  renderAll();
}

const shownPhotos = () => S.photos.filter(p => p.url);

// Resize in the browser before upload. Redrawing on a canvas also drops EXIF, including GPS location.
async function shrink(file, max = 2000) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error(`Can't read ${file.name}. Try a JPG or PNG (iPhone HEIC photos need converting first).`); }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.86));
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('file', await shrink(file));
  fd.append('upload_preset', CL.preset);
  fd.append('folder', CL.folder);
  const r = await fetch(`https://api.cloudinary.com/v1_1/${CL.cloud}/image/upload`, { method: 'POST', body: fd });
  const d = await r.json();
  if (!d.secure_url) throw new Error(d.error?.message || 'Upload failed');
  return d.secure_url;
}

// ----------------------------------------------------------------- render --

function renderAll() {
  renderHero();
  renderRows();
  renderStory();
  renderPhotos();
  renderBucket();
  renderUs();
  renderStatus();
  fillSettings();
  icons();
}

function countdownText() {
  if (!set('reunion_date')) return '';
  const diff = new Date(set('reunion_date') + 'T00:00:00') - new Date();
  if (diff <= 0) return '';
  const d = Math.floor(diff / 864e5), h = Math.floor(diff / 36e5) % 24, m = Math.floor(diff / 6e4) % 60;
  return d ? `${d}d ${h}h` : `${h}h ${m}m`;
}

function renderHero() {
  const withImg = [...S.timeline].reverse().find(t => t.journal_img);
  const featured = withImg || S.timeline[S.timeline.length - 1];
  const photos = shownPhotos();
  const img = withImg ? withImg.journal_img : photos.length ? photos[Math.floor(Math.random() * Math.min(photos.length, 30))].url : '';
  const cd = countdownText();
  $('#hero').innerHTML = `
    ${img ? `<img class="hero-img" src="${esc(img)}" alt="">` : ''}
    <div class="hero-shade"></div>
    <div class="hero-body">
      <p class="hero-kicker"><span class="logo">U</span>${featured ? 'MEMORY' : 'OUR STORY'}</p>
      <h1 class="hero-title">${esc(featured?.title || 'Our Story')}</h1>
      ${cd ? `<p class="hero-meta"><span class="new">${esc(set('reunion_label') || 'Reunion')}</span> in ${esc(cd)}</p>` : ''}
      <p class="hero-desc">${esc(featured?.desc || (photos.length ? `${photos.length} photos and counting.` : 'Add your first memory and photos to fill this up.'))}</p>
      <div class="hero-actions">
        <button class="btn-white" data-act="play"><i data-lucide="play"></i>Play</button>
        ${featured ? `<button class="btn-grey" data-act="info" data-id="${featured.id}"><i data-lucide="info"></i>More Info</button>` : ''}
      </div>
    </div>`;
}

function memoryCard(t) {
  return `<button class="card" data-act="info" data-id="${t.id}">
    ${t.journal_img ? `<img src="${esc(t.journal_img)}" alt="" loading="lazy">` : `<span class="card-blank">${esc(t.title)}</span>`}
    <span class="card-label"><b>${esc(t.title)}</b><small>${esc(t.date)}</small></span>
  </button>`;
}

function photoCard(p, i) {
  return `<button class="card" data-act="photo" data-i="${i}">
    <img src="${esc(thumb(p.url, 600))}" alt="${esc(p.caption)}" loading="lazy">
    ${p.caption ? `<span class="card-label"><b>${esc(p.caption)}</b></span>` : ''}
  </button>`;
}

// Cloudinary can serve a smaller copy on the fly; rows and the grid don't need full-size photos.
const thumb = (url, w) => url.includes('/image/upload/') ? url.replace('/image/upload/', `/image/upload/c_limit,w_${w},q_auto,f_auto/`) : url;

const row = (title, items) => items.length ? `<section class="row"><h2>${esc(title)}</h2><div class="track">${items.join('')}</div></section>` : '';

function renderRows() {
  const photos = shownPhotos();
  const todo = S.bucket.filter(b => b.category === 'together' && !b.done).slice(0, 10);
  const html = [
    row('Our Story', S.timeline.map(memoryCard)),
    row('Recently Added', photos.slice(0, 20).map((p, i) => photoCard(p, i))),
    row('Top 10 Things To Do Together', todo.map((b, i) => `<button class="top" data-act="go" data-page="bucket"><span class="top-n">${i + 1}</span><span class="top-tile">${esc(b.text)}</span></button>`)),
    ...chunks(photos.slice(20), 25).map((part, n) => row(n ? 'More Photos' : 'Throwbacks', part.map((p, i) => photoCard(p, 20 + n * 25 + i)))),
  ].join('');
  $('#homeRows').innerHTML = html || '<p class="empty-row">Nothing here yet. Add memories in Settings and photos in Photos.</p>';
}

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

function renderStory() {
  $('#sinceLabel').textContent = set('since_label');
  $('#episodes').innerHTML = S.timeline.map((t, i) => `
    <li class="episode" tabindex="0" data-act="info" data-id="${t.id}">
      <span class="ep-n">${i + 1}</span>
      <div class="ep-thumb">${t.journal_img ? `<img src="${esc(thumb(t.journal_img, 500))}" alt="" loading="lazy">` : `<span class="card-blank">${esc(t.title)}</span>`}</div>
      <div><div class="ep-top"><h3>${esc(t.title)}</h3><span>${esc(t.date)}</span></div><p class="ep-desc">${esc(t.desc)}</p></div>
    </li>`).join('') || '<li class="empty">No memories yet.</li>';
}

function renderPhotos() {
  const photos = shownPhotos();
  $('#photoGrid').innerHTML = photos.map((p, i) => `
    <button class="photo" data-act="photo" data-i="${i}">
      <img src="${esc(thumb(p.url, 700))}" alt="${esc(p.caption)}" loading="lazy">
      ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}
    </button>`).join('') || '<p class="empty">No photos yet. Add the first one.</p>';
}

// Bucket categories are 'together' plus each person's name in lower case, as the list has always stored them.
function bucketCols() {
  const cols = [['together', 'Together']];
  for (const k of ['name_her', 'name_him']) if (set(k)) cols.push([set(k).toLowerCase(), set(k)]);
  for (const cat of new Set(S.bucket.map(b => b.category))) {
    if (cat && !cols.some(c => c[0] === cat)) cols.push([cat, cat[0].toUpperCase() + cat.slice(1)]);
  }
  return cols;
}

function renderBucket() {
  $('#bucketCols').innerHTML = bucketCols().map(([cat, title]) => `
    <div class="panel bucket">
      <h2>${esc(title)}</h2>
      <ul>${S.bucket.filter(b => b.category === cat).map(b => `
        <li class="b-item ${b.done ? 'done' : ''}" data-act="toggle" data-id="${b.id}">
          <span class="b-check">${b.done ? '<i data-lucide="check"></i>' : ''}</span>
          <span class="b-text">${esc(b.text)}</span>
          <button class="b-del" data-act="delBucket" data-id="${b.id}" aria-label="Remove"><i data-lucide="x"></i></button>
        </li>`).join('')}</ul>
      <form class="b-add" data-cat="${esc(cat)}"><input type="text" placeholder="Add…" maxlength="120" aria-label="Add to ${esc(title)}"><button class="btn-red" type="submit" aria-label="Add"><i data-lucide="plus"></i></button></form>
    </div>`).join('');
}

function renderUs() {
  $('#reunionLabel').textContent = set('reunion_label') || 'Reunion';
  const him = city('city_him'), her = city('city_her');
  $('#cityHim').textContent = him.name || set('name_him') || '—';
  $('#cityHer').textContent = her.name || set('name_her') || '—';
  $('#vow').textContent = set('vow') ? `“${set('vow')}”` : '';
  $('#nightTitle').textContent = set('night_title') || 'That Night';
  $('#nightDate').textContent = set('anniversary') ? fmtDate(set('anniversary')) : '';
  $('#cornerHello').textContent = `Hey, ${myName() || 'you'}`;
  tickCountdown();
  clearInterval(clockTimer);
  clockTimer = setInterval(tickCountdown, 1000);
  fetchWeather(him, her);
}

function tickCountdown() {
  const el = $('#reunionTimer');
  if (!set('reunion_date')) { el.textContent = '—'; return; }
  const diff = new Date(set('reunion_date') + 'T00:00:00') - new Date();
  if (diff <= 0) { el.textContent = 'Together'; return; }
  const d = Math.floor(diff / 864e5), h = Math.floor(diff / 36e5) % 24, m = Math.floor(diff / 6e4) % 60, s = Math.floor(diff / 1e3) % 60;
  el.textContent = `${d}d ${h}h ${m}m ${String(s).padStart(2, '0')}s`;
}

async function fetchWeather(him, her) {
  const one = async (c, id) => {
    if (c.lat == null || c.lon == null) return;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(c.lat)}&longitude=${encodeURIComponent(c.lon)}&current=temperature_2m`);
      $(id).textContent = Math.round((await r.json()).current.temperature_2m);
    } catch (e) { console.warn('Weather:', e); }
  };
  one(him, '#tempHim');
  one(her, '#tempHer');
}

function renderStatus() {
  const pill = $('#partnerStatus');
  if (!S.status?.status) { pill.hidden = true; return; }
  pill.hidden = false;
  const who = set('name_her') || 'Her';
  pill.title = S.status.mood || '';
  pill.innerHTML = `<span class="dot"></span><span class="txt">${esc(who)} · ${esc(S.status.status)}${S.status.mood ? ` — ${esc(S.status.mood)}` : ''}</span>`;
  $('#statusInput').value = S.status.status;
  $('#moodInput').value = S.status.mood || '';
}

async function refreshStatus() {
  const { data } = await sb.from('status').select('*').eq('id', 1).maybeSingle();
  if (data) { S.status = data; renderStatus(); }
}

function fillSettings() {
  if (!isAdmin()) return;
  ['name_him', 'name_her', 'anniversary', 'since_label', 'reunion_date', 'reunion_label', 'night_title', 'vow']
    .forEach(k => { $(`#s_${k}`).value = set(k); });
  for (const who of ['him', 'her']) {
    const c = city(`city_${who}`);
    $(`#s_city_${who}_name`).value = c.name || '';
    $(`#s_city_${who}_lat`).value = c.lat ?? '';
    $(`#s_city_${who}_lon`).value = c.lon ?? '';
  }
}

const fmtDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ------------------------------------------------------------- navigation --

function go(p) {
  if (!document.getElementById(`page-${p}`)) return;
  page = p;
  document.querySelectorAll('.page').forEach(el => { el.hidden = el.id !== `page-${p}`; });
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.page === p));
  $('#profileMenu').hidden = true;
  window.scrollTo(0, 0);
  if (p === 'us') startNight(); else stopNight();
}

window.addEventListener('scroll', () => $('#nav').classList.toggle('solid', scrollY > 40), { passive: true });

// ------------------------------------------------------------ memories ----

function openMemory(id) {
  const t = S.timeline.find(x => x.id === id);
  if (!t) return;
  $('#modalBody').innerHTML = `
    <div class="m-hero">${t.journal_img ? `<img src="${esc(t.journal_img)}" alt="">` : ''}<h2 id="modalTitle">${esc(t.title)}</h2></div>
    <div class="m-body">
      <p class="m-meta">${esc(t.date)}</p>
      <p class="m-desc">${esc(t.desc)}</p>
      ${isAdmin() ? `<div class="m-admin">
        <label class="btn-grey"><i data-lucide="image"></i>${t.journal_img ? 'Change' : 'Add'} photo<input type="file" accept="image/*" data-id="${t.id}"></label>
        <button class="btn-grey" data-act="delMemory" data-id="${t.id}"><i data-lucide="trash-2"></i>Delete</button>
      </div>` : ''}
    </div>`;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
  icons();
}

function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
}

$('#modal').addEventListener('change', async e => {
  const input = e.target.closest('input[type=file][data-id]');
  if (!input?.files[0]) return;
  const id = +input.dataset.id;
  toast('Uploading…');
  try {
    const url = await uploadImage(input.files[0]);
    const { error } = await sb.from('timeline').update({ journal_img: url }).eq('id', id);
    if (error) throw error;
    await loadAll();
    openMemory(id);
    toast('Saved');
  } catch (err) { toast(err.message); }
});

async function deleteMemory(id) {
  const t = S.timeline.find(x => x.id === id);
  if (!t || !confirm(`Delete "${t.title}"?`)) return;
  const { error } = await sb.from('timeline').delete().eq('id', id);
  if (error) { toast(error.message); return; }
  closeModal();
  await loadAll();
  toast('Memory deleted');
}

$('#memoryForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const day = $('#m_sort_date').value;
    const row = {
      date: $('#m_label').value.trim() || (day ? fmtDate(day) : ''),
      title: $('#m_title').value.trim(),
      desc: $('#m_desc').value.trim(),
      journal_img: $('#m_cover').files[0] ? await uploadImage($('#m_cover').files[0]) : null,
    };
    const { error } = await sb.from('timeline').insert(row);
    if (error) throw error;
    e.target.reset();
    await loadAll();
    toast(`Added "${row.title}"`);
  } catch (err) { toast(err.message); }
  btn.disabled = false;
});

$('#siteForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  const num = id => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };
  const next = { ...S.settings };
  ['name_him', 'name_her', 'anniversary', 'since_label', 'reunion_date', 'reunion_label', 'night_title', 'vow']
    .forEach(k => { next[k] = $(`#s_${k}`).value.trim(); });
  for (const who of ['him', 'her']) {
    next[`city_${who}`] = { name: $(`#s_city_${who}_name`).value.trim(), lat: num(`#s_city_${who}_lat`), lon: num(`#s_city_${who}_lon`) };
  }
  const { error } = await sb.from('status').upsert({ id: SETTINGS_ROW, status: 'settings', mood: JSON.stringify(next) });
  btn.disabled = false;
  if (error) { toast(error.message); return; }
  await loadAll();
  toast('Saved');
});

// --------------------------------------------------------------- photos ----

$('#uploadForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter, files = [...$('#photoFiles').files], caption = $('#photoCaption').value.trim();
  if (!files.length) return;
  btn.disabled = true;
  // Three at a time; a photo that fails is skipped so one bad file doesn't stop a big batch.
  let done = 0, next = 0;
  const failed = [];
  const worker = async () => {
    while (next < files.length) {
      const f = files[next++];
      try {
        const url = await uploadImage(f);
        const { error } = await sb.from('photos').insert({ url, caption });
        if (error) throw error;
        done++;
      } catch (err) { console.warn(f.name, err); failed.push(f.name); }
      btn.textContent = `Uploading ${done + failed.length} of ${files.length}…`;
    }
  };
  btn.textContent = `Uploading 0 of ${files.length}…`;
  await Promise.all([worker(), worker(), worker()]);
  if (!failed.length) { e.target.reset(); e.target.hidden = true; }
  toast(`Added ${done} photo${done === 1 ? '' : 's'}${failed.length ? `. ${failed.length} failed: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}` : ''}`);
  btn.disabled = false;
  btn.textContent = 'Upload';
  await loadAll();
});

let lb = { i: 0, timer: null };

function openLightbox(i, slideshow = false) {
  const photos = shownPhotos();
  if (!photos.length) { toast('Add some photos first'); go('photos'); return; }
  lb.i = i;
  showSlide();
  $('#lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
  clearInterval(lb.timer);
  if (slideshow) lb.timer = setInterval(() => stepLightbox(1), 4000);
  icons();
}

function showSlide() {
  const photos = shownPhotos();
  lb.i = (lb.i + photos.length) % photos.length;
  const p = photos[lb.i];
  $('#lbImg').src = thumb(p.url, 1800);
  $('#lbImg').alt = p.caption || '';
  $('#lbCaption').textContent = p.caption || '';
  const ahead = photos[(lb.i + 1) % photos.length];
  if (ahead) new Image().src = thumb(ahead.url, 1800);
}

function stepLightbox(d) { lb.i += d; showSlide(); }

function closeLightbox() {
  clearInterval(lb.timer);
  $('#lightbox').hidden = true;
  document.body.style.overflow = '';
}

async function deletePhoto() {
  const p = shownPhotos()[lb.i];
  if (!p || !confirm('Delete this photo for both of you?')) return;
  const { error } = await sb.from('photos').delete().eq('id', p.id);
  if (error) { toast(error.message); return; }
  closeLightbox();
  await loadAll();
  toast('Photo deleted');
}

// --------------------------------------------------------------- bucket ---

$('#bucketCols').addEventListener('submit', async e => {
  e.preventDefault();
  const input = e.target.querySelector('input'), text = input.value.trim();
  if (!text) return;
  const cat = e.target.dataset.cat;
  const { error } = await sb.from('bucketlist').insert({ text, category: cat, done: false });
  if (error) { toast(error.message); return; }
  await reloadBucket();
  [...document.querySelectorAll('.b-add')].find(f => f.dataset.cat === cat)?.querySelector('input').focus();
});

async function toggleBucket(id) {
  const b = S.bucket.find(x => x.id === id);
  if (!b) return;
  b.done = !b.done;
  renderBucket(); icons();
  const { error } = await sb.from('bucketlist').update({ done: b.done }).eq('id', id);
  if (error) toast(error.message);
  await reloadBucket();
}

async function deleteBucket(id) {
  const { error } = await sb.from('bucketlist').delete().eq('id', id);
  if (error) { toast(error.message); return; }
  await reloadBucket();
}

async function reloadBucket() {
  const { data } = await sb.from('bucketlist').select('*').order('id');
  S.bucket = data || [];
  renderBucket();
  renderRows();
  icons();
}

// --------------------------------------------------------------- corner ---

$('#statusForm').addEventListener('submit', async e => {
  e.preventDefault();
  const status = $('#statusInput').value, mood = $('#moodInput').value.trim();
  const { error } = await sb.from('status').upsert({ id: 1, status, mood });
  if (error) { toast(error.message); return; }
  S.status = { id: 1, status, mood };
  renderStatus();
  emailjs.send(EJ.service, EJ.template, { status, mood }).catch(err => console.warn('Email:', err));
  toast('Status updated');
});

// ---------------------------------------------------------------- extras --

function checkAnniversary() {
  const a = set('anniversary');
  if (!a) return;
  const start = new Date(a + 'T00:00:00'), now = new Date();
  if (start.getMonth() !== now.getMonth() || start.getDate() !== now.getDate()) return;
  const years = now.getFullYear() - start.getFullYear();
  setTimeout(() => {
    confetti({ particleCount: 220, spread: 100, origin: { y: .5 }, colors: ['#e50914', '#ffffff', '#b20710'] });
    toast(years > 0 ? `Happy anniversary — ${years} year${years === 1 ? '' : 's'}` : 'Happy anniversary');
  }, 1200);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

document.addEventListener('click', e => {
  if (!e.target.closest('.profile')) $('#profileMenu').hidden = true;
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = +el.dataset.id;
  switch (el.dataset.act) {
    case 'go': go(el.dataset.page); break;
    case 'menu': $('#profileMenu').hidden = !$('#profileMenu').hidden; break;
    case 'signout': signOut(); break;
    case 'play': openLightbox(0, true); break;
    case 'info': openMemory(id); break;
    case 'closeModal': closeModal(); break;
    case 'delMemory': deleteMemory(id); break;
    case 'photo': openLightbox(+el.dataset.i); break;
    case 'lbPrev': clearInterval(lb.timer); stepLightbox(-1); break;
    case 'lbNext': clearInterval(lb.timer); stepLightbox(1); break;
    case 'lbDelete': deletePhoto(); break;
    case 'closeLightbox': closeLightbox(); break;
    case 'uploadToggle': $('#uploadForm').hidden = !$('#uploadForm').hidden; break;
    case 'toggle': toggleBucket(id); break;
    case 'delBucket': e.stopPropagation(); deleteBucket(id); break;
  }
});

$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

document.addEventListener('keydown', e => {
  if (!$('#lightbox').hidden) {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') { clearInterval(lb.timer); stepLightbox(-1); }
    if (e.key === 'ArrowRight') { clearInterval(lb.timer); stepLightbox(1); }
  } else if (!$('#modal').hidden && e.key === 'Escape') closeModal();
  else if (e.key === 'Enter' && e.target.classList.contains('episode')) openMemory(+e.target.dataset.id);
});

// ------------------------------------------------- pixel night scene ---

let nightRaf = null;

function stopNight() {
  if (nightRaf) cancelAnimationFrame(nightRaf);
  nightRaf = null;
}

function startNight() {
  stopNight();
  const canvas = $('#nightCanvas');
  const PX = 4, CW = Math.floor((canvas.parentElement.clientWidth || 640) / PX), CH = Math.floor(Math.min(480, CW * PX * .6) / PX);
  canvas.width = CW * PX; canvas.height = CH * PX;
  const ctx = canvas.getContext('2d'), buf = new Uint8ClampedArray(CW * CH * 4), off = document.createElement('canvas');
  off.width = CW; off.height = CH;
  const octx = off.getContext('2d');
  const sp = (x, y, r, g, b, a = 255) => { if (x < 0 || x >= CW || y < 0 || y >= CH) return; const i = (y * CW + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; };
  const rect = (x, y, w, h, c) => { for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) sp(x + dx, y + dy, c[0], c[1], c[2]); };
  const circ = (cx, cy, r, c) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) sp(cx + dx, cy + dy, c[0], c[1], c[2]); };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const C = { skyT: [4, 3, 18], skyM: [10, 7, 35], skyH: [25, 14, 55], seaD: [6, 18, 48], seaM: [10, 28, 70], seaL: [16, 42, 95], foam: [160, 185, 210], rkD: [22, 18, 16], rkM: [42, 34, 30], rkL: [68, 56, 50], rkT: [85, 70, 62], sand: [105, 88, 68], skin: [205, 158, 118], blk: [18, 16, 20], blkL: [35, 32, 40], hair: [15, 10, 12], moon: [210, 218, 255], star: [255, 252, 235] };
  const HOR = Math.floor(CH * .44), RKT = Math.floor(CH * .56), RKB = Math.floor(CH * .70);
  const stars = Array.from({ length: 140 }, () => ({ x: Math.floor(Math.random() * CW), y: Math.floor(Math.random() * (HOR - 2)), b: .3 + Math.random() * .7, sp: .4 + Math.random() * 1.8, ph: Math.random() * Math.PI * 2, big: Math.random() < .12 }));
  const MX = Math.floor(CW * .74), MY = Math.floor(CH * .12), MR = 4;
  const waves = [{ by: HOR + 1, amp: 1, sp: .9, ph: 0, col: C.seaM }, { by: HOR + 5, amp: 1, sp: 1.1, ph: 1.2, col: C.seaM }, { by: HOR + 9, amp: 2, sp: .7, ph: 2.4, col: C.seaL }, { by: HOR + 14, amp: 1, sp: 1.3, ph: .8, col: C.seaL }, { by: RKB - 4, amp: 1, sp: 1.6, ph: 1, col: C.foam }];
  const rkTop = x => RKT + Math.floor(Math.sin(x * .18) * 1.5 + Math.sin(x * .37) + Math.sin(x * .07) * 2);

  function draw(t) {
    for (let y = 0; y < HOR; y++) { const tf = y / HOR; const col = tf < .5 ? lerp(C.skyT, C.skyM, tf * 2) : lerp(C.skyM, C.skyH, (tf - .5) * 2); for (let x = 0; x < CW; x++) sp(x, y, col[0], col[1], col[2]); }
    for (const s of stars) { const a = Math.floor(s.b * (.45 + .55 * Math.sin(t * s.sp + s.ph)) * 255); sp(s.x, s.y, ...C.star, a); if (s.big) { sp(s.x + 1, s.y, ...C.star, Math.floor(a * .4)); sp(s.x, s.y - 1, ...C.star, Math.floor(a * .4)); } }
    circ(MX, MY, MR, C.moon);
    for (let y = HOR; y < RKB; y++) { const col = lerp(C.seaM, C.seaD, (y - HOR) / (RKB - HOR)); for (let x = 0; x < CW; x++) sp(x, y, col[0], col[1], col[2]); }
    for (let ry = HOR; ry < HOR + 20; ry++) { const alpha = 1 - (ry - HOR) / 20; const wb = Math.floor(Math.sin(ry * .8 + t * 1.2) * 1.5); const rw = Math.floor(alpha * 3) + 1; for (let dx = -rw; dx <= rw; dx++) { const v = Math.floor(alpha * 140); sp(MX + wb + dx, ry, v + 40, v + 45, v + 80); } }
    for (const w of waves) for (let x = 0; x < CW; x++) { const wy = w.by + Math.floor(Math.sin(x * .2 - t * w.sp + w.ph) * w.amp); sp(x, wy, ...w.col); sp(x, wy + 1, ...w.col, 160); }
    for (let x = 0; x < CW; x++) { const top = rkTop(x); for (let y = top; y < RKB; y++) { const noise = Math.sin(x * 2.1 + y * 3.7) * .12 + Math.sin(x * .9 - y * 1.4) * .08; const col = lerp(C.rkM, C.rkD, (y - top) / (RKB - top) + noise); sp(x, y, Math.max(0, Math.round(col[0])), Math.max(0, Math.round(col[1])), Math.max(0, Math.round(col[2]))); } sp(x, top, ...C.rkT); sp(x, top + 1, ...C.rkL); }
    for (let y = RKB; y < CH; y++) { const col = lerp(C.sand, [125, 106, 84], (y - RKB) / (CH - RKB) * .4); for (let x = 0; x < CW; x++) { const n = Math.sin(x * 1.1 + y * .8) * 4; sp(x, y, Math.round(col[0] + n), Math.round(col[1] + n * .8), Math.round(col[2] + n * .6)); } }
    // Two figures sitting on the rocks
    const FX = Math.floor(CW * .44), FY = rkTop(FX) - 1;
    rect(FX - 3, FY, 3, 5, C.blk); rect(FX, FY, 3, 5, C.blk); rect(FX - 4, FY + 5, 3, 3, C.blk); rect(FX + 1, FY + 5, 3, 3, C.blk);
    rect(FX - 5, FY + 8, 4, 2, [28, 24, 30]); rect(FX + 1, FY + 8, 4, 2, [28, 24, 30]);
    rect(FX - 4, FY - 11, 9, 11, C.blk); rect(FX - 2, FY - 5, 5, 1, C.blkL);
    rect(FX - 6, FY - 10, 3, 7, C.blk); rect(FX + 4, FY - 10, 3, 6, C.blk); rect(FX + 4, FY - 4, 2, 3, C.blk);
    rect(FX - 1, FY - 13, 3, 3, C.skin); circ(FX, FY - 17, 4, C.skin);
    rect(FX - 3, FY - 21, 8, 4, C.hair); rect(FX - 4, FY - 19, 2, 3, C.hair); rect(FX + 3, FY - 19, 2, 3, C.hair);
    sp(FX - 1, FY - 17, 60, 40, 30); sp(FX + 2, FY - 17, 60, 40, 30);
    const VX = FX + 5, VY = FY + 1;
    rect(VX - 1, VY, 5, 4, C.blk); rect(VX, VY + 4, 4, 3, C.blk); rect(VX - 1, VY + 7, 3, 2, [28, 24, 30]);
    rect(VX - 2, VY - 9, 7, 9, C.blk); rect(VX, VY - 4, 3, 1, C.blkL);
    rect(VX - 4, VY - 8, 3, 5, C.blk); rect(VX + 5, VY - 7, 2, 4, C.blk);
    rect(VX + 1, VY - 11, 2, 3, C.skin); circ(FX + 4, FY - 16, 3, C.skin);
    rect(FX + 1, FY - 19, 6, 3, C.hair); rect(FX + 1, FY - 18, 2, 8, C.hair); rect(FX + 5, FY - 18, 2, 7, C.hair); rect(FX + 6, FY - 16, 2, 5, C.hair);
    sp(FX + 3, FY - 17, 60, 40, 35);
    rect(FX + 4, FY - 8, 2, 5, C.blk); rect(FX + 2, FY - 4, 4, 2, C.blk);
    // Soft moonlit glow around them
    for (let dy = -22; dy <= 12; dy++) for (let dx = -10; dx <= 12; dx++) { const d = Math.hypot(dx, dy); if (d > 14 && d < 22) { const aa = Math.floor((1 - (d - 14) / 8) * 18); const ix = ((FY + dy) * CW + (FX + dx)) * 4; if (ix >= 0 && ix < buf.length - 3) { buf[ix] = Math.min(255, buf[ix] + 8); buf[ix + 1] = Math.min(255, buf[ix + 1] + 8); buf[ix + 2] = Math.min(255, buf[ix + 2] + 20); buf[ix + 3] = Math.min(255, buf[ix + 3] + aa); } } }
    const id = octx.createImageData(CW, CH); id.data.set(buf); octx.putImageData(id, 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  let t0 = null;
  const loop = ts => { t0 ??= ts; buf.fill(0); draw((ts - t0) / 1000); nightRaf = requestAnimationFrame(loop); };
  nightRaf = requestAnimationFrame(loop);
}

boot();
