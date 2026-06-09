/**
 * Firebase → DinBenDon 訂單推送腳本
 *
 * 讀取 Firebase 中的訂單，自動推送到 DinBenDon 對應的店家訂單。
 *
 * 用法:
 *   node push-to-dinbendon.mjs              # 推送所有未推送的訂單
 *   node push-to-dinbendon.mjs --dry-run    # 只顯示會推送的內容
 *
 * 流程:
 *   1. 從 Firebase 讀取所有訂單
 *   2. 登入 DinBenDon，取得進行中的訂單列表
 *   3. 對每個 Firebase 訂單，找到對應的 DinBenDon 店家訂單
 *   4. 用店家菜單比對品項 (by name + price)，取得 productId / variationId
 *   5. 呼叫 add-item API 推送
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  updateDoc,
  doc
} from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

// ── DinBenDon API ──────────────────────────────────────────

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
    throw new Error(`DinBenDon API ${res.status}: ${path} — ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function dbdLogin() {
  console.log(`🔐 登入 DinBenDon...`);
  const res = await fetch(`${DBD_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DBD_USERNAME, password: DBD_PASSWORD })
  });
  const newToken = res.headers.get('x-dbd-new-token');
  if (newToken) jwt = newToken;
  const data = await res.json();
  if (data.data?.nextStep !== 'OK') throw new Error('登入失敗');
  console.log('   登入成功');
}

function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

async function dbdGetActiveOrders() {
  const data = await dbdFetch('/order/progress');
  const active = (data.data || []).filter(o => o.inProgress);
  if (active.length === 0) return [];
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

async function dbdAddItems(orderHashId, payload) {
  return dbdFetch(`/order/${orderHashId}/add-item`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

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

async function getFirebaseOrders(db) {
  const col = collection(db, 'artifacts', APP_ID, 'public', 'data', 'orders');
  const snapshot = await getDocs(col);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── 比對邏輯 ───────────────────────────────────────────────

function normalizeShopName(name) {
  return name.replace(/[\s\(\)（）]/g, '').toLowerCase();
}

function findMatchingDbdOrder(fbShopName, dbdOrders) {
  const norm = normalizeShopName(fbShopName);
  return dbdOrders.find(o => normalizeShopName(o.shopName).includes(norm) || norm.includes(normalizeShopName(o.shopName)));
}

function findProduct(itemName, itemPrice, categories) {
  for (const cat of categories) {
    for (const product of (cat.products || [])) {
      for (const v of (product.variations || [])) {
        const fullName = v.name ? `${product.name} (${v.name})` : product.name;
        if (product.name === itemName || fullName === itemName) {
          if (v.price === itemPrice) {
            return { product, variation: v, categoryName: cat.name === '___UNDEFINED___' ? null : cat.name };
          }
        }
      }
      if (product.name === itemName && product.variations?.length === 1) {
        return {
          product,
          variation: product.variations[0],
          categoryName: cat.name === '___UNDEFINED___' ? null : cat.name
        };
      }
    }
  }
  return null;
}

// ── 主流程 ─────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  // 1. 連接 Firebase，讀取訂單
  console.log('🔥 連接 Firebase...');
  const fbApp = initializeApp(firebaseConfig);
  const fbAuth = getAuth(fbApp);
  await signInAnonymously(fbAuth);
  const db = getFirestore(fbApp);

  const fbOrders = await getFirebaseOrders(db);
  const unpushed = fbOrders.filter(o => !o.pushedToDbd);
  console.log(`   共 ${fbOrders.length} 筆訂單，${unpushed.length} 筆未推送`);

  if (unpushed.length === 0) {
    console.log('✅ 所有訂單都已推送');
    process.exit(0);
  }

  // 2. 登入 DinBenDon
  await dbdLogin();

  // 3. 取得進行中的訂單
  console.log('📋 取得 DinBenDon 進行中訂單...');
  const dbdOrders = await dbdGetActiveOrders();
  console.log(`   ${dbdOrders.length} 個進行中`);

  // 4. 按店家分組 Firebase 訂單
  const byShop = {};
  for (const order of unpushed) {
    const shop = order.shopName || '未知';
    (byShop[shop] ||= []).push(order);
  }

  // 5. 逐店推送
  const menuCache = {};
  let successCount = 0;
  let failCount = 0;

  for (const [shopName, orders] of Object.entries(byShop)) {
    const dbdOrder = findMatchingDbdOrder(shopName, dbdOrders);
    if (!dbdOrder) {
      console.log(`⚠️  「${shopName}」在 DinBenDon 找不到對應的進行中訂單，跳過 ${orders.length} 筆`);
      failCount += orders.length;
      continue;
    }

    console.log(`\n🍱 ${shopName} → ${dbdOrder.shopName} (${dbdOrder.orderHashId})`);

    // 取得菜單（快取）
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
        if (!match) {
          console.log(`   ❌ 找不到品項: ${item.name} $${item.price}`);
          continue;
        }
        addProducts.push({
          productId: match.product.id,
          variationId: match.variation.id,
          qty: 1,
          comment: null,
          categoryName: match.categoryName,
          productName: match.product.name,
          variationName: match.variation.name || '',
          price: match.variation.price
        });
      }

      if (addProducts.length === 0) {
        console.log(`   ⏭️  ${order.userName}: 無可匹配的品項`);
        failCount++;
        continue;
      }

      const payload = {
        addProducts,
        playedName: order.userName || '未知',
        buyerInfo: null,
        addMisc: null,
        shopRevisionNo
      };

      if (dryRun) {
        console.log(`   📝 [DRY] ${order.userName}: ${addProducts.map(p => p.productName).join(', ')}`);
        successCount++;
      } else {
        try {
          await dbdAddItems(dbdOrder.orderHashId, payload);
          await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'orders', order.id), {
            pushedToDbd: true,
            pushedAt: Date.now()
          });
          console.log(`   ✅ ${order.userName}: ${addProducts.map(p => p.productName).join(', ')}`);
          successCount++;
        } catch (e) {
          console.log(`   ❌ ${order.userName}: ${e.message}`);
          failCount++;
        }
      }
    }
  }

  console.log(`\n📊 結果: ${successCount} 成功, ${failCount} 失敗`);
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ 錯誤:', err.message);
  process.exit(1);
});
