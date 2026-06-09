let products = [];
let currentFilter = 'all';
let searchQuery = '';
let currentEditId = null;
let productsUnsubscribe = null;

function getDB() {
  return firebase.firestore();
}

function initApp() {
  firebase.firestore().enableNetwork();
  registerServiceWorker();
  listenToProducts();
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function updateOnlineStatus() {
  const btn = document.getElementById('sync-status');
  if (navigator.onLine) {
    btn.className = 'sync-btn online';
    btn.title = 'En línea';
  } else {
    btn.className = 'sync-btn offline';
    btn.title = 'Sin conexión - los cambios se sincronizarán cuando vuelvas a estar en línea';
  }
}

function listenToProducts() {
  const db = getDB();
  if (!db) return;
  if (productsUnsubscribe) productsUnsubscribe();

  productsUnsubscribe = db.collection('products')
    .orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      products = [];
      snapshot.forEach((doc) => {
        products.push({ id: doc.id, ...doc.data() });
      });
      renderProducts();
    }, (error) => {
      console.error('Error listening to products:', error);
      showToast('Error al cargar productos', 'error');
    });
}

function renderProducts() {
  const container = document.getElementById('product-list');
  let filtered = [...products];

  if (currentFilter !== 'all') {
    filtered = filtered.filter((p) => p.business === currentFilter);
  }

  if (searchQuery.trim()) {
    const q = normalize(searchQuery);
    filtered = filtered.filter((p) => normalize(p.name).includes(q));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>${products.length === 0 ? 'No hay productos aún' : 'No se encontraron productos'}</p>
        <p class="sub">${products.length === 0 ? 'Toca + para agregar tu primer producto' : 'Intenta con otra búsqueda o negocio'}</p>
      </div>`;
    return;
  }

  let html = '';
  filtered.forEach((p) => {
    const price = parseFloat(p.price || 0).toFixed(2);
    const bizName = p.business ? p.business.charAt(0).toUpperCase() + p.business.slice(1) : 'Sin negocio';
    const sizeHtml = p.size ? ` <span style="color:var(--text-muted);font-weight:400;font-size:11px">(${escHtml(p.size)})</span>` : '';
    html += `
      <div class="product-card" data-id="${p.id}">
        <div class="product-info">
          <div class="product-name">${escHtml(p.name)}${sizeHtml}</div>
          <span class="biz-badge ${p.business || ''}">${bizName}</span>
        </div>
        <div class="product-price">$${price}</div>
      </div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.product-card').forEach((card) => {
    card.addEventListener('click', () => {
      openProductModal(card.dataset.id);
    });
  });
}

function openProductModal(id) {
  currentEditId = id || null;
  const title = document.getElementById('modal-title');
  const deleteBtn = document.getElementById('btn-delete-product');
  const form = document.getElementById('product-form');
  form.reset();

  if (id) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    title.textContent = 'Editar Producto';
    document.getElementById('product-id').value = id;
    document.getElementById('product-name').value = product.name || '';
    document.getElementById('product-size').value = product.size || '';
    document.getElementById('product-price').value = product.price || '';
    document.getElementById('product-business').value = product.business || '';
    deleteBtn.classList.remove('hidden');
  } else {
    title.textContent = 'Agregar Producto';
    deleteBtn.classList.add('hidden');
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
}

async function saveProduct(e) {
  e.preventDefault();
  const db = getDB();
  if (!db) return;

  const id = document.getElementById('product-id').value;
  const name = document.getElementById('product-name').value.trim();
  const size = document.getElementById('product-size').value.trim();
  const price = parseFloat(document.getElementById('product-price').value);
  const business = document.getElementById('product-business').value;

  if (!name || isNaN(price) || !business) {
    showToast('Completa todos los campos', 'error');
    return;
  }

  const data = {
    name,
    size: size || '',
    price,
    business,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      await db.collection('products').doc(id).update(data);
      showToast('Producto actualizado', 'success');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('products').add(data);
      showToast('Producto agregado', 'success');
    }
    closeProductModal();
  } catch (err) {
    console.error('Error saving product:', err);
    showToast('Error al guardar el producto', 'error');
  }
}

async function deleteProduct() {
  const db = getDB();
  if (!db) return;
  const id = document.getElementById('product-id').value;
  if (!id) return;

  if (!confirm('¿Eliminar este producto?')) return;

  try {
    await db.collection('products').doc(id).delete();
    showToast('Producto eliminado', 'success');
    closeProductModal();
  } catch (err) {
    console.error('Error deleting product:', err);
    showToast('Error al eliminar', 'error');
  }
}

function closeProductModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('product-form').reset();
  currentEditId = null;
}

function showToast(message, type) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Search
document.getElementById('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  document.getElementById('clear-search').hidden = !searchQuery;
  renderProducts();
});

document.getElementById('clear-search').addEventListener('click', () => {
  document.getElementById('search-input').value = '';
  searchQuery = '';
  document.getElementById('clear-search').hidden = true;
  renderProducts();
});

// Business filters
document.getElementById('business-filters').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  chip.classList.add('active');
  currentFilter = chip.dataset.business;
  renderProducts();
});

// Product Modal
document.getElementById('fab-add').addEventListener('click', () => openProductModal(null));
document.getElementById('modal-close').addEventListener('click', closeProductModal);
document.getElementById('btn-cancel').addEventListener('click', closeProductModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeProductModal();
});

document.getElementById('product-form').addEventListener('submit', saveProduct);
document.getElementById('btn-delete-product').addEventListener('click', deleteProduct);

// Init
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});
