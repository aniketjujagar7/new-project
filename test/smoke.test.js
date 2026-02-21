const test = require('node:test');
const assert = require('node:assert/strict');

const server = require('../server');

let instance;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    instance = server.listen(0, resolve);
  });
  const { port } = instance.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    instance.close((error) => (error ? reject(error) : resolve()));
  });
});

test('public products endpoint works', async () => {
  const response = await fetch(`${baseUrl}/api/products`);
  assert.equal(response.status, 200);
  const products = await response.json();
  assert.ok(Array.isArray(products));
  assert.ok(products.length >= 1);
});

test('owner protected route denies unauthenticated access', async () => {
  const response = await fetch(`${baseUrl}/api/admin/orders`);
  assert.equal(response.status, 401);
});
