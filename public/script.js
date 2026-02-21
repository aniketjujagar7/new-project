const statusEl = document.getElementById('status');
const productsEl = document.getElementById('products');
const productSelect = document.getElementById('productSelect');
const adminPanel = document.getElementById('adminPanel');
const adminProducts = document.getElementById('adminProducts');
const ordersEl = document.getElementById('orders');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? 'crimson' : 'green';
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}

async function loadProducts() {
  const products = await api('/api/products');
  productsEl.innerHTML = '';
  productSelect.innerHTML = '';
  adminProducts.innerHTML = '';

  for (const p of products) {
    const card = document.createElement('div');
    card.className = 'item';
    card.innerHTML = `<h4>${p.name}</h4><p>₹${p.price.toFixed(2)}</p><p>${p.description}</p>`;
    productsEl.appendChild(card);

    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = `${p.name} - ₹${p.price.toFixed(2)}`;
    productSelect.appendChild(option);

    const adminItem = document.createElement('div');
    adminItem.className = 'item';
    adminItem.innerHTML = `
      <strong>${p.name}</strong> - ₹${p.price.toFixed(2)}
      <p>${p.description}</p>
      <button data-edit="${p.id}">Quick Update Price +10</button>
      <button data-delete="${p.id}">Delete</button>
    `;
    adminProducts.appendChild(adminItem);
  }
}

async function loadOrders() {
  const orders = await api('/api/admin/orders');
  ordersEl.innerHTML = '';
  for (const o of orders) {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `
      <strong>Order #${o.id}</strong> - ${o.customer_name}<br/>
      Product: ${o.product_name} x ${o.quantity}<br/>
      Address: ${o.address}<br/>
      Status: <b>${o.status}</b>
      <select data-status-id="${o.id}">
        <option>pending</option>
        <option>packed</option>
        <option>shipped</option>
        <option>delivered</option>
      </select>
    `;
    item.querySelector('select').value = o.status;
    ordersEl.appendChild(item);
  }
}

async function checkOwner() {
  try {
    const me = await api('/api/me');
    if (me.role === 'owner') {
      adminPanel.classList.remove('hidden');
      await loadOrders();
    }
  } catch {
    adminPanel.classList.add('hidden');
  }
}

document.getElementById('orderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    e.target.reset();
    setStatus('Order placed successfully!');
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    setStatus('Owner logged in. Full control unlocked.');
    await checkOwner();
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  adminPanel.classList.add('hidden');
  setStatus('Logged out.');
});

document.getElementById('addProductForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    await api('/api/admin/products', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    e.target.reset();
    setStatus('Product added.');
    await loadProducts();
  } catch (error) {
    setStatus(error.message, true);
  }
});

adminProducts.addEventListener('click', async (e) => {
  const deleteId = e.target.getAttribute('data-delete');
  const editId = e.target.getAttribute('data-edit');
  try {
    if (deleteId) {
      await api(`/api/admin/products/${deleteId}`, { method: 'DELETE' });
      setStatus('Product deleted.');
    }
    if (editId) {
      const products = await api('/api/products');
      const product = products.find((p) => p.id === Number(editId));
      if (!product) return;
      await api(`/api/admin/products/${editId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: product.name,
          description: product.description,
          price: Number(product.price) + 10
        })
      });
      setStatus('Product price updated +10.');
    }
    await loadProducts();
  } catch (error) {
    setStatus(error.message, true);
  }
});

ordersEl.addEventListener('change', async (e) => {
  const id = e.target.getAttribute('data-status-id');
  if (!id) return;
  try {
    await api(`/api/admin/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: e.target.value })
    });
    setStatus(`Order #${id} updated.`);
  } catch (error) {
    setStatus(error.message, true);
  }
});

loadProducts().then(checkOwner).catch((error) => setStatus(error.message, true));
