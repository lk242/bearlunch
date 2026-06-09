/**
 * Bear Joy Lunch — API Server
 *
 * 提供兩個 API 端點給前端呼叫：
 *   POST /api/sync-menu   — 從 DinBenDon 同步菜單到 Firebase
 *   POST /api/push-orders — 從 Firebase 推送訂單到 DinBenDon
 *
 * 開發模式:  node server.mjs          (API only, 前端用 Vite dev)
 * 正式部署:  npm run build && node server.mjs --production
 */

import express from 'express';
import cors from 'cors';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, doc, getDocs, writeBatch, updateDoc, setDoc
} from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.argv.includes('--production');
const PORT = process.env.PORT || 3001;

// ── Firebase ───────────────────────────────────────────────

const firebaseConfig = {
  apiKey: "AIzaSyBPG5IK0V9zlBKl0Qn7n6OaH2X5sTRvBJE",
  authDomain: "bear-joy-lunch.firebaseapp.com",
  projectId: "bear-joy-lunch",
  storageBucket: "bear-joy-lunch.firebasestorage.app",
  messagingSenderId: "227348367786",
  appId: "1:227348367786:web:eeb497ecbbe5bea8ca83d3"
};
const APP_ID = 'bear-joy-lunch-express';
const fbApp = initializeApp(firebaseConfig);
const fbAuth = getAuth(fbApp);
const db = getFirestore(fbApp);

await signInAnonymously(fbAuth);
console.log('🔥 Firebase 已連接');

// ── DinBenDon API helpers ──────────────────────────────────

const DBD_BASE = 'https://dinbendon.net/mvc/api';
const DBD_USERNAME = process.env.DBD_USERNAME || '26522689';
const DBD_PASSWORD = process.env.DBD_PASSWORD || DBD_USERNAME;
let jwt = '';

async function dbdFetch(path, options = {}) {
  const url = `${DBD_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    ...options.headers
  };
  const res = await fetch(url, { ...options, headers });
  const newToken = res.headers.get('x-dbd-new-token');
  if (newToken) jwt = newToken;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DinBenDon ${res.status}: ${path} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function dbdLogin() {
  const res = await fetch(`${DBD_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DBD_USERNAME, password: DBD_PASSWORD })
  });
  const newToken = res.headers.get('x-dbd-new-token');
  if (newToken) jwt = newToken;
  const data = await res.json();
  if (data.data?.nextStep !== 'OK') throw new Error('DinBenDon 登入失敗');
}

function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

async function dbdGetActiveOrders() {
  const data = await dbdFetch('/order/progress');
  const active = (data.data || []).filter(o => o.inProgress);
  if (active.length === 0) return [];
  // 找最近的截止日，只回傳該日的訂單
  const earliest = Math.min(...active.map(o => o.expireDate));
  const targetDay = dateKey(earliest);
  return active.filter(o => dateKey(o.expireDate) === targetDay);
}

async function dbdGetMenu(orderHashId) {
  const data = await dbdFetch(`/order/${orderHashId}/get-add-item`, {
    method: 'POST', body: '{}'
  });
  return data.data;
}

// ── Sync Menu Logic ────────────────────────────────────────

