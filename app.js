let products = [];
let cart = [];
let sales = [];
let pendingName = '';
let productsUnsubscribe = null;

function getDB() { return firebase.firestore(); }

function initApp() {
  firebase.firestore().enableNetwork();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  listenToProducts();
  bindUI();
  updateClock();
  setInterval(updateClock, 1000);
  renderCart();
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
}

// --- FIRESTORE ---
function listenToProducts() {
  const db = getDB();
  if (productsUnsubscribe) productsUnsubscribe();
  productsUnsubscribe = db.collection('products')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      products = [];
      snapshot.forEach(doc => products.push({ id: doc.id, ...doc.data() }));
      renderCart();
    }, err => console.error('Firebase error:', err));
}

async function addProductToFirebase(name, price) {
  const db = getDB();
  try {
    const doc = await db.collection('products').add({
      name, price: parseFloat(price),
      size: '', business: 'general',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const id = doc.id;
    return { id, name, price, business: 'general' };
  } catch (err) {
    console.error('Error saving product:', err);
    return null;
  }
}

async function saveSaleToFirebase(sale) {
  const db = getDB();
  try {
    await db.collection('sales').add({
      id: sale.id,
      date: sale.date,
      items: sale.items,
      total: sale.total,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Error saving sale:', err);
  }
}

// --- UI ---
function bindUI() {
  const inp = $('search-input');
  const sug = $('suggestions');
  let selIdx = -1;

  inp.addEventListener('input', () => {
    const raw = inp.value.trim();
    const q = normalize(raw);
    if (!q) { sug.classList.remove('show'); selIdx = -1; return; }
    let list = products.filter(p => normalize(p.name).includes(q)).slice(0, 8);
    const exact = list.some(p => normalize(p.name) === q);
    if (!exact) {
      list.push({ id: '_new', name: inp.value.trim(), price: null, business: 'Nuevo', _new: true });
    }
    sug.innerHTML = list.map((p, i) =>
      `<div class="sug-item" data-idx="${i}">
        <div>
          <div class="sug-name">${p._new ? '➕ ' + escHtml(p.name) : escHtml(p.name)} <span class="sug-cat">${p._new ? 'Nuevo' : escHtml(p.business || '')}</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${p._new ? '' : '<span class="sug-price">$' + Number(p.price).toFixed(2) + '</span>'}
        </div>
      </div>`
    ).join('');
    sug.classList.add('show');
    selIdx = -1;
    sug.querySelectorAll('.sug-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        const p = list[idx];
        if (p._new) askPrice(p.name);
        else addToCart(p.id);
        inp.value = ''; sug.classList.remove('show'); inp.focus();
      });
    });
  });

  inp.addEventListener('keydown', e => {
    const items = sug.querySelectorAll('.sug-item');
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = inp.value.trim();
      if (!q) return;
      if (selIdx >= 0 && items[selIdx]) { items[selIdx].click(); return; }
      const match = products.filter(p => normalize(p.name).includes(normalize(q)));
      if (match.length === 1) { addToCart(match[0].id); inp.value = ''; sug.classList.remove('show'); inp.focus(); }
      else if (match.length > 1) { if (items[0]) items[0].click(); }
      else askPrice(q);
      inp.value = ''; sug.classList.remove('show');
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      selIdx = e.key === 'ArrowDown' ? Math.min(selIdx + 1, items.length - 1) : Math.max(selIdx - 1, -1);
      items.forEach((el, i) => el.classList.toggle('hl', i === selIdx));
    }
  });

  inp.addEventListener('blur', () => setTimeout(() => sug.classList.remove('show'), 200));

  $('search-btn').addEventListener('click', () => {
    const q = inp.value.trim();
    if (q) {
      const match = products.filter(p => normalize(p.name).includes(normalize(q)));
      if (match.length >= 1) addToCart(match[0].id);
      else askPrice(q);
      inp.value = ''; sug.classList.remove('show');
    }
    inp.focus();
  });

  $('qp-add').addEventListener('click', confirmPrice);
  $('qp-cancel').addEventListener('click', () => $('quick-price').classList.remove('show'));
  $('qp-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmPrice(); } });

  $('btn-checkout').addEventListener('click', checkout);
  $('btn-history').addEventListener('click', showHistory);
  $('btn-products').addEventListener('click', showProducts);

  $('modal-overlay').addEventListener('click', e => {
    if (e.target === $('modal-overlay')) closeModal();
  });
}

// --- CART ---
function addToCart(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const existing = cart.find(x => x.id === id);
  if (existing) existing.qty++;
  else cart.push({ id: p.id, name: p.name, price: Number(p.price), qty: 1 });
  renderCart();
  toast(p.name);
}

function changeQty(idx, delta) {
  const item = cart[idx];
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart.splice(idx, 1);
  renderCart();
}

function renderCart() {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const count = cart.reduce((s, i) => s + i.qty, 0);
  $('hdr-count').textContent = count;
  $('bb-amount').textContent = '$' + total.toFixed(2);
  $('btn-checkout').disabled = !cart.length;

  if (!cart.length) {
    $('cart-empty').style.display = 'block';
    $('cart-list').innerHTML = '';
    return;
  }
  $('cart-empty').style.display = 'none';
  $('cart-list').innerHTML = cart.map((item, idx) =>
    `<div class="cart-item">
      <div class="ci-name">${escHtml(item.name)}</div>
      <div class="ci-qty">
        <button onclick="changeQty(${idx}, -1)">−</button>
        <span>${item.qty}</span>
        <button onclick="changeQty(${idx}, 1)">+</button>
      </div>
      <div class="ci-price">$${(item.price * item.qty).toFixed(2)}</div>
    </div>`
  ).join('');
  $('cart-wrap').scrollTop = $('cart-wrap').scrollHeight;
}

// --- QUICK PRICE ---
function askPrice(name) {
  pendingName = name;
  $('qp-name').textContent = name;
  $('qp-input').value = '';
  $('quick-price').classList.add('show');
  setTimeout(() => $('qp-input').focus(), 100);
}

async function confirmPrice() {
  const price = parseFloat($('qp-input').value);
  if (isNaN(price) || price <= 0) { toast('Precio inválido'); return; }
  const p = await addProductToFirebase(pendingName, price);
  if (p) addToCart(p.id);
  $('quick-price').classList.remove('show');
  $('search-input').focus();
}

// --- CHECKOUT ---
function checkout() {
  if (!cart.length) return;
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const itemsHtml = cart.map(i => `${i.qty}x ${escHtml(i.name)} — $${(i.price*i.qty).toFixed(2)}`).join('<br>');

  openModal(`
    <h2>Cobrar</h2>
    <div style="text-align:center;margin:12px 0">
      <div style="font-size:13px;color:var(--text-muted)">Total</div>
      <div style="font-size:36px;font-weight:800;color:var(--primary)">$${total.toFixed(2)}</div>
    </div>
    <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px;text-align:center">${itemsHtml}</div>
    <label style="display:flex;align-items:center;gap:8px;justify-content:center;font-size:14px;cursor:pointer;margin-bottom:14px">
      <input type="checkbox" id="chk-pdf" checked> Generar ticket PDF
    </label>
    <div style="display:flex;gap:8px">
      <button class="modal-btn modal-cancel" onclick="closeModal()">Cancelar</button>
      <button class="modal-btn modal-primary" onclick="confirmCheckout()">Confirmar Venta</button>
    </div>
  `);
}

async function confirmCheckout() {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const sale = {
    id: Date.now().toString(36).slice(-6).toUpperCase(),
    date: new Date().toISOString(),
    items: cart.map(i => ({ ...i })),
    total,
  };
  await saveSaleToFirebase(sale);
  sales.push(sale);
  cart = [];
  renderCart();
  closeModal();
  toast('Venta: $' + total.toFixed(2));
  if ($('chk-pdf')?.checked) generatePDF(sale);
  $('search-input').focus();
}

// --- PDF ---
function generatePDF(sale) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: [80, 200], compress: true });
  let y = 10;
  const c = (text, size=10, style='normal') => {
    doc.setFontSize(size); doc.setFont('helvetica', style);
    doc.text(text, (80 - doc.getTextWidth(text)) / 2, y);
    y += size * 0.45;
  };
  const l = (left, right, size=9) => {
    doc.setFontSize(size); doc.setFont('helvetica', 'normal');
    doc.text(left, 4, y);
    if (right !== undefined) { doc.setFont('helvetica', 'bold'); doc.text(right, 76 - doc.getTextWidth(right), y); }
    y += size * 0.45;
  };
  const sep = () => { y += 2; doc.setDrawColor(180); doc.line(4, y-1, 76, y-1); y += 2; };

  c('MI PUNTO DE VENTA', 12, 'bold');
  c(new Date(sale.date).toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' }), 8);
  c('Folio: ' + sale.id, 7);
  sep();
  l('Producto', 'Total', 8);
  sep();
  sale.items.forEach(i => l(i.qty + 'x ' + i.name, '$' + (i.price*i.qty).toFixed(2), 8));
  sep();
  l('TOTAL', '$' + sale.total.toFixed(2), 11);
  y += 4; sep();
  c('Gracias por su compra!', 8);
  const h = Math.max(y + 10, 40);
  doc.internal.pageSize.height = h;
  doc.save('ticket_' + sale.id + '.pdf');
}

