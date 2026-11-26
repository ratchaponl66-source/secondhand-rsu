// public/js/app.js - ตัวช่วยที่ใช้ร่วมกันทุกหน้า (API, Auth, Navbar, Toast)
const store = {
  get token() { return localStorage.getItem('rsu_token'); },
  get user() { try { return JSON.parse(localStorage.getItem('rsu_user')); } catch { return null; } },
  save(token, user) { localStorage.setItem('rsu_token', token); localStorage.setItem('rsu_user', JSON.stringify(user)); },
  clear() { localStorage.removeItem('rsu_token'); localStorage.removeItem('rsu_user'); },
};

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  if (store.token) headers.Authorization = 'Bearer ' + store.token;
  const res = await fetch('/api' + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'เกิดข้อผิดพลาด'), { status: res.status });
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baht = (n) => Number(n).toLocaleString('th-TH') + ' บาท';
const CAT_ICON = { 'หนังสือ': '📚', 'อุปกรณ์ IT': '💻', 'เสื้อผ้า': '👕', 'ของใช้หอพัก': '🛏️' };

// รูปแทนเมื่อสินค้าไม่มีรูป
function placeholder(cat) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#F2F0EA"/><circle cx="330" cy="40" r="120" fill="#DEC6B9" opacity=".55"/><text x="200" y="175" font-size="84" text-anchor="middle">${CAT_ICON[cat] || '🛍️'}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${type === 'err' ? 'bg-rsu-700' : 'bg-ink-900'}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Navbar กลาง: renderNav({ search: true }) จะแสดงช่องค้นหาด้วย
function renderNav({ search = false } = {}) {
  const u = store.user;
  const links = u
    ? `<span class="hidden sm:inline text-sm text-ink-700">สวัสดี ${esc(u.name)}</span>
       <a href="/my-products.html" class="text-sm font-medium text-rsu-700 hover:underline">ประกาศของฉัน</a>
       <a href="/chat.html" class="text-sm font-medium text-rsu-700 hover:underline">แชท</a>
       ${u.role === 'Admin' ? '<a href="/admin.html" class="text-sm font-medium text-rsu-700 hover:underline">จัดการระบบ</a>' : ''}
       <button id="logoutBtn" class="rounded-lg border border-ink-100 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50">ออกจากระบบ</button>`
    : `<a href="/login.html" class="rounded-lg border border-rsu-600 px-4 py-2 text-sm font-medium text-rsu-600 hover:bg-rsu-50">เข้าสู่ระบบ</a>`;
  document.getElementById('nav').innerHTML = `
  <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
    <a href="/" class="flex items-center gap-2 font-display text-xl text-rsu-600">
      <span class="grid h-9 w-9 place-items-center rounded-lg bg-rsu-600 text-white">S</span>
      <span>Secondhand <span class="text-ink-700">RSU</span></span>
    </a>
    ${search ? `<div class="order-last w-full md:order-none md:w-auto md:flex-1 md:max-w-md">
      <input id="q" type="search" placeholder="ค้นหาสินค้า เช่น หนังสือ, โน้ตบุ๊ก, พัดลม"
        class="w-full rounded-lg border border-ink-100 bg-ink-50 px-4 py-2 text-sm outline-none focus:border-rsu-400 focus:bg-white focus:ring-2 focus:ring-rsu-100"></div>` : '<div class="flex-1"></div>'}
    <div class="ml-auto flex items-center gap-2">
      <a href="/create-product.html" class="rounded-lg bg-rsu-600 px-4 py-2 text-sm font-medium text-white hover:bg-rsu-700">+ ลงประกาศขาย</a>
      ${links}
    </div>
  </div>`;
  const out = document.getElementById('logoutBtn');
  if (out) out.onclick = () => { store.clear(); location.href = '/'; };
}
