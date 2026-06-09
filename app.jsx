import React, { useState, useMemo, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged
} from 'firebase/auth';
import {
  Plus,
  Trash2,
  Moon,
  Sun,
  ExternalLink,
  Copy,
  Store,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  Unlock,
  X,
  ShoppingCart,
  Minus,
  Users,
  Edit3,
  Clock,
  Save,
  UtensilsCrossed,
  ClipboardList,
  Settings,
  DollarSign,
  UserCheck,
  Ban,
  Send,
  Zap,
  RotateCcw,
  RefreshCw,
  Upload,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try {
      return typeof __firebase_config === 'string' ? JSON.parse(__firebase_config) : __firebase_config;
    } catch (e) {
      console.error("Firebase config parse error", e);
    }
  }
  return {
    apiKey: "AIzaSyBPG5IK0V9zlBKl0Qn7n6OaH2X5sTRvBJE",
    authDomain: "bear-joy-lunch.firebaseapp.com",
    projectId: "bear-joy-lunch",
    storageBucket: "bear-joy-lunch.firebasestorage.app",
    messagingSenderId: "227348367786",
    appId: "1:227348367786:web:eeb497ecbbe5bea8ca83d3"
  };
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'bear-joy-lunch-express';
const appId = String(rawAppId).replace(/\//g, '_');

const App = () => {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('order');
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);

  const getSafeStorage = (key, defaultVal) => {
    try { return localStorage.getItem(key) || defaultVal; } catch (e) { return defaultVal; }
  };

  const [userName, setUserName] = useState(() => getSafeStorage('bear_joy_name', ''));
  const [userExtension, setUserExtension] = useState(() => getSafeStorage('bear_joy_ext', ''));
  const [isAdmin, setIsAdmin] = useState(() => getSafeStorage('bear_joy_admin', 'false') === 'true');

  const [cart, setCart] = useState([]);
  const [cashGiven, setCashGiven] = useState('');
  const [rawMenuText, setRawMenuText] = useState('');
  const [notification, setNotification] = useState(null);
  const [expandedShops, setExpandedShops] = useState({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => getSafeStorage('bear_joy_dark', 'false') === 'true');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, type: '', label: '', data: null });
  const [editModal, setEditModal] = useState({ show: false, orderId: '', amount: '' });
  const [portalReceived, setPortalReceived] = useState(false);

  const [deadline, setDeadline] = useState("10:00");
  const [deadlineTimestamp, setDeadlineTimestamp] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // DinBenDon 自動化
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const [dbdSyncing, setDbdSyncing] = useState(false);
  const [dbdPushing, setDbdPushing] = useState(false);
  const [dbdResult, setDbdResult] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('bear_joy_name', userName);
      localStorage.setItem('bear_joy_ext', userExtension);
      localStorage.setItem('bear_joy_admin', isAdmin.toString());
      localStorage.setItem('bear_joy_dark', isDarkMode.toString());
    } catch (e) {}
  }, [userName, userExtension, isAdmin, isDarkMode]);

  const deadlineDate = useMemo(() => {
    // 優先用 DinBenDon 同步的完整時間戳記
    if (deadlineTimestamp) return new Date(deadlineTimestamp);
    try {
      const parts = (deadline || "10:00").split(':');
      const d = new Date(currentTime);
      d.setHours(parseInt(parts[0]) || 10, parseInt(parts[1]) || 0, 0, 0);
      return d;
    } catch (e) {
      const d = new Date(); d.setHours(10, 0, 0, 0); return d;
    }
  }, [deadlineTimestamp, deadline, currentTime.toDateString()]);

  const isTimeLocked = useMemo(() => {
    if (isAdmin) return false;
    return currentTime >= deadlineDate;
  }, [currentTime, deadlineDate, isAdmin]);

  const countdownText = useMemo(() => {
    const diff = deadlineDate.getTime() - currentTime.getTime();
    if (diff <= 0) return "00:00:00";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, [currentTime, deadlineDate]);

  const allOrdersTotalSum = useMemo(() => {
    return (orders || []).reduce((sum, o) => sum + (Number(o.price) || 0), 0);
  }, [orders]);

  const groupedStats = useMemo(() => {
    const groups = {};
    (orders || []).forEach(order => {
      const shop = order.shopName || "未知店家";
      if (!groups[shop]) groups[shop] = { items: {}, total: 0 };
      const processItem = (itemName) => {
        if (!groups[shop].items[itemName]) groups[shop].items[itemName] = { count: 0, names: [] };
        groups[shop].items[itemName].count += 1;
        groups[shop].items[itemName].names.push(order.userName || "匿名");
      };
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => processItem(item.name));
      } else {
        processItem(order.itemName || "未指定品項");
      }
      groups[shop].total += (Number(order.price) || 0);
    });
    return groups;
  }, [orders]);

  const menuByShop = useMemo(() => {
    const groups = {};
    (menu || []).forEach(item => {
      const shop = item.shopName || "未知店家";
      if (!groups[shop]) groups[shop] = [];
      groups[shop].push(item);
    });
    return groups;
  }, [menu]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth Fail:", err); }
      finally { setIsAuthLoading(false); }
    };
    initAuth();
    const unsubscribeAuth = onAuthStateChanged(auth, setUser);
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings');
    const unsubscribeConfig = onSnapshot(configRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setDeadline(data.deadline || "10:00");
        if (data.deadlineTimestamp) setDeadlineTimestamp(data.deadlineTimestamp);
      }
    });

    const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    const unsubscribeOrders = onSnapshot(ordersRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sortedData = data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setOrders(sortedData);

      const today = new Date().toISOString().split('T')[0];
      const staleOrders = sortedData.filter(o => {
        if (!o.createdAt) return false;
        const oDate = new Date(o.createdAt).toISOString().split('T')[0];
        return oDate !== today;
      });

      if (staleOrders.length > 0) {
        const batch = writeBatch(db);
        staleOrders.forEach(o => batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'orders', o.id)));
        batch.commit().then(() => showNotify("昨天的訂單已自動清除"));
      }
    });

    const menuRef = collection(db, 'artifacts', appId, 'public', 'data', 'menu');
    const unsubscribeMenu = onSnapshot(menuRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMenu(data);
      if (data.length > 0 && Object.keys(expandedShops).length === 0) {
        const shops = Array.from(new Set(data.map(m => m.shopName)));
        setExpandedShops({ [shops[0]]: true });
      }
    });

    return () => { unsubscribeConfig(); unsubscribeOrders(); unsubscribeMenu(); };
  }, [user]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#import=')) {
      try {
        const decoded = decodeURIComponent(escape(atob(hash.replace('#import=', ''))));
        if (decoded) {
          setRawMenuText(decoded); setActiveTab('admin'); setPortalReceived(true);
          window.history.replaceState(null, null, window.location.pathname);
          showNotify("已接收到外部菜單資料！");
        }
      } catch (e) { console.error("Portal Fail", e); }
    }
  }, []);

  const showNotify = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPassword === 'root123456') {
      setIsAdmin(true); setAdminPassword(''); setShowAdminLogin(false);
      showNotify("已切換管理員模式");
    } else { showNotify("密碼不正確"); }
  };

  const toggleAdminMode = () => {
    if (isAdmin) { setIsAdmin(false); showNotify("已關閉管理模式"); }
    else { setShowAdminLogin(true); }
  };

  const updateDeadline = async (newTime) => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), { deadline: newTime }, { merge: true });
      showNotify(`截止時間已更新為 ${newTime}`);
    } catch (e) { showNotify("儲存失敗"); }
  };

  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const addToCart = (item) => {
    if (isTimeLocked) return showNotify("已超過截止時間，無法點餐");
    if (cart.length > 0 && cart[0].shopName !== item.shopName) {
      showNotify(`每次只能點同一家：${cart[0].shopName}`); return;
    }
    setCart([...cart, { ...item, cartId: Date.now() + Math.random() }]);
    showNotify(`已加入 ${item.name}`);
  };

  const handleAddOrder = async () => {
    if (isTimeLocked) return showNotify("已超過截止時間");
    if (!userName || !userExtension || cart.length === 0 || !user) return;
    const amountDue = cart.reduce((s, i) => s + (i.price || 0), 0);
    const paid = parseFloat(cashGiven) || 0;
    const combinedNames = cart.map(i => i.name).join(' + ');

    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), {
      userName, extensionId: userExtension, shopName: cart[0].shopName, itemName: combinedNames,
      items: cart.map(i => ({ name: i.name, price: i.price })),
      price: amountDue, paidAmount: paid, change: paid > amountDue ? paid - amountDue : 0,
      isPaid: false, isChangeGiven: false, createdAt: Date.now(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    setCart([]); setCashGiven(''); showNotify('已送出點餐！');
  };

  const handleParseText = async () => {
    if (!rawMenuText.trim() || !user) return;
    setIsSyncing(true);
    try {
      const batch = writeBatch(db);
      let count = 0;
      const lines = rawMenuText.split('\n');
      let currentShop = "未知店家";
      lines.forEach(line => {
        let trimmed = line.trim(); if (!trimmed) return;
        const shopMatch = trimmed.match(/訂購\s+([^\(\s\n評比]+)/);
        if (shopMatch) { currentShop = shopMatch[1].trim(); return; }
        const sameLineMatch = trimmed.match(/^(.*?)[\s\t]+(\d{1,3})\s*元?\s*$/);
        if (sameLineMatch) {
          const name = sameLineMatch[1].trim();
          const price = parseInt(sameLineMatch[2]);
          batch.set(doc(collection(db, 'artifacts', appId, 'public', 'data', 'menu')), { shopName: currentShop, name, price, createdAt: Date.now() });
          count++;
        }
      });
      await batch.commit();
      if (count > 0) { setRawMenuText(''); setPortalReceived(false); setActiveTab('order'); showNotify(`已匯入 ${count} 個品項`); }
      else { showNotify('格式無法辨識，請確認內容'); }
    } catch (err) { showNotify("匯入失敗"); }
    finally { setIsSyncing(false); }
  };

  const executeClearCloud = async (type) => {
    setConfirmModal({ show: false, type: '', label: '', data: null });
    setIsSyncing(true);
    try {
      const data = type === 'orders' ? orders : menu;
      const batch = writeBatch(db);
      data.forEach(item => batch.delete(doc(db, 'artifacts', appId, 'public', 'data', type, item.id)));
      await batch.commit();
      showNotify("已清除完畢");
    } catch (e) {}
    finally { setIsSyncing(false); }
  };

  const copySummaryForMagic = async (shopName, data) => {
    try {
      const dataStr = Object.entries(data.items).map(([itemName, details]) => {
        return `${itemName}:${details.count}:${details.names.join(' ')}`;
      }).join(',');
      await navigator.clipboard.writeText(dataStr);
      showNotify(`已複製「${shopName}」的統計資料`);
    } catch (e) { showNotify("複製失敗"); }
  };

  const handleEditOrder = async () => {
    if (!editModal.orderId) return;
    try {
      const paid = parseFloat(editModal.amount) || 0;
      const order = orders.find(o => o.id === editModal.orderId);
      if (!order) return;
      const change = paid > order.price ? paid - order.price : 0;
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', editModal.orderId), {
        paidAmount: paid, change
      });
      setEditModal({ show: false, orderId: '', amount: '' });
      showNotify("已更新");
    } catch (e) { showNotify("更新失敗"); }
  };

  // ── DinBenDon API handlers ──
  const handleSyncMenu = async () => {
    setDbdSyncing(true); setDbdResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/sync-menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clear: true })
      });
      const data = await res.json();
      setDbdResult({ type: 'sync', ...data });
      if (data.success) showNotify(data.message);
      else showNotify(`同步失敗：${data.message}`);
    } catch (e) {
      setDbdResult({ type: 'sync', success: false, message: '無法連線到 API Server，請確認 server.mjs 是否啟動' });
      showNotify('API Server 無回應');
    } finally { setDbdSyncing(false); }
  };

  const handlePushOrders = async () => {
    setDbdPushing(true); setDbdResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/push-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setDbdResult({ type: 'push', ...data });
      if (data.success) showNotify(data.message);
      else showNotify(`推送失敗：${data.message}`);
    } catch (e) {
      setDbdResult({ type: 'push', success: false, message: '無法連線到 API Server，請確認 server.mjs 是否啟動' });
      showNotify('API Server 無回應');
    } finally { setDbdPushing(false); }
  };

  // ── Theme helpers ──
  const bg = isDarkMode ? 'bg-zinc-900' : 'bg-orange-50';
  const cardBg = isDarkMode ? 'bg-zinc-800/80' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-zinc-700/50' : 'border-zinc-200/60';
  const inputBg = isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'bg-zinc-50 border-zinc-200 text-zinc-800';
  const textPrimary = isDarkMode ? 'text-zinc-100' : 'text-zinc-800';
  const textSecondary = isDarkMode ? 'text-zinc-400' : 'text-zinc-500';
  const accent = 'text-orange-600';
  const accentBg = 'bg-orange-600';
  const accentLight = isDarkMode ? 'bg-orange-500/10' : 'bg-orange-50';

  if (isAuthLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bg} ${textPrimary}`}>
        <div className="text-center">
          <Loader2 className="text-orange-500 animate-spin mx-auto mb-4" size={36} />
          <p className={`text-sm ${textSecondary}`}>載入中...</p>
        </div>
      </div>
    );
  }

  const cartTotal = cart.reduce((s, i) => s + (Number(i.price) || 0), 0);

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${bg} ${textPrimary}`}>

      {/* Loading overlay */}
      {isSyncing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`${cardBg} rounded-2xl p-8 shadow-xl flex flex-col items-center gap-3`}>
            <Loader2 className="text-orange-500 animate-spin" size={32} />
            <p className="text-sm font-medium">處理中...</p>
          </div>
        </div>
      )}

      {/* Admin login modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${cardBg} border ${cardBorder} p-6 rounded-2xl shadow-xl w-full max-w-sm`}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold">管理員登入</h3>
              <button onClick={() => setShowAdminLogin(false)} className={`p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 ${textSecondary}`}><X size={18} /></button>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <input autoFocus type="password" placeholder="輸入管理密碼" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-orange-500/40 ${inputBg}`} />
              <button type="submit" className={`w-full py-3 ${accentBg} text-white rounded-xl font-semibold hover:bg-orange-700 transition-colors`}>登入</button>
            </form>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal.show && (
        <div className="fixed inset-0 z-[140] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${cardBg} border ${cardBorder} rounded-2xl p-6 max-w-sm w-full shadow-xl text-center`}>
            <RotateCcw size={24} className="mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-bold mb-1">確認操作</h3>
            <p className={`text-sm mb-6 ${textSecondary}`}>確定要清除「{confirmModal.label}」嗎？此操作無法復原。</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal({ show: false, type: '', label: '', data: null })} className={`flex-1 py-3 rounded-xl font-medium border ${cardBorder} ${isDarkMode ? 'bg-zinc-700' : 'bg-zinc-50'}`}>取消</button>
              <button onClick={() => { if(confirmModal.type.includes('orders') || confirmModal.type.includes('menu')) executeClearCloud(confirmModal.type); else if(confirmModal.type === 'delete_single') deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', confirmModal.data)).then(()=>showNotify("已刪除")); setConfirmModal({show:false}); }} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors">確定清除</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal.show && (
        <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${cardBg} border ${cardBorder} p-6 rounded-2xl shadow-xl w-full max-w-sm`}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold">修改付款金額</h3>
              <button onClick={() => setEditModal({ show: false, orderId: '', amount: '' })} className={`p-1 rounded-lg ${textSecondary}`}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <input autoFocus type="number" placeholder="實付金額" value={editModal.amount} onChange={(e) => setEditModal(prev => ({ ...prev, amount: e.target.value }))} className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-orange-500/40 ${inputBg}`} />
              <button onClick={handleEditOrder} className={`w-full py-3 ${accentBg} text-white rounded-xl font-semibold hover:bg-orange-700 transition-colors`}>儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* Notification toast */}
      {notification && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[160] bg-zinc-800 text-white px-5 py-2.5 rounded-full shadow-lg text-sm font-medium animate-in slide-in-from-top-2">
          {notification}
        </div>
      )}

      {/* ─── Header ─── */}
      <header className={`sticky top-0 z-50 border-b backdrop-blur-lg transition-colors ${isDarkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/90 border-zinc-100'}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🍱</span>
            <h1 className="text-base font-bold tracking-tight">熊樂子午餐</h1>
          </div>
          <div className="flex items-center gap-2">
            <nav className={`flex p-1 rounded-lg ${isDarkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
              {[
                { id: 'order', label: '點餐', icon: UtensilsCrossed },
                { id: 'summary', label: '統整', icon: ClipboardList },
                { id: 'admin', label: '設定', icon: Settings },
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === tab.id ? `${accentBg} text-white` : `${textSecondary} hover:${textPrimary}`}`}>
                  <tab.icon size={14} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-zinc-800' : 'hover:bg-zinc-100'} ${textSecondary}`}>
              {isDarkMode ? <Sun size={16}/> : <Moon size={16}/>}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* ════════ 點餐 Tab ════════ */}
        {activeTab === 'order' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left column: countdown + order form */}
            <div className="lg:col-span-5 space-y-5">

              {/* Countdown */}
              <div className={`rounded-2xl border p-4 ${cardBorder} ${isTimeLocked ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800/50' : `${accentLight} ${isDarkMode ? 'border-orange-800/30' : 'border-orange-200'}`}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isTimeLocked ? <Ban size={16} className="text-red-500" /> : <Clock size={16} className={accent} />}
                    <span className={`text-sm font-semibold ${isTimeLocked ? 'text-red-600 dark:text-red-400' : accent}`}>
                      {isTimeLocked ? '已截止' : `截止 ${deadlineDate.getMonth()+1}/${deadlineDate.getDate()} ${deadline}`}
                    </span>
                  </div>
                  <span className={`text-xs ${textSecondary}`}>{currentTime.toLocaleTimeString([], { hour12: false })}</span>
                </div>
                <div className={`text-3xl font-bold tabular-nums tracking-tight text-center py-1 ${isTimeLocked ? 'text-red-500 dark:text-red-400' : accent}`}>
                  {countdownText}
                </div>
                {isTimeLocked && <p className={`text-xs text-center mt-1 text-red-500/70`}>今日點餐已截止</p>}
              </div>

              {/* Order form */}
              <div className={`rounded-2xl border p-5 ${cardBg} ${cardBorder}`}>
                <h2 className={`text-base font-bold mb-4 flex items-center gap-2 ${accent}`}>
                  <Plus size={18} /> 我要點餐
                </h2>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className={`text-xs font-medium mb-1 block ${textSecondary}`}>姓名</label>
                    <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="你的名字" className={`w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-orange-500/30 ${inputBg}`} />
                  </div>
                  <div>
                    <label className={`text-xs font-medium mb-1 block ${textSecondary}`}>分機</label>
                    <input type="text" value={userExtension} onChange={(e) => setUserExtension(e.target.value)} placeholder="分機號碼" className={`w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-orange-500/30 ${inputBg}`} />
                  </div>
                </div>

                {/* Menu list */}
                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
                  {Object.entries(menuByShop).length === 0 ? (
                    <div className={`text-center py-16 ${textSecondary} text-sm`}>
                      <UtensilsCrossed size={24} className="mx-auto mb-2 opacity-30" />
                      尚未匯入菜單
                    </div>
                  ) : (
                    Object.entries(menuByShop).map(([shopName, items]) => (
                      <div key={shopName} className={`border rounded-xl overflow-hidden ${cardBorder}`}>
                        <button onClick={() => setExpandedShops(p => ({ ...p, [shopName]: !p[shopName] }))}
                          className={`w-full px-4 py-3 flex justify-between items-center text-sm font-semibold transition-colors ${
                            expandedShops[shopName]
                              ? `${accentBg} text-white`
                              : `${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-750 text-zinc-300' : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700'}`
                          }`}>
                          <div className="flex items-center gap-2">
                            <Store size={14} />
                            {shopName}
                          </div>
                          {expandedShops[shopName] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {expandedShops[shopName] && (
                          <div className="p-1.5 space-y-1">
                            {items.map(item => (
                              <button key={item.id} onClick={() => addToCart(item)}
                                className={`w-full px-3 py-2.5 rounded-lg border flex justify-between items-center text-sm transition-colors ${
                                  isDarkMode ? 'border-zinc-700 hover:border-orange-600/40 hover:bg-orange-500/5' : 'border-zinc-100 hover:border-orange-300 hover:bg-orange-50'
                                } ${isTimeLocked ? 'opacity-40 cursor-not-allowed' : ''}`}>
                                <span className="font-medium">{item.name}</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs ${textSecondary}`}>${item.price}</span>
                                  <Plus size={14} className="text-orange-500" />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Cart */}
                {cart.length > 0 && (
                  <div className={`mt-4 p-4 rounded-xl border-2 border-dashed ${isDarkMode ? 'border-orange-600/30 bg-orange-500/5' : 'border-orange-300/50 bg-orange-50/50'}`}>
                    <div className="flex justify-between items-center mb-3">
                      <div className={`flex items-center gap-1.5 text-xs font-semibold ${accent}`}>
                        <ShoppingCart size={13} /> 已選 {cart.length} 項
                      </div>
                      <button onClick={() => setCart([])} className={`text-xs ${textSecondary} hover:text-red-500`}>清空</button>
                    </div>
                    <div className="space-y-1.5 mb-3">
                      {cart.map((item) => (
                        <div key={item.cartId} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => removeFromCart(item.cartId)} className="text-red-400 hover:text-red-500"><Minus size={13} /></button>
                            <span>{item.name}</span>
                          </div>
                          <span className={`text-xs ${textSecondary}`}>${item.price}</span>
                        </div>
                      ))}
                    </div>
                    <div className={`flex justify-between items-center pt-2 border-t ${isDarkMode ? 'border-zinc-700' : 'border-orange-200/50'}`}>
                      <span className={`text-xs font-medium ${textSecondary}`}>小計</span>
                      <span className={`text-lg font-bold ${accent}`}>${cartTotal}</span>
                    </div>

                    {/* Change calculator */}
                    <div className="mt-3 pt-3 border-t border-dashed border-orange-200/30">
                      <label className={`text-xs mb-1.5 block ${textSecondary}`}>找零計算（選填）</label>
                      <input type="number" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} placeholder="你付多少？" className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-orange-500/30 ${inputBg}`} />
                      {cashGiven && parseFloat(cashGiven) >= cartTotal && (
                        <div className={`mt-2 flex justify-between items-center ${accent}`}>
                          <span className="text-xs">應找</span>
                          <span className="text-xl font-bold">${(parseFloat(cashGiven) - cartTotal).toFixed(0)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <button onClick={handleAddOrder} disabled={!userName || !userExtension || cart.length === 0 || isTimeLocked}
                  className={`w-full mt-4 py-3 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors ${
                    isTimeLocked || !userName || !userExtension || cart.length === 0
                      ? 'bg-zinc-300 dark:bg-zinc-700 cursor-not-allowed text-zinc-500'
                      : `${accentBg} hover:bg-orange-700`
                  }`}>
                  <Send size={16} />
                  {isTimeLocked ? "已截止" : "送出點餐"}
                </button>
              </div>
            </div>

            {/* Right column: live orders */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className={`text-base font-bold flex items-center gap-2 ${accent}`}>
                  <Users size={18}/> 今日點餐
                </h2>
                <span className={`text-xs px-2.5 py-1 rounded-full ${isDarkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'}`}>
                  {orders.length} 筆
                </span>
              </div>

              {orders.length === 0 ? (
                <div className={`py-24 rounded-2xl border-2 border-dashed ${cardBorder} flex flex-col items-center justify-center ${textSecondary}`}>
                  <UtensilsCrossed size={32} className="mb-3 opacity-20" />
                  <p className="text-sm">還沒有人點餐</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {orders.map(order => {
                    const isMyOrder = order.extensionId === userExtension && userExtension !== '';
                    const canModify = isAdmin || (isMyOrder && !order.isPaid);
                    return (
                      <div key={order.id} className={`p-4 rounded-xl border transition-colors group relative ${cardBg} ${cardBorder} hover:shadow-md`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-full ${accentBg} text-white flex items-center justify-center text-sm font-bold shrink-0`}>
                            {order.userName?.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-semibold text-sm">{order.userName}</span>
                              {isMyOrder && <UserCheck size={12} className="text-emerald-500" />}
                              <span className={`text-xs ${textSecondary}`}>#{order.extensionId}</span>
                            </div>
                            <p className={`text-xs ${textSecondary} mb-1.5`}>{order.shopName}</p>
                            <p className="text-sm truncate mb-2">{order.itemName}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-sm">${order.price}</span>
                              {order.change > 0 && (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${order.isChangeGiven ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                  找 ${order.change}
                                </span>
                              )}
                              {order.isPaid && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">已付</span>}
                              {order.isChangeGiven && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">已找</span>}
                            </div>
                          </div>
                        </div>
                        {canModify && (
                          <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditModal({ show: true, orderId: order.id, amount: order.paidAmount })} className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-zinc-700' : 'hover:bg-zinc-100'} ${textSecondary}`}><Edit3 size={13}/></button>
                            <button onClick={() => setConfirmModal({ show: true, type: 'delete_single', label: '此筆訂單', data: order.id })} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 dark:hover:bg-red-900/30"><Trash2 size={13}/></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════ 統整 Tab ════════ */}
        {activeTab === 'summary' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Summary */}
            <section className={`lg:col-span-7 rounded-2xl border p-6 ${cardBg} ${cardBorder}`}>
              <h2 className={`text-lg font-bold mb-6 flex items-center gap-2 ${accent}`}>
                <ClipboardList size={20} /> 採購匯總
              </h2>
              {Object.keys(groupedStats).length === 0 ? (
                <div className={`py-20 flex flex-col items-center justify-center ${textSecondary}`}>
                  <UtensilsCrossed size={28} className="mb-3 opacity-20" />
                  <span className="text-sm">今天還沒有訂單</span>
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.entries(groupedStats).map(([shopName, data]) => (
                    <div key={shopName}>
                      <div className={`flex justify-between items-center mb-3 pb-2 border-b ${isDarkMode ? 'border-zinc-700' : 'border-zinc-100'}`}>
                        <div className="flex items-center gap-2">
                          <Store size={16} className={accent} />
                          <h3 className="font-bold">{shopName}</h3>
                        </div>
                        <button onClick={() => copySummaryForMagic(shopName, data)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${accentBg} text-white hover:bg-orange-700 transition-colors`}>
                          <Zap size={11} /> 複製
                        </button>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(data.items).map(([itemName, details]) => (
                          <div key={itemName} className={`flex justify-between items-center p-3 rounded-lg ${isDarkMode ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                            <div>
                              <span className="text-sm font-medium">{itemName}</span>
                              <div className={`text-xs mt-0.5 ${textSecondary}`}>{details.names?.join('、')}</div>
                            </div>
                            <span className={`${accentBg} text-white px-3 py-1 rounded-lg text-sm font-bold min-w-[2.5rem] text-center`}>{details.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className={`pt-4 mt-4 border-t flex justify-between items-end ${isDarkMode ? 'border-zinc-700' : 'border-zinc-200'}`}>
                    <span className={`text-sm font-medium ${textSecondary}`}>總計</span>
                    <span className={`text-3xl font-bold ${accent}`}>${allOrdersTotalSum}</span>
                  </div>
                </div>
              )}
            </section>

            {/* Payment tracking */}
            <section className={`lg:col-span-5 rounded-2xl border p-6 ${cardBg} ${cardBorder}`}>
              <div className="flex justify-between items-center mb-5">
                <h2 className={`text-lg font-bold flex items-center gap-2 ${accent}`}>
                  <DollarSign size={20}/> 對帳
                </h2>
                <button onClick={toggleAdminMode} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  isAdmin
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : `${cardBorder} ${textSecondary} hover:border-orange-300`
                }`}>
                  {isAdmin ? <Unlock size={12}/> : <Lock size={12}/>}
                  {isAdmin ? '管理中' : '解鎖'}
                </button>
              </div>
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                {orders.length === 0 ? (
                  <p className={`text-center py-16 text-sm ${textSecondary}`}>等待訂單...</p>
                ) : (
                  orders.map(order => (
                    <div key={order.id} className={`p-4 rounded-xl border ${cardBorder} ${isDarkMode ? 'bg-zinc-800/30' : 'bg-zinc-50/50'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-semibold text-sm">{order.userName}</div>
                          <div className={`text-xs ${textSecondary}`}>#{order.extensionId}</div>
                        </div>
                        <span className="font-bold text-sm">${order.price}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => isAdmin && updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id), { isPaid: !order.isPaid })}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                            order.isPaid
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50'
                              : 'bg-red-50 text-red-500 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50'
                          } ${!isAdmin ? 'cursor-default' : 'hover:opacity-80'}`}>
                          {order.isPaid ? '已收款 ✓' : '未收款'}
                        </button>
                        {order.change > 0 && (
                          <button onClick={() => isAdmin && updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id), { isChangeGiven: !order.isChangeGiven })}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                              order.isChangeGiven
                                ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50'
                                : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50'
                            } ${!isAdmin ? 'cursor-default' : 'hover:opacity-80'}`}>
                            {order.isChangeGiven ? '已找零 ✓' : `待找 $${order.change}`}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {/* ════════ 設定 Tab ════════ */}
        {activeTab === 'admin' && (
          <div className="max-w-2xl mx-auto space-y-5">

            {/* Deadline config */}
            <section className={`rounded-2xl border p-5 ${cardBg} ${cardBorder}`}>
              <h2 className={`text-base font-bold mb-4 flex items-center gap-2 ${accent}`}>
                <Clock size={16} /> 截止時間
              </h2>
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${inputBg}`}>
                <span className="text-lg font-semibold">{deadline}</span>
                <span className={`text-xs ${textSecondary}`}>（同步菜單時自動從 DinBenDon 取得）</span>
              </div>
              {isAdmin && (
                <div className="mt-3 flex items-center gap-3">
                  <input type="time" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                    className={`flex-1 px-4 py-2.5 rounded-xl border outline-none text-sm ${inputBg} focus:ring-2 focus:ring-orange-500/30`} />
                  <button onClick={() => updateDeadline(deadline)} className={`px-4 py-2.5 ${accentBg} text-white rounded-xl text-sm font-medium hover:bg-orange-700 transition-colors`}>
                    手動覆蓋
                  </button>
                </div>
              )}
            </section>

            {/* DinBenDon info */}
            <section className={`rounded-2xl border p-5 ${cardBg} ${cardBorder}`}>
              <h2 className={`text-base font-bold mb-4 flex items-center gap-2 ${accent}`}>
                <ExternalLink size={16} /> DinBenDon 帳號
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {['帳號', '密碼'].map(label => (
                  <button key={label} onClick={() => { navigator.clipboard.writeText('26522689'); showNotify(`${label}已複製`); }}
                    className={`p-4 rounded-xl border text-left transition-colors group ${cardBorder} ${isDarkMode ? 'hover:border-orange-600/40' : 'hover:border-orange-300 hover:bg-orange-50/50'}`}>
                    <div className={`text-xs mb-1 ${textSecondary}`}>{label}</div>
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-semibold">26522689</span>
                      <Copy size={14} className={`${textSecondary} opacity-0 group-hover:opacity-100 transition-opacity`} />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* DinBenDon 自動化 */}
            <section className={`rounded-2xl border p-5 ${cardBg} ${cardBorder}`}>
              <h2 className={`text-base font-bold mb-4 flex items-center gap-2 ${accent}`}>
                <Zap size={16} /> DinBenDon 自動化
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button onClick={handleSyncMenu} disabled={dbdSyncing}
                  className={`flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold transition-colors border-2 ${
                    dbdSyncing ? 'opacity-60 cursor-wait' : ''
                  } ${isDarkMode ? 'border-orange-600/40 text-orange-400 hover:bg-orange-500/10' : 'border-orange-300 text-orange-700 hover:bg-orange-50'}`}>
                  {dbdSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {dbdSyncing ? '同步中...' : '同步菜單'}
                </button>
                <button onClick={handlePushOrders} disabled={dbdPushing}
                  className={`flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white transition-colors ${
                    dbdPushing ? 'opacity-60 cursor-wait' : ''
                  } ${accentBg} hover:bg-orange-700`}>
                  {dbdPushing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {dbdPushing ? '推送中...' : '推送訂單到 DinBenDon'}
                </button>
              </div>
              <p className={`text-xs mt-3 ${textSecondary}`}>
                同步菜單：從 DinBenDon 拉取最新菜單 → 推送訂單：將今天的點餐送上 DinBenDon
              </p>
              {dbdResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm flex items-start gap-2 ${
                  dbdResult.success
                    ? (isDarkMode ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-800/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200')
                    : (isDarkMode ? 'bg-red-900/20 text-red-400 border border-red-800/30' : 'bg-red-50 text-red-700 border border-red-200')
                }`}>
                  {dbdResult.success ? <CheckCircle size={16} className="shrink-0 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 mt-0.5" />}
                  <div>
                    <div className="font-medium">{dbdResult.message}</div>
                    {dbdResult.results && (
                      <div className={`mt-1.5 text-xs ${textSecondary}`}>
                        {dbdResult.results.map((r, i) => (
                          <div key={i}>{r.status === 'ok' ? '✓' : '✗'} {r.user}: {r.items?.join(', ') || r.reason}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Menu import */}
            <section className={`rounded-2xl border p-5 ${cardBg} ${cardBorder}`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-base font-bold flex items-center gap-2 ${accent}`}>
                  <ClipboardList size={16} /> 手動匯入菜單
                </h2>
                <a href="https://dinbendon.net/do/" target="_blank" rel="noreferrer" className={`flex items-center gap-1 text-xs ${accent} hover:underline`}>
                  DinBenDon <ExternalLink size={11} />
                </a>
              </div>
              {portalReceived && (
                <div className={`mb-3 p-3 rounded-lg text-sm ${isDarkMode ? 'bg-orange-500/10 text-orange-400' : 'bg-orange-50 text-orange-700'} border ${isDarkMode ? 'border-orange-800/30' : 'border-orange-200'}`}>
                  已接收到外部資料，按下方按鈕匯入。
                </div>
              )}
              <textarea rows="6" value={rawMenuText} onChange={(e) => setRawMenuText(e.target.value)} placeholder={"貼上菜單內容...\n格式：品名 [空格] 價格\n（會自動偵測店家名稱）"}
                className={`w-full px-4 py-3 rounded-xl border outline-none text-sm font-mono focus:ring-2 focus:ring-orange-500/30 ${inputBg}`} />
              <button onClick={handleParseText} className={`w-full mt-3 py-3 text-white rounded-xl font-semibold transition-colors ${portalReceived ? 'bg-emerald-600 hover:bg-emerald-700' : `${accentBg} hover:bg-orange-700`}`}>
                匯入菜單
              </button>

              {isAdmin && (
                <div className={`mt-6 pt-5 border-t ${isDarkMode ? 'border-zinc-700' : 'border-zinc-100'} grid grid-cols-2 gap-3`}>
                  <button onClick={() => setConfirmModal({show:true, type:'orders', label:'今日訂單'})} className="py-3 border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-800/50 dark:hover:bg-red-900/20 rounded-xl text-xs font-medium">
                    清空今日訂單
                  </button>
                  <button onClick={() => setConfirmModal({show:true, type:'menu', label:'全部菜單'})} className={`py-3 border rounded-xl text-xs font-medium ${cardBorder} ${textSecondary} ${isDarkMode ? 'hover:bg-zinc-700' : 'hover:bg-zinc-50'}`}>
                    清空菜單
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className={`py-10 text-center ${textSecondary}`}>
        <p className="text-xs">Bear Joy Lunch &middot; 熊樂子午餐</p>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #ea580c; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #c2410c; }
      `}</style>
    </div>
  );
};

export default App;
