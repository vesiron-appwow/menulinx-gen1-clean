/**
 * MenuLinx Admin Client Script
 * Loaded by the admin dashboard page.
 * Handles: tabs, order actions, menu CRUD, OCR import, settings, polling.
 * Expects window.__MLX__ = { slug, orders, currency }
 */
(function () {
  const { slug, orders: initialOrders, currency } = window.__MLX__;
  const API = `/api/${slug}`;
  let currentOrders = [...initialOrders];
  let extractedItems = [];

  // ─── TABS ───
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ─── LOGOUT ───
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch(`${API}/logout`, { method: 'POST' });
    window.location.href = `/${slug}/admin/login`;
  });

  // ─── ORDER ACTIONS ───
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const orderId = btn.dataset.oid;
    const newStatus = btn.dataset.action;
    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      const res = await fetch(`${API}/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Update failed');

      // Update local state
      const idx = currentOrders.findIndex(o => o.id === orderId);
      if (newStatus === 'delivered' || newStatus === 'rejected') {
        if (idx !== -1) currentOrders.splice(idx, 1);
        const card = document.querySelector(`[data-order-id="${orderId}"]`);
        if (card) card.style.display = 'none';
      } else if (idx !== -1) {
        currentOrders[idx].status = newStatus;
        // Refresh page to update UI cleanly
        location.reload();
      }
    } catch (err) {
      alert('Failed to update order: ' + err.message);
      btn.disabled = false;
    }
  });

  // ─── ADD MENU ITEM ───
  document.getElementById('addItemBtn').addEventListener('click', async () => {
    const name = document.getElementById('newName').value.trim();
    const price = parseFloat(document.getElementById('newPrice').value);
    const category = document.getElementById('newCat').value.trim() || 'Main';

    if (!name || isNaN(price) || price < 0) {
      alert('Please enter a valid name and price.');
      return;
    }

    try {
      const res = await fetch(`${API}/menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, price, category }),
      });
      if (!res.ok) throw new Error('Failed to add item');
      location.reload();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // ─── DELETE MENU ITEM ───
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.del-btn[data-mid]');
    if (!btn) return;
    if (!confirm('Delete this item?')) return;
    const mid = btn.dataset.mid;
    btn.disabled = true;

    try {
      const res = await fetch(`${API}/menu/${mid}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      const row = btn.closest('.menu-item');
      if (row) row.remove();
    } catch (err) {
      alert('Error: ' + err.message);
      btn.disabled = false;
    }
  });

  // ─── OCR IMPORT ───
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('menuFile');
  const progressBar = document.getElementById('ocrProgress');
  const progressFill = document.getElementById('ocrFill');
  const statusEl = document.getElementById('ocrStatus');

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.style.borderColor = '#0057B8'; });
  uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = '#ccc'; });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#ccc';
    if (e.dataTransfer.files.length > 0) processImage(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) processImage(fileInput.files[0]);
  });

  async function processImage(file) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }

    progressBar.style.display = 'block';
    progressFill.style.width = '10%';
    statusEl.textContent = 'Loading OCR engine...';

    try {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            progressFill.style.width = `${10 + Math.round(m.progress * 80)}%`;
            statusEl.textContent = `Scanning... ${Math.round(m.progress * 100)}%`;
          }
        },
      });

      const { data } = await worker.recognize(file);
      await worker.terminate();

      progressFill.style.width = '95%';
      statusEl.textContent = 'Extracting menu items...';

      extractedItems = parseMenuText(data.text);
      progressFill.style.width = '100%';

      if (extractedItems.length === 0) {
        statusEl.textContent = 'No menu items detected. Try a clearer photo.';
        progressBar.style.display = 'none';
        return;
      }

      statusEl.textContent = `Found ${extractedItems.length} items — review below:`;
      showExtracted();
      progressBar.style.display = 'none';
    } catch (err) {
      statusEl.textContent = 'OCR failed: ' + err.message;
      progressBar.style.display = 'none';
    }
  }

  function parseMenuText(text) {
    const lines = text.split('\n').filter(l => l.trim().length > 2);
    const items = [];
    const priceRe = /[£$€]?\d+[.,]\d{2}/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const priceMatches = line.match(priceRe);

      if (priceMatches && priceMatches.length > 0) {
        const priceStr = priceMatches[priceMatches.length - 1];
        const price = parseFloat(priceStr.replace(/[£$€,]/g, ''));
        let name = line.replace(priceStr, '').replace(/\.{2,}/g, '').replace(/\s{2,}/g, ' ').trim();

        if (name.length < 2 || price <= 0 || price > 999) continue;

        let description = '';
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (!nextLine.match(priceRe) && nextLine.length > 8 && nextLine.length < 200) {
            description = nextLine;
            i++; // skip the description line
          }
        }

        items.push({
          tempId: 'tmp-' + Date.now() + '-' + items.length,
          name,
          description,
          price: price.toFixed(2),
          category: 'Main',
        });
      }
    }
    return items;
  }

  function showExtracted() {
    const wrap = document.getElementById('extractedWrap');
    const list = document.getElementById('extractedList');
    const banner = document.getElementById('saveBanner');

    if (extractedItems.length === 0) {
      wrap.classList.remove('show');
      banner.classList.remove('show');
      return;
    }

    wrap.classList.add('show');
    banner.classList.add('show');

    list.innerHTML = extractedItems.map(item => `
      <div class="ext-item" data-tid="${item.tempId}">
        <input data-field="name" value="${escHtml(item.name)}" placeholder="Name" />
        <input data-field="price" type="number" step="0.01" value="${item.price}" placeholder="Price" />
        <input data-field="category" value="${escHtml(item.category)}" placeholder="Category" />
        <button class="ext-remove" onclick="window.__MLX__.removeExtracted('${item.tempId}')">Remove</button>
      </div>
    `).join('');
  }

  function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Sync edits from extracted item inputs back to the array
  function syncExtractedEdits() {
    document.querySelectorAll('.ext-item').forEach(row => {
      const tid = row.dataset.tid;
      const item = extractedItems.find(i => i.tempId === tid);
      if (!item) return;
      row.querySelectorAll('[data-field]').forEach(el => {
        const val = el.type === 'number' ? parseFloat(el.value) : el.value;
        item[el.dataset.field] = val;
      });
    });
  }

  window.__MLX__.removeExtracted = function (tid) {
    extractedItems = extractedItems.filter(i => i.tempId !== tid);
    showExtracted();
  };

  // Save extracted to live menu (bulk)
  document.getElementById('saveBanner').addEventListener('click', async () => {
    if (extractedItems.length === 0) return;
    syncExtractedEdits();
    const banner = document.getElementById('saveBanner');
    banner.textContent = 'Saving...';
    banner.style.pointerEvents = 'none';

    try {
      const res = await fetch(`${API}/menu/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: extractedItems }),
      });
      if (!res.ok) throw new Error('Save failed');
      alert(`${extractedItems.length} items added to your live menu!`);
      extractedItems = [];
      document.getElementById('extractedWrap').classList.remove('show');
      banner.classList.remove('show');
      setTimeout(() => location.reload(), 500);
    } catch (err) {
      alert('Error: ' + err.message);
      banner.textContent = 'Save to Live Menu';
      banner.style.pointerEvents = '';
    }
  });

  // ─── SETTINGS SAVE ───
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      tagline: fd.get('tagline'),
      currency: fd.get('currency'),
      deliveryFee: parseFloat(fd.get('deliveryFee')) || 0,
      minOrder: parseFloat(fd.get('minOrder')) || 0,
      sms: {
        enabled: !!fd.get('smsEnabled'),
        apiKey: fd.get('smsApiKey'),
        events: {
          orderReceived: !!fd.get('smsReceived'),
          orderAccepted: !!fd.get('smsAccepted'),
          orderReady: !!fd.get('smsReady'),
          orderDelivered: !!fd.get('smsDelivered'),
        },
      },
    };

    try {
      const res = await fetch(`${API}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      alert('Settings saved!');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // ─── LIVE ORDER POLLING (every 15 seconds) ───
  setInterval(async () => {
    try {
      const res = await fetch(`${API}/orders`);
      if (!res.ok) return;
      const newOrders = await res.json();
      if (JSON.stringify(newOrders) !== JSON.stringify(currentOrders)) {
        currentOrders = newOrders;
        // Update order count in tab
        const ordersTab = document.querySelector('[data-tab="orders"]');
        if (ordersTab) ordersTab.textContent = `Orders (${newOrders.length})`;
        // If on orders panel, reload for fresh render
        if (document.getElementById('panel-orders').classList.contains('active')) {
          location.reload();
        }
      }
    } catch (e) {
      // Silently fail — network hiccup
    }
  }, 15000);

})();