async function syncMenu(clearFirst) {
  await dbdLogin();

  const activeOrders = await dbdGetActiveOrders();
  if (activeOrders.length === 0) return { success: true, message: '目前沒有進行中的訂單', items: 0 };

  const seenShops = new Set();
  const allMenuItems = [];

  for (const order of activeOrders) {
    if (seenShops.has(order.shopName)) continue;
    seenShops.add(order.shopName);

    try {
      const menuData = await dbdGetMenu(order.orderHashId);
      const shop = menuData?.shop;
      if (!shop?.categories) continue;

      for (const cat of shop.categories) {
        for (const product of (cat.products || [])) {
          const variations = product.variations || [];
          if (variations.length <= 1) {
            allMenuItems.push({
              shopName: shop.name || order.shopName,
              name: product.name,
              price: variations[0]?.price ?? 0,
              createdAt: Date.now()
            });
          } else {
            for (const v of variations) {
              allMenuItems.push({
                shopName: shop.name || order.shopName,
                name: v.name ? `${product.name} (${v.name})` : product.name,
                price: v.price ?? 0,
                createdAt: Date.now()
              });
            }
          }
        }
      }
    } catch (e) { /* skip failed shops */ }
  }

  if (allMenuItems.length === 0) return { success: true, message: '沒有可同步的品項', items: 0 };

  // 從 DinBenDon 訂單的 expireDate 更新截止時間（存完整 timestamp）
  const expireTs = activeOrders[0].expireDate;
  const expireDate = new Date(expireTs);
  const deadlineStr = `${expireDate.getHours().toString().padStart(2,'0')}:${expireDate.getMinutes().toString().padStart(2,'0')}`;
  await setDoc(
    doc(db, 'artifacts', APP_ID, 'public', 'data', 'config', 'settings'),
    { deadline: deadlineStr, deadlineTimestamp: expireTs },
    { merge: true }
  );

  const menuCol = collection(db, 'artifacts', APP_ID, 'public', 'data', 'menu');

  if (clearFirst) {
    const snapshot = await getDocs(menuCol);
    if (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }

  const BATCH_LIMIT = 450;
  let written = 0;
  for (let i = 0; i < allMenuItems.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = allMenuItems.slice(i, i + BATCH_LIMIT);
    for (const item of chunk) batch.set(doc(menuCol), item);
    await batch.commit();
    written += chunk.length;
  }

  return {
    success: true,
    message: `已從 ${seenShops.size} 家店同步 ${written} 個品項，截止 ${deadlineStr}`,
    items: written,
    shops: seenShops.size,
    deadline: deadlineStr
  };
}

// ── Push Orders Logic ──────────────────────────────────────

function normalizeShopName(name) {
  return name.replace(/[\s\(\)（）]/g, '').toLowerCase();
}

function findMatchingDbdOrder(fbShopName, dbdOrders) {
  const norm = normalizeShopName(fbShopName);
  return dbdOrders.find(o =>
    normalizeShopName(o.shopName).includes(norm) || norm.includes(normalizeShopName(o.shopName))
  );
}

function findProduct(itemName, itemPrice, categories) {
  for (const cat of categories) {
    for (const product of (cat.products || [])) {
      for (const v of (product.variations || [])) {
        const fullName = v.name ? `${product.name} (${v.name})` : product.name;
        if ((product.name === itemName || fullName === itemName) && v.price === itemPrice) {
          return { product, variation: v, categoryName: cat.name === '___UNDEFINED___' ? null : cat.name };
        }
      }
      if (product.name === itemName && product.variations?.length === 1) {
        return { product, variation: product.variations[0], categoryName: cat.name === '___UNDEFINED___' ? null : cat.name };
      }
    }
  }
  return null;
}

async function pushOrders() {
  await dbdLogin();

  const ordersCol = collection(db, 'artifacts', APP_ID, 'public', 'data', 'orders');
  const snapshot = await getDocs(ordersCol);
  const fbOrders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  const unpushed = fbOrders.filter(o => !o.pushedToDbd);

  if (unpushed.length === 0) return { success: true, message: '所有訂單都已推送', pushed: 0, failed: 0 };

  const dbdOrders = await dbdGetActiveOrders();
  const menuCache = {};
  const results = [];
  let pushed = 0, failed = 0;

  const byShop = {};
  for (const order of unpushed) {
    const shop = order.shopName || '未知';
    (byShop[shop] ||= []).push(order);
  }

  for (const [shopName, orders] of Object.entries(byShop)) {
    const dbdOrder = findMatchingDbdOrder(shopName, dbdOrders);
    if (!dbdOrder) {
      orders.forEach(o => results.push({ user: o.userName, status: 'skip', reason: `找不到「${shopName}」的 DinBenDon 訂單` }));
      failed += orders.length;
      continue;
    }

    if (!menuCache[dbdOrder.orderHashId]) {
      const menuData = await dbdGetMenu(dbdOrder.orderHashId);
      menuCache[dbdOrder.orderHashId] = menuData;
    }
    const menuData = menuCache[dbdOrder.orderHashId];
    const categories = menuData?.shop?.categories || [];
    const shopRevisionNo = menuData?.shop?.revisionNo || 0;

    for (const order of orders) {
      const items = order.items || [{ name: order.itemName, price: order.price }];
      const addProducts = [];

      for (const item of items) {
        const match = findProduct(item.name, item.price, categories);
        if (match) {
          addProducts.push({
            productId: match.product.id, variationId: match.variation.id,
            qty: 1, comment: null, categoryName: match.categoryName,
            productName: match.product.name, variationName: match.variation.name || '',
            price: match.variation.price
          });
        }
      }

      if (addProducts.length === 0) {
        results.push({ user: order.userName, status: 'skip', reason: '品項比對失敗' });
        failed++;
        continue;
      }

      try {
        const addResult = await dbdFetch(`/order/${dbdOrder.orderHashId}/add-item`, {
          method: 'POST',
          body: JSON.stringify({
            addProducts, playedName: order.userName || '未知',
            buyerInfo: null, addMisc: null, shopRevisionNo
          })
        });
        // 儲存 DinBenDon 回傳的 orderItemIds，以便後續取消
        const dbdItemIds = addResult.data?.orderItemIds || addResult.data?.orderItems?.map(i => i.id) || [];
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'orders', order.id), {
          pushedToDbd: true, pushedAt: Date.now(),
          dbdOrderHashId: dbdOrder.orderHashId,
          dbdOrderItemIds: dbdItemIds
        });
        results.push({ user: order.userName, status: 'ok', items: addProducts.map(p => p.productName), dbdItemIds });
        pushed++;
      } catch (e) {
        results.push({ user: order.userName, status: 'error', reason: e.message });
        failed++;
      }
    }
  }

  return { success: true, message: `推送完成：${pushed} 成功、${failed} 失敗`, pushed, failed, results };
}

