const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'owner123';
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const sessions = new Map();

function makeInitialData() {
  return {
    owner: {
      username: 'owner',
      passwordHash: crypto.createHash('sha256').update(OWNER_PASSWORD).digest('hex')
    },
    products: [
      { id: 1, name: 'Garam Masala', price: 120, description: 'Aromatic blend for curries and sabzi.' },
      { id: 2, name: 'Turmeric Powder', price: 80, description: 'Pure haldi powder with vibrant color.' },
      { id: 3, name: 'Red Chilli Powder', price: 95, description: 'Spicy lal mirch for rich flavor.' }
    ],
    orders: [],
    lastProductId: 3,
    lastOrderId: 0
  };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const data = makeInitialData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return data;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

let data = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, chunk) => {
    const [k, ...rest] = chunk.trim().split('=');
    if (!k) return acc;
    acc[k] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.sid;
  if (!sid) return null;
  return sessions.get(sid) || null;
}

function createSession(ownerUser) {
  const sid = crypto.randomBytes(24).toString('hex');
  const session = { username: ownerUser.username, role: 'owner' };
  sessions.set(sid, session);
  return { sid, session };
}

function sendJson(res, code, payload, cookies = []) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookies.length) headers['Set-Cookie'] = cookies;
  res.writeHead(code, headers);
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  const filePath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(filePath).replace(/^\/+/, '');
  const finalPath = path.join(PUBLIC_DIR, safePath);
  if (!finalPath.startsWith(PUBLIC_DIR) || !fs.existsSync(finalPath) || fs.statSync(finalPath).isDirectory()) {
    return false;
  }
  const ext = path.extname(finalPath);
  const contentType = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8'
  }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(finalPath).pipe(res);
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function requireOwner(req, res) {
  const session = getSession(req);
  if (!session || session.role !== 'owner') {
    sendJson(res, 401, { error: 'Owner access required.' });
    return null;
  }
  return session;
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = urlObj;

  try {
    if (req.method === 'GET' && pathname === '/api/products') {
      return sendJson(res, 200, data.products.slice().sort((a, b) => b.id - a.id));
    }

    if (req.method === 'POST' && pathname === '/api/orders') {
      const body = await readBody(req);
      const { customerName, phone, address, productId, quantity } = body;
      if (!customerName || !phone || !address || !productId || !quantity) {
        return sendJson(res, 400, { error: 'Please provide all order details.' });
      }
      const product = data.products.find((p) => p.id === Number(productId));
      if (!product) return sendJson(res, 404, { error: 'Product not found.' });
      data.lastOrderId += 1;
      data.orders.push({
        id: data.lastOrderId,
        customer_name: customerName,
        phone,
        address,
        product_id: Number(productId),
        quantity: Number(quantity),
        status: 'pending',
        created_at: new Date().toISOString()
      });
      saveData();
      return sendJson(res, 201, { message: 'Order placed successfully.' });
    }

    if (req.method === 'POST' && pathname === '/api/login') {
      const body = await readBody(req);
      const attemptedHash = crypto.createHash('sha256').update(String(body.password || '')).digest('hex');
      if (body.username !== data.owner.username || attemptedHash !== data.owner.passwordHash) {
        return sendJson(res, 401, { error: 'Invalid credentials.' });
      }
      const { sid, session } = createSession(data.owner);
      return sendJson(res, 200, { message: 'Logged in.', role: 'owner' }, [`sid=${sid}; HttpOnly; Path=/; SameSite=Lax`]);
    }

    if (req.method === 'POST' && pathname === '/api/logout') {
      const cookies = parseCookies(req.headers.cookie);
      if (cookies.sid) sessions.delete(cookies.sid);
      return sendJson(res, 200, { message: 'Logged out.' }, ['sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax']);
    }

    if (req.method === 'GET' && pathname === '/api/me') {
      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: 'Not authenticated.' });
      return sendJson(res, 200, session);
    }

    if (req.method === 'POST' && pathname === '/api/admin/products') {
      if (!requireOwner(req, res)) return;
      const body = await readBody(req);
      if (!body.name || !body.price || !body.description) {
        return sendJson(res, 400, { error: 'All fields are required.' });
      }
      data.lastProductId += 1;
      data.products.push({
        id: data.lastProductId,
        name: body.name,
        price: Number(body.price),
        description: body.description
      });
      saveData();
      return sendJson(res, 201, { message: 'Product added.' });
    }

    if (req.method === 'PUT' && pathname.startsWith('/api/admin/products/')) {
      if (!requireOwner(req, res)) return;
      const id = Number(pathname.split('/').pop());
      const body = await readBody(req);
      const product = data.products.find((p) => p.id === id);
      if (!product) return sendJson(res, 404, { error: 'Product not found.' });
      product.name = body.name;
      product.price = Number(body.price);
      product.description = body.description;
      saveData();
      return sendJson(res, 200, { message: 'Product updated.' });
    }

    if (req.method === 'DELETE' && pathname.startsWith('/api/admin/products/')) {
      if (!requireOwner(req, res)) return;
      const id = Number(pathname.split('/').pop());
      const before = data.products.length;
      data.products = data.products.filter((p) => p.id !== id);
      if (data.products.length === before) return sendJson(res, 404, { error: 'Product not found.' });
      saveData();
      return sendJson(res, 200, { message: 'Product deleted.' });
    }

    if (req.method === 'GET' && pathname === '/api/admin/orders') {
      if (!requireOwner(req, res)) return;
      const orders = data.orders
        .map((o) => ({ ...o, product_name: data.products.find((p) => p.id === o.product_id)?.name || 'Deleted Product' }))
        .sort((a, b) => b.id - a.id);
      return sendJson(res, 200, orders);
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/status')) {
      if (!requireOwner(req, res)) return;
      const id = Number(pathname.split('/')[4]);
      const body = await readBody(req);
      if (!['pending', 'packed', 'shipped', 'delivered'].includes(body.status)) {
        return sendJson(res, 400, { error: 'Invalid status.' });
      }
      const order = data.orders.find((o) => o.id === id);
      if (!order) return sendJson(res, 404, { error: 'Order not found.' });
      order.status = body.status;
      saveData();
      return sendJson(res, 200, { message: 'Order status updated.' });
    }

    if (serveStatic(req, res)) return;
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Masale Market running on http://localhost:${PORT}`);
  });
}

module.exports = server;