// --- HISTORY ---
function showHistory() {
  const db = getDB();
  openModal('<h2>Historial</h2><div style="text-align:center;padding:20px;color:var(--text-dim)">Cargando...</div>');
  db.collection('sales').orderBy('createdAt', 'desc').limit(50).get().then(snapshot => {
    const list = [];
    snapshot.forEach(doc => list.push(doc.data()));
    if (!list.length) {
      setModalContent(`<h2>Historial</h2><div style="text-align:center;padding:20px;color:var(--text-dim)">Sin ventas</div><button class="modal-btn modal-cancel" onclick="closeModal()" style="width:100%">Cerrar</button>`);
      return;
    }
    const total = list.reduce((s, x) => s + x.total, 0);
    setModalContent(`
      <h2>Historial</h2>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:10px;color:var(--text-muted)">
        <span>${list.length} ventas</span>
        <span style="color:var(--primary-light);font-weight:700">Total: $${total.toFixed(2)}</span>
      </div>
      ${list.map(s => {
        const d = new Date(s.date);
        const ds = d.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        const c = s.items.reduce((a,i) => a + i.qty, 0);
        return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:5px;cursor:pointer" onclick="viewSale('${s.id}')">
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:11px;color:var(--text-dim)">${ds}</span>
            <span style="font-size:16px;font-weight:700;color:var(--primary-light)">$${s.total.toFixed(2)}</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${c} artículos · ${s.id}</div>
        </div>`;
      }).join('')}
      <button class="modal-btn modal-cancel" onclick="closeModal()" style="width:100%;margin-top:8px">Cerrar</button>
    `);
  }).catch(() => {
    setModalContent(`<h2>Historial</h2><div style="text-align:center;padding:20px;color:var(--text-dim)">Error al cargar</div><button class="modal-btn modal-cancel" onclick="closeModal()" style="width:100%">Cerrar</button>`);
  });
}

function viewSale(sid) {
  const db = getDB();
  db.collection('sales').where('id', '==', sid).get().then(snapshot => {
    let s = null;
    snapshot.forEach(doc => s = doc.data());
    if (!s) return;
    const d = new Date(s.date);
    const ds = d.toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
    setModalContent(`
      <h2>Venta ${s.id}</h2>
      <div style="text-align:center;font-size:11px;color:var(--text-dim);margin-bottom:10px">${ds}</div>
      ${s.items.map(i => `
        <div style="display:flex;justify-content:space-between;font-size:13px;padding:2px 0">
          <span>${i.qty}x ${escHtml(i.name)}</span>
          <span style="font-weight:600">$${(i.price*i.qty).toFixed(2)}</span>
        </div>
      `).join('')}
      <div style="border-top:1px dashed var(--border);margin:8px 0;padding-top:6px;display:flex;justify-content:space-between;font-size:16px;font-weight:700">
        <span>Total</span><span style="color:var(--primary-light)">$${s.total.toFixed(2)}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="modal-btn modal-cancel" onclick="closeModal()" style="flex:1">Cerrar</button>
        <button class="modal-btn modal-primary" onclick="closeModal();generatePDF(${JSON.stringify(s).replace(/"/g,"'")})" style="flex:1">🖨️ Ticket</button>
      </div>
    `);
  });
}

// --- PRODUCTS (admin) ---
function showProducts() {
  const list = [...products];
  openModal(`<h2>Productos (${list.length})</h2>
    <div style="max-height:50vh;overflow-y:auto">
      ${list.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div><div style="font-size:13px;font-weight:500">${escHtml(p.name)}</div><div style="font-size:10px;color:var(--text-dim)">${escHtml(p.business||'')}</div></div>
          <div style="font-size:14px;font-weight:700;color:var(--primary-light)">$${Number(p.price).toFixed(2)}</div>
        </div>
      `).join('')}
    </div>
    <button class="modal-btn modal-cancel" onclick="closeModal()" style="width:100%;margin-top:12px">Cerrar</button>
  `);
}

// --- UI HELPERS ---
function updateClock() {
  $('hdr-clock').textContent = new Date().toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'});
}

function updateOnlineStatus() {
  const badge = $('db-badge');
  if (navigator.onLine) {
    badge.className = 'db-badge online';
    badge.title = 'Base de datos en línea';
  } else {
    badge.className = 'db-badge offline';
    badge.title = 'Sin conexión — cambios locales se sincronizarán automáticamente';
  }
  $('offline-banner').style.display = navigator.onLine ? 'none' : 'block';
}

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(window._tt); window._tt = setTimeout(() => t.classList.remove('show'), 1800);
}

function openModal(html) {
  $('modal-content').innerHTML = html;
  $('modal-overlay').classList.add('show');
}

function setModalContent(html) {
  $('modal-content').innerHTML = html;
}

function closeModal() { $('modal-overlay').classList.remove('show'); }

function $(id) { return document.getElementById(id); }

function normalize(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', initApp);
