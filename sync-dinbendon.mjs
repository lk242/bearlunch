/**
 * DinBenDon → Firebase 自動菜單同步腳本
 *
 * 用法:
 *   node sync-dinbendon.mjs
 *   node sync-dinbendon.mjs --dry-run    # 只顯示菜單不寫入
 *   node sync-dinbendon.mjs --clear      # 清除舊菜單後再同步
 *
 * 環境變數 (可選，預設使用 app.jsx 中的 Firebase config):
 *   DBD_USERNAME  - DinBenDon 帳號 (預設: 26522689)
 *   DBD_PASSWORD  - DinBenDon 密碼 (預設: 同帳號)
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  getDocs
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
  console.log(`🔐 登入 DinBenDon (帳號: ${DBD_USERNAME})...`);
  const res = await fetch(`${DBD_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DBD_USERNAME, password: DBD_PASSWORD })
  });

  const newToken = res.headers.get('x-dbd-new-token');
  if (newToken) jwt = newToken;

  const data = await res.json();
  if (data.data?.nextStep !== 'OK') {
    throw new Error('登入失敗: ' + JSON.stringify(data));
  }
  console.log('   登入成功');
}

function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

async function dbdGetActiveOrders() {
  console.log('📋 取得進行中的訂單...');
  const data = await dbdFetch('/order/progress');
  const orders = data.data || [];
  const active = orders.filter(o => o.inProgress);
  if (active.length === 0) { console.log('   沒有進行中的訂單'); return []; }
  const earliest = Math.min(...active.map(o => o.expireDate));
  const targetDay = dateKey(earliest);
  const filtered = active.filter(o => dateKey(o.expireDate) === targetDay);
  const expDate = new Date(earliest);
  console.log(`   共 ${orders.length} 個訂單，${filtered.length} 個最近截止 (${expDate.getMonth()+1}/${expDate.getDate()})`);
  return filtered;
}

async function dbdGetMenu(orderHashId) {
  const data = await dbdFetch(`/order/${orderHashId}/get-add-item`, {
    method: 'POST',
    body: '{}'
  });
  return data.data?.shop || null;
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

function getMenuCollection(db) {
  return collection(db, 'artifacts', APP_ID, 'public', 'data', 'menu');
}

async function clearFirebaseMenu(db) {
  const menuCol = getMenuCollection(db);
  const snapshot = await getDocs(menuCol);
  if (snapshot.empty) return 0;

  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snapshot.size;
}

async function writeMenuToFirebase(db, items) {
  const menuCol = getMenuCollection(db);
  const BATCH_LIMIT = 450;

  let written = 0;
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + BATCH_LIMIT);
    for (const item of chunk) {
      batch.set(doc(menuCol), item);
    }
    await batch.commit();
    written += chunk.length;
  }
  return written;
}

// ── 主流程 ─────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const clearFirst = args.includes('--clear');

  // 1. 登入 DinBenDon
  await dbdLogin();

  // 2. 取得進行中的訂單
  const activeOrders = await dbdGetActiveOrders();
  if (activeOrders.length === 0) {
    console.log('⚠️  目前沒有進行中的訂單');
    process.exit(0);
  }

  // 3. 取得每個訂單的菜單（同一家店去重）
  const seenShops = new Set();
  const allMenuItems = [];
  for (const order of activeOrders) {
    if (seenShops.has(order.shopName)) continue;
    seenShops.add(order.shopName);

    process.stdout.write(`🍱 ${order.shopName}...`);
    try {
      const shop = await dbdGetMenu(order.orderHashId);
      if (!shop || !shop.categories) {
        console.log(' (無菜單)');
        continue;
      }

      let count = 0;
      for (const cat of shop.categories) {
        for (const product of (cat.products || [])) {
          const variations = product.variations || [];
          if (variations.length <= 1) {
            const price = variations[0]?.price ?? 0;
            allMenuItems.push({
              shopName: shop.name || order.shopName,
              name: product.name,
              price,
              createdAt: Date.now()
            });
            count++;
          } else {
            for (const v of variations) {
              const itemName = v.name ? `${product.name} (${v.name})` : product.name;
              allMenuItems.push({
                shopName: shop.name || order.shopName,
                name: itemName,
                price: v.price ?? 0,
                createdAt: Date.now()
              });
              count++;
            }
          }
        }
      }
      console.log(` ${count} 品項`);
    } catch (e) {
      console.log(` 失敗: ${e.message}`);
    }
  }

  console.log(`\n📊 共 ${allMenuItems.length} 個品項`);

  if (dryRun) {
    console.log('\n--- Dry Run 模式：以下為將同步的品項 ---');
    const byShop = {};
    for (const item of allMenuItems) {
      (byShop[item.shopName] ||= []).push(item);
    }
    for (const [shop, items] of Object.entries(byShop)) {
      console.log(`\n【${shop}】`);
      for (const item of items) {
        console.log(`  ${item.name}  $${item.price}`);
      }
    }
    return;
  }

  if (allMenuItems.length === 0) {
    console.log('⚠️  沒有可同步的品項');
    process.exit(0);
  }

  // 4. 連接 Firebase
  console.log('\n🔥 連接 Firebase...');
  const fbApp = initializeApp(firebaseConfig);
  const fbAuth = getAuth(fbApp);
  await signInAnonymously(fbAuth);
  const db = getFirestore(fbApp);

  // 5. 可選：清除舊菜單
  if (clearFirst) {
    const cleared = await clearFirebaseMenu(db);
    console.log(`🧹 已清除 ${cleared} 個舊品項`);
  }

  // 6. 寫入新菜單
  const written = await writeMenuToFirebase(db, allMenuItems);
  console.log(`✅ 成功同步 ${written} 個品項到 Firebase！`);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ 錯誤:', err.message);
  process.exit(1);
});