// ── Cancel / Query Pushed Items ───────────────────────────

async function getDbdPushedItems() {
  await dbdLogin();
  const dbdOrders = await dbdGetActiveOrders();
  if (dbdOrders.length === 0) return { success: true, items: [], message: '目前沒有進行中的訂單' };

  const allItems = [];
  for (const order of dbdOrders) {
    try {
      const data = await dbdFetch(`/order/${order.orderHashId}/buyer-for-buyer?expand=true&sortByName=false`);
      // DinBenDon 回傳格式: data.rows = [{name, items: [{orderItemIds, mergedName, ...}]}]
      const buyers = data.data?.rows || [];
      for (const buyer of buyers) {
        const items = buyer.items || [];
        for (const item of items) {
          // orderItemIds 是陣列，每個 item 可能合併多筆
          const itemIds = item.orderItemIds || [];
          allItems.push({
            orderHashId: order.orderHashId,
            shopName: order.shopName,
            orderItemId: itemIds[0],         // 主要 ID（用於取消）
            orderItemIds: itemIds,            // 完整 ID 列表
            productName: item.mergedName || item.fullName || item.name || '未知品項',
            variationName: item.variationName || '',
            price: item.total ?? item.price ?? 0,
            qty: item.size || item.qty || 1,
            playedName: buyer.name || '未知',
            canCancel: item.cancelable !== false
          });
        }
      }
    } catch (e) { /* skip */ }
  }

  return { success: true, items: allItems, message: `找到 ${allItems.length} 個已訂購品項` };
}

async function cancelDbdItems(orderHashId, orderItemIds) {
  await dbdLogin();
  const result = await dbdFetch(`/order/${orderHashId}/cancel-item`, {
    method: 'POST',
    body: JSON.stringify({ orderItemIds })
  });
  return { success: true, data: result.data, message: `已取消 ${orderItemIds.length} 個品項` };
}

// ── Express App ────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/sync-menu', async (req, res) => {
  try {
    const clearFirst = req.body?.clear !== false; // 預設清除舊菜單
    const result = await syncMenu(clearFirst);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/push-orders', async (req, res) => {
  try {
    const result = await pushOrders();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/dbd-items', async (req, res) => {
  try {
    const result = await getDbdPushedItems();
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/cancel-items', async (req, res) => {
  try {
    const { orderHashId, orderItemIds } = req.body;
    if (!orderHashId || !orderItemIds?.length) {
      return res.status(400).json({ success: false, message: '需要 orderHashId 和 orderItemIds' });
    }
    const result = await cancelDbdItems(orderHashId, orderItemIds);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 正式模式：serve 前端靜態檔
if (isProduction) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  // Express 5: /{*path} 不匹配根路徑，需額外處理 /
  app.get('/', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`🚀 API Server 啟動: http://localhost:${PORT}`);
  if (isProduction) console.log('   正式模式 — 同時提供前端靜態檔');
  else console.log('   開發模式 — 前端請用 Vite (localhost:5173)');
});
