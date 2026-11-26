const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const root = path.join(__dirname, '..');
let baseUrl;
let databaseDir;
let server;
let serverOutput = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address();
      listener.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function call(endpoint, { method = 'GET', token, json, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  return fetch(`${baseUrl}${endpoint}`, { method, headers, body });
}

async function responseJson(response) {
  return response.json();
}

before(async () => {
  databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secondhand-rsu-test-'));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: {
      ...process.env,
      DB_PATH: path.join(databaseDir, 'test.db'),
      JWT_SECRET: 'integration-test-secret-only',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (data) => { serverOutput += data; });
  server.stderr.on('data', (data) => { serverOutput += data; });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Server exited during startup:\n${serverOutput}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch { /* Retry until the server is listening. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start in time:\n${serverOutput}`);
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
  if (databaseDir) fs.rmSync(databaseDir, { recursive: true, force: true });
});

test('registration, listings, chat, admin actions, categories, and uploads work end to end', async () => {
  const home = await fetch(baseUrl);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Secondhand RSU/);
  const myProductsPage = await fetch(`${baseUrl}/my-products.html`);
  assert.equal(myProductsPage.status, 200);
  assert.match(await myProductsPage.text(), /api\('\/products\/mine'\)/);
  const adminPage = await fetch(`${baseUrl}/admin.html`);
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /api\('\/admin\/products'\)/);
  const chatPage = await fetch(`${baseUrl}/chat.html`);
  assert.equal(chatPage.status, 200);
  assert.match(await chatPage.text(), /api\('\/chats'\)/);

  const categoriesResponse = await call('/api/products/categories');
  assert.equal(categoriesResponse.status, 200);
  const categories = await responseJson(categoriesResponse);
  assert.equal(categories.length, 4);

  assert.equal((await call('/api/admin/stats')).status, 401);
  assert.equal((await call('/api/chats')).status, 401);
  const invalidDomain = await call('/api/auth/register', {
    method: 'POST',
    json: { name: 'External User', email: 'person@example.test', password: 'passphrase123', phone: '0800000000' },
  });
  assert.equal(invalidDomain.status, 400);
  assert.match((await responseJson(invalidDomain)).message, /@rsu\.ac\.th/);
  const missingPhone = await call('/api/auth/register', {
    method: 'POST',
    json: { name: 'No Phone', email: 'no-phone@rsu.ac.th', password: 'passphrase123' },
  });
  assert.equal(missingPhone.status, 400);
  const invalidPhone = await call('/api/auth/register', {
    method: 'POST',
    json: { name: 'Bad Phone', email: 'bad-phone@rsu.ac.th', password: 'passphrase123', phone: '12345' },
  });
  assert.equal(invalidPhone.status, 400);

  const registration = await call('/api/auth/register', {
    method: 'POST',
    json: {
      name: 'Test Seller',
      email: 'seller@rsu.ac.th',
      password: 'passphrase123',
      phone: '081-234-5678',
      phone_public: true,
    },
  });
  assert.equal(registration.status, 201);
  const registeredUser = await responseJson(registration);
  assert.equal(registeredUser.user.role, 'User');
  const sellerToken = registeredUser.token;
  const sellerProfile = await responseJson(await call('/api/auth/me', { token: sellerToken }));
  assert.equal(sellerProfile.phone, '0812345678');
  assert.equal(sellerProfile.phone_public, 1);

  const buyerRegistration = await call('/api/auth/register', {
    method: 'POST',
    json: {
      name: 'Test Buyer',
      email: 'buyer@rsu.ac.th',
      password: 'passphrase456',
      phone: '089 123 4567',
    },
  });
  assert.equal(buyerRegistration.status, 201);
  const buyer = await responseJson(buyerRegistration);
  const buyerToken = buyer.token;
  const buyerProfile = await responseJson(await call('/api/auth/me', { token: buyerToken }));
  assert.equal(buyerProfile.phone, '0891234567');
  assert.equal(buyerProfile.phone_public, 0);

  const userLogin = await call('/api/auth/login', {
    method: 'POST',
    json: { email: 'seller@rsu.ac.th', password: 'passphrase123' },
  });
  assert.equal(userLogin.status, 200);
  const userLoginBody = await responseJson(userLogin);
  assert.equal(userLoginBody.user.role, 'User');
  const userToken = userLoginBody.token;

  const userAdminAccess = await call('/api/admin/stats', { token: userToken });
  assert.equal(userAdminAccess.status, 403);
  assert.equal((await call('/api/admin/products', { token: userToken })).status, 403);

  const login = await call('/api/auth/login', {
    method: 'POST',
    json: { email: 'admin@rsu.ac.th', password: 'Admin@1234' },
  });
  assert.equal(login.status, 200);
  const adminToken = (await responseJson(login)).token;
  const stats = await call('/api/admin/stats', { token: adminToken });
  assert.equal(stats.status, 200);
  assert.equal((await responseJson(stats)).active_users, 2);

  const createProduct = await call('/api/products', {
    method: 'POST',
    token: userToken,
    json: { title: 'Test book', price: 45, description: 'Integration test', category_id: 1, contact_phone: 'LINE test-seller' },
  });
  assert.equal(createProduct.status, 201);
  const productId = (await responseJson(createProduct)).product_id;

  const mine = await call('/api/products/mine', { token: userToken });
  const mineProducts = await responseJson(mine);
  assert.equal(mineProducts.length, 1);
  assert.equal(mineProducts[0].is_approved, 0);
  assert.equal(mineProducts[0].contact_phone, 'LINE test-seller');
  assert.equal((await responseJson(await call('/api/products'))).length, 0);
  assert.equal((await call(`/api/products/${productId}`)).status, 404);

  const pending = await call('/api/admin/products', { token: adminToken });
  assert.equal(pending.status, 200);
  assert.equal((await responseJson(pending))[0].is_approved, 0);

  const invalidUpdate = await call(`/api/products/${productId}`, {
    method: 'PUT',
    token: userToken,
    json: { title: '  ', price: -1 },
  });
  assert.equal(invalidUpdate.status, 400);

  const update = await call(`/api/products/${productId}`, {
    method: 'PUT',
    token: userToken,
    json: { title: 'Updated test book', price: 50 },
  });
  assert.equal(update.status, 200);

  const otherRegistration = await call('/api/auth/register', {
    method: 'POST',
    json: { name: 'Other User', email: 'other@rsu.ac.th', password: 'passphrase789', phone: '082-234-5678' },
  });
  const otherToken = (await responseJson(otherRegistration)).token;
  assert.equal((await call(`/api/products/${productId}/status`, {
    method: 'PATCH',
    token: otherToken,
    json: { status: 'Sold' },
  })).status, 403);

  const pendingChat = await call('/api/chats', {
    method: 'POST',
    token: buyerToken,
    json: { product_id: productId },
  });
  assert.equal(pendingChat.status, 404);
  const approve = await call(`/api/admin/products/${productId}/approve`, {
    method: 'PATCH',
    token: adminToken,
  });
  assert.equal(approve.status, 200);
  const listedProducts = await responseJson(await call('/api/products'));
  assert.equal(listedProducts.length, 1);
  assert.equal(listedProducts[0].title, 'Updated test book');
  assert.equal(listedProducts[0].status, 'Available');
  assert.equal(listedProducts[0].contact_phone, 'LINE test-seller');
  assert.equal(listedProducts[0].seller_phone, '0812345678');
  assert.equal((await responseJson(await call('/api/products?q=Updated&category=1'))).length, 1);
  assert.equal((await responseJson(await call('/api/products?category=2'))).length, 0);

  assert.equal((await call('/api/auth/phone-visibility', {
    method: 'PATCH',
    token: userToken,
    json: { phone_public: 'yes' },
  })).status, 400);
  const hiddenPhone = await call('/api/auth/phone-visibility', {
    method: 'PATCH',
    token: userToken,
    json: { phone_public: false },
  });
  assert.equal(hiddenPhone.status, 200);
  assert.equal((await responseJson(await call('/api/products?q=Updated')))[0].seller_phone, null);
  assert.equal((await call('/api/auth/phone-visibility', {
    method: 'PATCH',
    token: userToken,
    json: { phone_public: true },
  })).status, 200);

  const openedChat = await call('/api/chats', {
    method: 'POST',
    token: buyerToken,
    json: { product_id: productId },
  });
  assert.equal(openedChat.status, 201);
  const conversation = await responseJson(openedChat);
  const outsiderChats = await call('/api/chats', { token: otherToken });
  assert.equal(outsiderChats.status, 200);
  assert.deepEqual(await responseJson(outsiderChats), []);
  assert.equal((await call('/api/chats', {
    method: 'POST',
    token: userToken,
    json: { product_id: productId },
  })).status, 403);
  const repeatedOpen = await call('/api/chats', {
    method: 'POST',
    token: buyerToken,
    json: { product_id: productId },
  });
  assert.equal(repeatedOpen.status, 200);
  assert.equal((await responseJson(repeatedOpen)).conversation_id, conversation.conversation_id);
  assert.equal((await call(`/api/chats/${conversation.conversation_id}/messages`, { token: otherToken })).status, 404);
  assert.equal((await call(`/api/chats/${conversation.conversation_id}/messages`, {
    method: 'POST',
    token: otherToken,
    json: { body: 'ข้อความจากผู้ไม่มีสิทธิ์' },
  })).status, 404);

  const firstMessage = await call(`/api/chats/${conversation.conversation_id}/messages`, {
    method: 'POST',
    token: buyerToken,
    json: { body: 'สวัสดีครับ สินค้ายังอยู่ไหมครับ?' },
  });
  assert.equal(firstMessage.status, 201);
  const sellerChats = await responseJson(await call('/api/chats', { token: userToken }));
  assert.equal(sellerChats[0].unread_count, 1);
  const sellerReads = await responseJson(await call(`/api/chats/${conversation.conversation_id}/messages`, { token: userToken }));
  assert.equal(sellerReads.messages.length, 1);
  assert.ok(sellerReads.messages[0].read_at);
  const sellerReply = await call(`/api/chats/${conversation.conversation_id}/messages`, {
    method: 'POST',
    token: userToken,
    json: { body: 'ยังอยู่ครับ นัดรับที่มหาวิทยาลัยได้เลยครับ' },
  });
  assert.equal(sellerReply.status, 201);
  const buyerChats = await responseJson(await call('/api/chats', { token: buyerToken }));
  assert.equal(buyerChats[0].unread_count, 1);
  const buyerReads = await responseJson(await call(`/api/chats/${conversation.conversation_id}/messages`, { token: buyerToken }));
  assert.equal(buyerReads.messages.length, 2);
  assert.equal(buyerReads.messages[0].is_mine, 1);
  assert.ok(buyerReads.messages[0].read_at);
  assert.equal(buyerReads.messages[1].is_mine, 0);
  assert.ok(buyerReads.messages[1].read_at);

  const privateProduct = await call('/api/products', {
    method: 'POST',
    token: otherToken,
    json: { title: 'Private phone listing', price: 75, category_id: 1 },
  });
  assert.equal(privateProduct.status, 201);
  const privateProductId = (await responseJson(privateProduct)).product_id;
  assert.equal((await call(`/api/admin/products/${privateProductId}/approve`, {
    method: 'PATCH',
    token: adminToken,
  })).status, 200);
  const privateListing = (await responseJson(await call('/api/products'))).find((item) => item.product_id === privateProductId);
  assert.equal(privateListing.seller_phone, null);

  const setStatus = await call(`/api/products/${productId}/status`, {
    method: 'PATCH',
    token: userToken,
    json: { status: 'Sold' },
  });
  assert.equal(setStatus.status, 200);
  assert.equal((await responseJson(setStatus)).status, 'Sold');
  const soldListing = await responseJson(await call('/api/products?q=Updated'));
  assert.equal(soldListing[0].status, 'Sold');

  const adminStatus = await call(`/api/admin/products/${productId}/status`, {
    method: 'PATCH',
    token: adminToken,
  });
  assert.equal(adminStatus.status, 200);
  assert.equal((await responseJson(adminStatus)).status, 'Available');

  const upload = new FormData();
  upload.set('title', 'Test image');
  upload.set('price', '10');
  upload.set('category_id', '1');
  upload.set('image', new Blob([Buffer.from([137, 80, 78, 71])], { type: 'image/png' }), 'test.png');
  const uploaded = await call('/api/products', { method: 'POST', token: userToken, body: upload });
  assert.equal(uploaded.status, 201);
  const uploadedProductId = (await responseJson(uploaded)).product_id;
  const uploadedMine = await responseJson(await call('/api/products/mine', { token: userToken }));
  const imageUrl = uploadedMine.find((product) => product.product_id === uploadedProductId).image_url;
  const imagePath = path.join(root, 'public', imageUrl.replace(/^\/+/, ''));
  assert.ok(fs.existsSync(imagePath));

  const invalidUpload = new FormData();
  invalidUpload.set('title', 'Invalid image');
  invalidUpload.set('price', '10');
  invalidUpload.set('category_id', '1');
  invalidUpload.set('image', new Blob(['not an image'], { type: 'text/plain' }), 'test.txt');
  assert.equal((await call('/api/products', { method: 'POST', token: userToken, body: invalidUpload })).status, 400);

  const oversizedUpload = new FormData();
  oversizedUpload.set('title', 'Oversized image');
  oversizedUpload.set('price', '10');
  oversizedUpload.set('category_id', '1');
  oversizedUpload.set('image', new Blob([Buffer.alloc(3 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
  assert.equal((await call('/api/products', { method: 'POST', token: userToken, body: oversizedUpload })).status, 413);

  const category = await call('/api/admin/categories', {
    method: 'POST',
    token: adminToken,
    json: { category_name: 'Integration category' },
  });
  assert.equal(category.status, 201);
  const categoryId = (await responseJson(category)).category_id;
  const visibleCategories = await responseJson(await call('/api/products/categories'));
  assert.ok(visibleCategories.some((item) => item.category_id === categoryId));
  assert.equal((await call(`/api/admin/categories/${categoryId}`, {
    method: 'PUT',
    token: adminToken,
    json: { category_name: 'Updated integration category' },
  })).status, 200);
  assert.equal((await call(`/api/admin/categories/${categoryId}`, {
    method: 'DELETE',
    token: adminToken,
  })).status, 200);

  assert.equal((await call(`/api/products/${productId}`, { method: 'DELETE', token: userToken })).status, 200);
  assert.equal((await call(`/api/admin/products/${uploadedProductId}`, {
    method: 'DELETE',
    token: adminToken,
  })).status, 200);
  assert.equal(fs.existsSync(imagePath), false);
  assert.equal((await call(`/api/products/${uploadedProductId}`)).status, 404);
});
