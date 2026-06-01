let products = [];
let categories = [];
let currentFilter = 'all';
let searchQuery = '';
let currentEditId = null;
let currentCategoryEditId = null;
let productsUnsubscribe = null;
let categoriesUnsubscribe = null;

function getDB() {
  return firebase.firestore();
}

function initApp() {
  firebase.firestore().enableNetwork();
  registerServiceWorker();
  listenToProducts();
  listenToCategories();
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

function listenToCategories() {
  const db = getDB();
  if (!db) return;
  if (categoriesUnsubscribe) categoriesUnsubscribe();

  categoriesUnsubscribe = db.collection('categories')
    .orderBy('name', 'asc')
    .onSnapshot((snapshot) => {
      categories = [];
      snapshot.forEach((doc) => {
        categories.push({ id: doc.id, ...doc.data() });
      });
      renderCategories();
      renderCategoryFilters();
      populateCategorySelect();
    }, (error) => {
      console.error('Error listening to categories:', error);
      showToast('Error al cargar categorías', 'error');
    });
}

function renderCategoryFilters() {
  const container = document.getElementById('category-filters');
  let html = '<button class="chip active" data-category="all">Todos</button>';

  categories.forEach((cat) => {
    const active = currentFilter === cat.id ? 'active' : '';
    html += `<button class="chip ${active}" data-category="${cat.id}">${escHtml(cat.name)}</button>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.category;
      renderProducts();
    });
  });
}

function renderProducts() {
  const container = document.getElementById('product-list');
  let filtered = [...products];

  if (currentFilter !== 'all') {
    filtered = filtered.filter((p) => p.categoryId === currentFilter);
  }

  if (searchQuery.trim()) {
    const q = normalize(searchQuery);
    filtered = filtered.filter((p) =>
      normalize(p.name).includes(q) || (p.code && p.code.includes(q))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>${products.length === 0 ? 'No hay productos aún' : 'No se encontraron productos'}</p>
        <p class="sub">${products.length === 0 ? 'Toca + para agregar tu primer producto' : 'Intenta con otra búsqueda o categoría'}</p>
      </div>`;
    return;
  }

  let html = '';
  filtered.forEach((p) => {
    const cat = categories.find((c) => c.id === p.categoryId);
    const catName = cat ? escHtml(cat.name) : 'Sin categoría';
    const price = parseFloat(p.price || 0).toFixed(2);
    const codeStr = p.code ? `<span class="product-code-badge">#${escHtml(p.code)}</span>` : '';
    html += `
      <div class="product-card" data-id="${p.id}">
        <div class="product-info">
          <div class="product-name">${escHtml(p.name)}</div>
          <span class="product-category-badge">${catName}</span> ${codeStr}
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

function renderCategories() {
  const container = document.getElementById('categories-list');

  if (categories.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No hay categorías aún</p>
        <p class="sub">Agrega categorías para organizar tus productos</p>
      </div>`;
    return;
  }

  let html = '';
  categories.forEach((cat) => {
    const count = products.filter((p) => p.categoryId === cat.id).length;
    html += `
      <div class="category-card" data-id="${cat.id}">
        <span class="category-card-name">${escHtml(cat.name)}</span>
        <span class="category-card-count">${count} producto${count !== 1 ? 's' : ''}</span>
      </div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.category-card').forEach((card) => {
    card.addEventListener('click', () => {
      openCategoryModal(card.dataset.id);
    });
  });
}

function populateCategorySelect() {
  const select = document.getElementById('product-category');
  const currentValue = select.value;
  let html = '<option value="">Seleccionar categoría</option>';
  categories.forEach((cat) => {
    const selected = cat.id === currentValue ? 'selected' : '';
    html += `<option value="${cat.id}" ${selected}>${escHtml(cat.name)}</option>`;
  });
  select.innerHTML = html;
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
    document.getElementById('product-price').value = product.price || '';
    document.getElementById('product-category').value = product.categoryId || '';
    document.getElementById('product-code').value = product.code || '';
    deleteBtn.classList.remove('hidden');
  } else {
    title.textContent = 'Agregar Producto';
    deleteBtn.classList.add('hidden');
  }

  populateCategorySelect();
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function openCategoryModal(id) {
  currentCategoryEditId = id || null;
  const title = document.getElementById('category-modal-title');
  const deleteBtn = document.getElementById('btn-delete-category');
  const form = document.getElementById('category-form');
  form.reset();

  if (id) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    title.textContent = 'Editar Categoría';
    document.getElementById('category-id').value = id;
    document.getElementById('category-name').value = cat.name || '';
    deleteBtn.classList.remove('hidden');
  } else {
    title.textContent = 'Agregar Categoría';
    deleteBtn.classList.add('hidden');
  }

  document.getElementById('category-modal-overlay').classList.remove('hidden');
}

async function saveProduct(e) {
  e.preventDefault();
  const db = getDB();
  if (!db) return;

  const id = document.getElementById('product-id').value;
  const name = document.getElementById('product-name').value.trim();
  const price = parseFloat(document.getElementById('product-price').value);
  const categoryId = document.getElementById('product-category').value;
  const code = document.getElementById('product-code').value.trim();

  if (!name || isNaN(price) || !categoryId) {
    showToast('Completa todos los campos', 'error');
    return;
  }

  const data = {
    name,
    price,
    categoryId,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (code) data.code = code;

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

async function saveCategory(e) {
  e.preventDefault();
  const db = getDB();
  if (!db) return;

  const id = document.getElementById('category-id').value;
  const name = document.getElementById('category-name').value.trim();

  if (!name) {
    showToast('Ingresa un nombre para la categoría', 'error');
    return;
  }

  try {
    if (id) {
      await db.collection('categories').doc(id).update({ name });
      showToast('Categoría actualizada', 'success');
    } else {
      await db.collection('categories').add({ name });
      showToast('Categoría agregada', 'success');
    }
    closeCategoryModal();
  } catch (err) {
    console.error('Error saving category:', err);
    showToast('Error al guardar la categoría', 'error');
  }
}

async function deleteCategory() {
  const db = getDB();
  if (!db) return;
  const id = document.getElementById('category-id').value;
  if (!id) return;

  const productsInCategory = products.filter((p) => p.categoryId === id);
  let msg = '¿Eliminar esta categoría?';
  if (productsInCategory.length > 0) {
    msg = `Hay ${productsInCategory.length} producto(s) en esta categoría. ¿Eliminarla de todas formas? (Los productos se quedarán sin categoría)`;
  }

  if (!confirm(msg)) return;

  try {
    await db.collection('categories').doc(id).delete();
    showToast('Categoría eliminada', 'success');
    closeCategoryModal();
  } catch (err) {
    console.error('Error deleting category:', err);
    showToast('Error al eliminar', 'error');
  }
}

function closeProductModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('product-form').reset();
  currentEditId = null;
}

function closeCategoryModal() {
  document.getElementById('category-modal-overlay').classList.add('hidden');
  document.getElementById('category-form').reset();
  currentCategoryEditId = null;
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

// Tab Navigation
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.getElementById(`view-${tab.dataset.tab}`).classList.add('active');
  });
});

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

// Product Modal
document.getElementById('fab-add').addEventListener('click', () => openProductModal(null));
document.getElementById('modal-close').addEventListener('click', closeProductModal);
document.getElementById('btn-cancel').addEventListener('click', closeProductModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeProductModal();
});

document.getElementById('product-form').addEventListener('submit', saveProduct);
document.getElementById('btn-delete-product').addEventListener('click', deleteProduct);

// Category Modal
document.getElementById('btn-add-category').addEventListener('click', () => openCategoryModal(null));
document.getElementById('category-modal-close').addEventListener('click', closeCategoryModal);
document.getElementById('btn-category-cancel').addEventListener('click', closeCategoryModal);
document.getElementById('category-modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeCategoryModal();
});

document.getElementById('category-form').addEventListener('submit', saveCategory);
document.getElementById('btn-delete-category').addEventListener('click', deleteCategory);

// Scanner
let scanning = false;

function initScanner() {
  if (typeof Quagga === 'undefined') {
    document.getElementById('fab-scan').classList.add('hidden');
    document.getElementById('btn-scan-form').classList.add('hidden');
    return;
  }

  document.getElementById('fab-scan').addEventListener('click', startScanner);
  document.getElementById('btn-scan-form').addEventListener('click', startScanner);
  document.getElementById('scanner-close').addEventListener('click', stopScanner);
}

function startScanner() {
  if (scanning) return;
  scanning = true;

  const overlay = document.getElementById('scanner-overlay');
  overlay.classList.remove('hidden');

  const view = document.getElementById('scanner-view');
  view.innerHTML = '';

  Quagga.init({
    inputStream: {
      name: 'Live',
      type: 'LiveStream',
      target: view,
      constraints: {
        width: 640,
        height: 480,
        facingMode: 'environment'
      },
      area: { top: '0%', right: '0%', left: '0%', bottom: '0%' }
    },
    decoder: {
      readers: [
        'ean_reader', 'ean_8_reader', 'upc_reader',
        'upc_e_reader', 'code_128_reader'
      ],
      debug: {
        drawBoundingBox: false,
        showPattern: false,
        showCanvas: false
      }
    },
    locate: false,
    numOfWorkers: 0,
    frequency: 10
  }, (err) => {
    if (err) {
      if (err.toString().includes('NotAllowedError') || err.toString().includes('Permission')) {
        view.innerHTML = '<div style="color:#fff;padding:40px;text-align:center"><p style="font-size:2rem;margin-bottom:16px">&#128248;</p><p style="font-size:1rem">Permiso de cámara denegado</p><p style="font-size:0.85rem;margin-top:8px;color:#aaa">Ve a Ajustes > Safari > Cámara y permite el acceso</p></div>';
      } else {
        showToast('Error al iniciar cámara', 'error');
        stopScanner();
      }
      return;
    }
    Quagga.start();

    const line = document.createElement('div');
    line.className = 'scanner-line';
    view.appendChild(line);
    const hint = document.querySelector('.scanner-hint');
    if (hint) hint.textContent = 'Escaneando... acerca el código de barras';
  });

  Quagga.onDetected((data) => {
    const code = data.codeResult.code;
    const confidence = data.codeResult.confidence || 0;
    if (!code || confidence < 0.7) return;

    scanning = false;
    Quagga.stop();
    overlay.classList.add('hidden');

    document.getElementById('product-code').value = code;
    const existing = products.find((p) => p.code === code);
    if (existing) {
      showToast('Código ya registrado: ' + existing.name, 'warning');
      openProductModal(existing.id);
    } else {
      openProductModal(null);
      showToast('Código: ' + code, 'success');
    }
  });
}

function stopScanner() {
  scanning = false;
  try { Quagga.stop(); } catch {}
  document.getElementById('scanner-view').innerHTML = '';
  document.getElementById('scanner-overlay').classList.add('hidden');
}

document.getElementById('scanner-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) stopScanner();
});

// Init
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  initScanner();
});
