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
  Truck, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  CircleDollarSign,
  Moon,
  Sun,
  Wind,
  ExternalLink,
  Copy,
  PlusCircle,
  Layers,
  Store,
  ChevronDown,
  ChevronUp,
  Cloud,
  RotateCcw,
  Loader2,
  Lock,
  Unlock,
  X,
  ShoppingCart,
  Minus,
  CheckCircle,
  Users,
  Edit3,
  UserCheck,
  Zap,
  Info,
  RefreshCw,
  Clock,
  AlertTriangle,
  Timer,
  Save,
  Coffee
} from 'lucide-react';

/**
 * --- 雲端對接憑證 ---
 */
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
  // --- 1. 狀態管理 ---
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
  const [isDarkMode, setIsDarkMode] = useState(() => getSafeStorage('bear_joy_dark', 'true') === 'true');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, type: '', label: '', data: null });
  const [editModal, setEditModal] = useState({ show: false, orderId: '', amount: '' });
  const [portalReceived, setPortalReceived] = useState(false);
  
  const [deadline, setDeadline] = useState("10:00");
  const [currentTime, setCurrentTime] = useState(new Date());

  // --- 2. 持久化與時鐘 ---
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

  // --- 3. 時空計算結晶 ---
  
  const deadlineDate = useMemo(() => {
    try {
      const parts = (deadline || "10:00").split(':');
      const d = new Date(currentTime);
      d.setHours(parseInt(parts[0]) || 10, parseInt(parts[1]) || 0, 0, 0);
      return d;
    } catch (e) {
      const d = new Date(); d.setHours(10, 0, 0, 0); return d;
    }
  }, [deadline, currentTime.toDateString()]);

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

  // --- 4. 數據統計邏輯 (核心加固) ---

  const allOrdersTotalSum = useMemo(() => {
    return (orders || []).reduce((sum, o) => sum + (Number(o.price) || 0), 0);
  }, [orders]);

  const groupedStats = useMemo(() => {
    const groups = {};
    (orders || []).forEach(order => {
      const shop = order.shopName || "未知店家";
      if (!groups[shop]) groups[shop] = { items: {}, total: 0 };
      
      const processItem = (itemName) => {
        if (!groups[shop].items[itemName]) {
          groups[shop].items[itemName] = { count: 0, names: [] };
        }
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

  // --- 5. Firebase 初始化與監聽 ---

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
      if (snap.exists()) setDeadline(snap.data().deadline || "10:00");
    });

    const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    const unsubscribeOrders = onSnapshot(ordersRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sortedData = data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setOrders(sortedData);
      
      // 晨曦重置：日期格式標準化 (YYYY-MM-DD)
      const today = new Date().toISOString().split('T')[0];
      const staleOrders = sortedData.filter(o => {
        if (!o.createdAt) return false;
        const oDate = new Date(o.createdAt).toISOString().split('T')[0];
        return oDate !== today;
      });

      if (staleOrders.length > 0) {
        const batch = writeBatch(db);
        staleOrders.forEach(o => batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'orders', o.id)));
        batch.commit().then(() => showNotify("🌄 撥開昨天的白霧，數據已重置。"));
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

  // 傳送門
  useEffect(() => {
    const handlePortal = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#import=')) {
        try {
          const decoded = decodeURIComponent(escape(atob(hash.replace('#import=', ''))));
          if (decoded) {
            setRawMenuText(decoded); setActiveTab('admin'); setPortalReceived(true);
            window.history.replaceState(null, null, window.location.pathname);
            showNotify("🔮 傳送門已結晶官網數據！");
          }
        } catch (e) { console.error("Portal Fail", e); }
      }
    };
    handlePortal();
  }, []);

  // --- 6. 業務邏輯 ---
  const showNotify = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPassword === 'root123456') {
      setIsAdmin(true); setAdminPassword(''); setShowAdminLogin(false);
      showNotify("管理員權限解鎖");
    } else { showNotify("密碼不正確"); }
  };

  const toggleAdminMode = () => {
    if (isAdmin) { setIsAdmin(false); showNotify("管理模式關閉"); }
    else { setShowAdminLogin(true); }
  };

  const updateDeadline = async (newTime) => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), { deadline: newTime }, { merge: true });
      showNotify(`結單時間設為 ${newTime}`);
    } catch (e) { showNotify("雲端同步失敗"); }
  };

  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const addToCart = (item) => {
    if (isTimeLocked) return showNotify("抱歉，今日採購已結單");
    if (cart.length > 0 && cart[0].shopName !== item.shopName) {
      showNotify(`一次委託限同一店家：${cart[0].shopName}`); return;
    }
    setCart([...cart, { ...item, cartId: Date.now() + Math.random() }]);
    showNotify(`已加入：${item.name}`);
  };

  const handleAddOrder = async () => {
    if (isTimeLocked) return showNotify("截止時間已過");
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
    setCart([]); setCashGiven(''); showNotify('點餐委託已送達雲端');
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
      if (count > 0) { setRawMenuText(''); setPortalReceived(false); setActiveTab('order'); showNotify(`成功同步 ${count} 個品項`); }
      else { showNotify('未能辨識餐點'); }
    } catch (err) { showNotify("同步失敗"); }
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
      showNotify("數據已歸於純淨");
    } catch (e) {}
    finally { setIsSyncing(false); }
  };

  const copySummaryForMagic = async (shopName, data) => {
    try {
      const dataStr = Object.entries(data.items).map(([itemName, details]) => {
        return `${itemName}:${details.count}:${details.names.join(' ')}`;
      }).join(',');
      await navigator.clipboard.writeText(dataStr);
      showNotify(`「${shopName}」數據已結晶，包含名單！`);
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
      showNotify("訂單已更新");
    } catch (e) { showNotify("更新失敗"); }
  };

  // --- 7. 防崩潰攔截 ---
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
        <Loader2 className="text-blue-500 animate-spin mb-6" size={60} />
        <p className="font-black tracking-[0.5em] text-xs uppercase animate-pulse">正在穿透白霧中...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans transition-all duration-500 selection:bg-blue-500/30 ${isDarkMode ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-800'}`}>
      
      {isSyncing && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xl">
          <Loader2 className="text-blue-500 animate-spin" size={60} /><p className="mt-8 text-sm font-black tracking-widest">正在構築秩序中...</p>
        </div>
      )}

      {showAdminLogin && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} p-10 rounded-[2.5rem] shadow-2xl w-full max-sm:p-6 max-w-sm border`}>
            <div className="flex justify-between items-center mb-8"><h3 className="text-xl font-black">管理權限解鎖</h3><button onClick={() => setShowAdminLogin(false)}><X /></button></div>
            <form onSubmit={handleAdminLogin} className="space-y-6">
              <input autoFocus type="password" placeholder="管理密碼" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className={`w-full px-6 py-4 rounded-2xl border outline-none ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200 focus:ring-2 focus:ring-blue-500'}`} />
              <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all">進入</button>
            </form>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} rounded-[2.5rem] p-10 max-w-sm w-full border text-center shadow-xl`}>
            <RotateCcw size={32} className="mx-auto mb-6 text-red-500" /><h3 className="text-xl font-black mb-2">確認執行</h3><p className="text-sm opacity-60 mb-8">確定要對「{confirmModal.label}」執行操作嗎？</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal({ show: false, type: '', label: '', data: null })} className={`flex-1 py-4 rounded-2xl font-bold ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>取消</button>
              <button onClick={() => { if(confirmModal.type.includes('orders') || confirmModal.type.includes('menu')) executeClearCloud(confirmModal.type); else if(confirmModal.type === 'delete_single') deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', confirmModal.data)).then(()=>showNotify("訂單已移除")); setConfirmModal({show:false}); }} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold">確定執行</button>
            </div>
          </div>
        </div>
      )}

      {editModal.show && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} p-10 rounded-[2.5rem] shadow-2xl w-full max-sm:p-6 max-w-sm border`}>
            <div className="flex justify-between items-center mb-8"><h3 className="text-xl font-black">編輯付款金額</h3><button onClick={() => setEditModal({ show: false, orderId: '', amount: '' })}><X /></button></div>
            <div className="space-y-6">
              <input autoFocus type="number" placeholder="實付金額" value={editModal.amount} onChange={(e) => setEditModal(prev => ({ ...prev, amount: e.target.value }))} className={`w-full px-6 py-4 rounded-2xl border outline-none ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200 focus:ring-2 focus:ring-blue-500'}`} />
              <button onClick={handleEditOrder} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all">儲存</button>
            </div>
          </div>
        </div>
      )}

      <header className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-all ${isDarkMode ? 'bg-slate-950/80 border-slate-800/50 shadow-blue-900/10' : 'bg-white/80 border-slate-200 shadow-sm'}`}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 group">
            <div className="p-2.5 bg-blue-600 rounded-2xl text-white shadow-lg transition-transform group-hover:scale-110"><Truck size={24}/></div>
            <h1 className="text-xl font-black tracking-tight italic font-serif">熊樂子的午餐快車</h1>
          </div>
          <div className="flex items-center gap-3">
            <nav className={`flex gap-1 p-1.5 rounded-2xl border transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200 shadow-inner'}`}>
              {[{ id: 'order', label: '點餐' }, { id: 'summary', label: '統整' }, { id: 'admin', label: '設定' }].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-400'}`}>{tab.label}</button>
              ))}
            </nav>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-3 rounded-2xl border hover:bg-blue-500/10 transition-all">{isDarkMode ? <Sun size={20}/> : <Moon size={20}/>}</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {notification && <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[160] bg-blue-600 text-white px-8 py-3 rounded-full shadow-2xl text-sm font-black animate-in slide-in-from-top-4">{notification}</div>}

        {activeTab === 'admin' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
            <section className={`p-8 md:p-10 rounded-[40px] shadow-2xl border transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-slate-100'}`}>
              <h2 className="text-xl font-black mb-6 flex items-center gap-3 text-blue-500"><RefreshCw size={20} /> 系統自動化配置</h2>
              <div className="space-y-6">
                <div className="p-6 rounded-3xl border border-blue-500/20 bg-blue-500/5">
                  <div className="flex justify-between items-center mb-4"><div className="flex items-center gap-2"><Clock size={18} className="text-blue-500" /><span className="text-sm font-black uppercase tracking-widest text-slate-500">每日截止時間</span></div>{!isAdmin && <Lock size={14} className="opacity-40" />}</div>
                  <div className="flex items-center gap-4">
                    <input type="time" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={!isAdmin} className={`flex-1 px-6 py-4 rounded-2xl border outline-none font-black text-2xl ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200 shadow-inner'}`} />
                    {isAdmin && <button onClick={() => updateDeadline(deadline)} className="p-5 bg-blue-600 text-white rounded-2xl shadow-lg hover:scale-105 transition-all"><Save size={20} /></button>}
                  </div>
                </div>
              </div>
            </section>
            <section className={`p-8 md:p-10 rounded-[40px] shadow-2xl border transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
              <h2 className="text-xl font-black mb-6 flex items-center gap-3 text-blue-500"><ExternalLink size={20} /> 官網資訊</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {['帳號', '密碼'].map(label => (
                  <div key={label} className={`p-6 rounded-3xl border cursor-pointer group ${isDarkMode ? 'bg-white/5 border-white/10 hover:border-blue-500/50' : 'bg-slate-50 border-slate-100 hover:bg-white shadow-sm'}`} onClick={() => { navigator.clipboard.writeText('26522689'); showNotify(`${label}已複製`); }}>
                    <div className="text-[10px] uppercase text-slate-500 font-black mb-2 tracking-widest">{label}</div>
                    <div className={`font-mono text-xl flex justify-between items-center font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>26522689 <Copy size={16} className="opacity-40 group-hover:opacity-100 text-blue-500 transition-all" /></div>
                  </div>
                ))}
              </div>
            </section>
            <section className={`p-8 md:p-10 rounded-[40px] border transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-slate-100'}`}>
              <div className="flex justify-between items-center mb-8"><h2 className="text-xl font-black flex items-center gap-3 text-blue-500"><Layers size={22} /> 貼上結晶模式</h2><a href="https://dinbendon.net/do/" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/10 text-blue-500 font-black text-[10px] border border-blue-500/20 hover:bg-blue-600/20"><ExternalLink size={12} /> 前往 DinBenDon</a></div>
              <div className="space-y-6">
                {portalReceived && <div className="p-4 bg-blue-600/10 border border-blue-500/30 rounded-2xl text-blue-500 text-xs font-black animate-pulse flex items-center gap-2"><Info size={16} /> 傳送門數據就緒，點擊下方按鈕同步！</div>}
                <textarea rows="8" value={rawMenuText} onChange={(e) => setRawMenuText(e.target.value)} placeholder="在此貼上內容..." className={`w-full px-6 py-5 rounded-3xl border outline-none font-mono text-sm ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`} />
                <button onClick={handleParseText} className={`w-full py-5 text-white rounded-[2rem] font-black shadow-xl transition-all ${portalReceived ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}>同步菜單至雲端</button>
              </div>
              {isAdmin && (
                <div className="pt-10 mt-10 border-t grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-4">
                  <button onClick={() => setConfirmModal({show:true, type:'orders', label:'今日訂單'})} className="py-4 border-2 border-red-500/20 text-red-500 hover:bg-red-500/10 rounded-[1.5rem] text-xs font-black">🗑️ 清空今日訂單</button>
                  <button onClick={() => setConfirmModal({show:true, type:'menu', label:'全部菜單'})} className={`py-4 border-2 rounded-[1.5rem] text-xs font-black ${isDarkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>🧹 清空今日菜單</button>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'order' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in slide-in-from-bottom-6 duration-700">
            <div className="lg:col-span-5 space-y-8">
              <div className={`p-6 rounded-[2.5rem] border-2 flex flex-col gap-4 shadow-2xl transition-all duration-700 ${isTimeLocked ? 'bg-red-500/10 border-red-500/30' : 'bg-blue-600/10 border-blue-600/30'}`}>
                <div className="flex justify-between items-center"><div className="flex items-center gap-3">{isTimeLocked ? <AlertTriangle className="text-red-500 animate-pulse" /> : <Timer className="text-blue-500" />}<span className={`text-xs font-black uppercase tracking-[0.3em] ${isTimeLocked ? 'text-red-500' : 'text-blue-500'}`}>{isTimeLocked ? "白霧已鎖定：今日結單" : "時限結晶倒數中"}</span></div><div className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest ${isTimeLocked ? 'bg-red-500 text-white' : 'bg-blue-600 text-white'}`}>{deadline} CUTOFF</div></div>
                <div className="flex flex-col items-center py-2"><span className={`text-5xl font-black tracking-tighter tabular-nums ${isTimeLocked ? 'text-red-500' : 'text-blue-600'}`}>{countdownText}</span>{!isTimeLocked && <div className="mt-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">目前時間：{currentTime.toLocaleTimeString([], { hour12: false })}</div>}</div>
                {isTimeLocked && <p className="text-center text-[10px] text-red-500/60 font-bold italic">今日採購已進入結晶階段，不再接受新委託。</p>}
              </div>

              <section className={`p-8 md:p-10 rounded-[40px] border shadow-sm transition-all duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100 shadow-slate-100'}`}>
                <h2 className="text-xl font-black mb-8 flex items-center gap-3 text-blue-500"><Plus size={24} /> 我要訂餐</h2>
                <div className="space-y-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-widest px-1 text-slate-500">你的名字</label><input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="名字..." className={`w-full px-5 py-4 rounded-[1.5rem] border outline-none font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-100 shadow-inner'}`} /></div>
                    <div className="space-y-3"><label className="text-[10px] font-black uppercase tracking-widest px-1 text-slate-500">分機 ID</label><input type="text" value={userExtension} onChange={(e) => setUserExtension(e.target.value)} placeholder="分機..." className={`w-full px-5 py-4 rounded-[1.5rem] border outline-none font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-100 shadow-inner'}`} /></div>
                  </div>
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {Object.entries(menuByShop).length === 0 ? (<div className="text-center py-20 opacity-30 text-xs font-bold italic tracking-widest leading-relaxed">等待菜單同步中...</div>) : (
                      Object.entries(menuByShop).map(([shopName, items]) => (
                        <div key={shopName} className={`border rounded-[1.5rem] overflow-hidden mb-4 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-100 shadow-sm'}`}>
                          <button onClick={() => setExpandedShops(p => ({ ...p, [shopName]: !p[shopName] }))} className={`w-full px-6 py-4 flex justify-between items-center transition-colors ${expandedShops[shopName] ? 'bg-blue-600 text-white shadow-lg' : (isDarkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-50 text-slate-700 hover:bg-slate-100')}`}><div className="flex items-center gap-3"><Store size={18} /><span className="font-black text-sm">{shopName}</span></div>{expandedShops[shopName] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                          {expandedShops[shopName] && (<div className="p-3 space-y-2 animate-in fade-in duration-300">{items.map(item => (<button key={item.id} onClick={() => addToCart(item)} className={`w-full p-4 rounded-2xl border flex justify-between items-center transition-all ${isDarkMode ? 'border-slate-800 hover:border-blue-500/50' : 'border-slate-100 hover:border-blue-200 bg-white shadow-sm'} ${isTimeLocked ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}><span className="font-bold text-sm">{item.name}</span><div className="flex items-center gap-2"><span className="font-mono text-xs font-black text-slate-400">${item.price}</span><PlusCircle size={16} className="text-blue-500" /></div></button>))}</div>)}
                        </div>
                      ))
                    )}
                  </div>
                  {cart.length > 0 && (<div className={`p-6 rounded-[2rem] border-2 border-dashed transition-all animate-in slide-in-from-top-4 ${isDarkMode ? 'border-blue-500/30 bg-blue-500/5' : 'border-blue-200 bg-blue-50/50'}`}><div className="flex justify-between items-center mb-4"><div className="flex items-center gap-2 text-blue-500 font-black text-xs uppercase tracking-widest"><ShoppingCart size={14} /> 選購清單</div><button onClick={() => setCart([])} className="text-[10px] text-slate-500 hover:text-red-500 font-bold">清空</button></div><div className="space-y-2 mb-6 max-h-[150px] overflow-y-auto custom-scrollbar">{cart.map((item) => (<div key={item.cartId} className="flex justify-between items-center text-sm py-1 border-b border-blue-500/10"><div className="flex items-center gap-2"><button onClick={() => removeFromCart(item.cartId)} className="text-red-500/50 hover:text-red-500 transition-colors"><Minus size={14} /></button><span className="font-bold">{item.name}</span></div><span className="font-mono font-black opacity-60">${item.price}</span></div>))}<div className="pt-2 flex justify-between items-center font-black"><span className="text-blue-500 uppercase text-[10px]">小計總額</span><span className="text-lg text-blue-500 font-black">${cart.reduce((s,i)=>s+(Number(i.price)||0),0)}</span></div></div><div className="space-y-3 pt-4 border-t border-blue-500/10"><div className="text-[10px] uppercase font-black tracking-widest flex items-center gap-1 text-blue-400 px-1"><CircleDollarSign size={12}/> 找零試算</div><input type="number" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} placeholder="拿出面額..." className={`w-full px-5 py-3 rounded-2xl border outline-none ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`} />{cashGiven && parseFloat(cashGiven) >= cart.reduce((s,i)=>s+(Number(i.price)||0),0) && (<div className="mt-4 flex justify-between items-center px-1 text-blue-500 animate-pulse font-black"><span className="text-xs uppercase">應找回</span><span className="text-3xl tracking-tighter">${(parseFloat(cashGiven) - cart.reduce((s,i)=>s+(Number(i.price)||0),0)).toFixed(0)}</span></div>)}</div></div>)}
                  <button onClick={handleAddOrder} disabled={!userName || !userExtension || cart.length === 0 || isTimeLocked} className={`w-full py-6 text-white rounded-[2rem] font-black shadow-2xl transition-all uppercase tracking-widest ${isTimeLocked ? 'bg-slate-500 grayscale opacity-50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>{isTimeLocked ? "已結單" : "送出點餐委託"}</button>
                </div>
              </section>
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="flex justify-between items-center px-4"><h2 className="text-xl font-black flex items-center gap-3 text-blue-500"><Users size={24}/> 即時看板</h2><div className={`text-[10px] font-black px-4 py-2 rounded-full border uppercase tracking-widest transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-white border-slate-100 text-slate-400'}`}>{orders.length} 份點餐</div></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {orders.length === 0 ? (<div className="col-span-full py-40 rounded-[50px] border-4 border-dashed flex flex-col items-center justify-center text-center text-slate-300 opacity-20"><Moon size={48} className="mb-6" /><p className="text-sm font-black uppercase italic tracking-widest">等待第一份午餐的暖意</p></div>) : (
                  orders.map(order => {
                    const isMyOrder = order.extensionId === userExtension && userExtension !== '';
                    const canModify = isAdmin || (isMyOrder && !order.isPaid);
                    return (
                      <div key={order.id} className={`p-6 rounded-[2.5rem] border transition-all relative group overflow-hidden ${isDarkMode ? 'bg-slate-900 border-slate-800 hover:border-blue-900' : 'bg-white border-slate-100 hover:border-blue-300 shadow-sm'}`}>
                        <div className="flex items-start gap-5 relative z-10"><div className="w-14 h-14 rounded-[1.5rem] bg-blue-600 text-white flex flex-col items-center justify-center shadow-lg shrink-0"><span className="font-black text-xl leading-none">{order.userName?.charAt(0)}</span><span className="text-[7px] opacity-60 font-mono mt-1">{order.extensionId}</span></div><div className="flex-1 min-w-0 pt-1"><div className="text-[9px] font-black uppercase text-blue-500 mb-1 flex items-center gap-2">{order.shopName} {isMyOrder && <UserCheck size={10} className="text-emerald-500" />}</div><h3 className="font-black text-lg truncate mb-0.5">{order.userName}</h3><p className="text-xs opacity-60 mb-3 truncate leading-relaxed">{order.itemName}</p><div className="flex flex-wrap items-center gap-2"><span className="font-mono font-black">${order.price}</span>{order.change > 0 && <span className={`text-[9px] px-3 py-1 rounded-full font-black border ${order.isChangeGiven ? 'bg-slate-500/10 text-slate-500 border-slate-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>找 ${order.change}</span>}{order.isPaid && <span className="text-[8px] border-2 border-emerald-500 text-emerald-500 px-2 py-0.5 rounded-md font-black uppercase tracking-widest">Paid</span>}{order.isChangeGiven && <span className="text-[8px] border-2 border-blue-500 text-blue-500 px-2 py-0.5 rounded-md font-black uppercase tracking-widest">Change OK</span>}</div></div></div>
                        {canModify && (<div className="absolute top-6 right-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all z-20"><button onClick={() => setEditModal({ show: true, orderId: order.id, amount: order.paidAmount })} className={`p-2.5 rounded-full ${isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-500 border border-blue-100'}`}><Edit3 size={14}/></button><button onClick={() => setConfirmModal({ show: true, type: 'delete_single', label: `你的訂單`, data: order.id })} className={`p-2.5 rounded-full ${isDarkMode ? 'bg-red-500/20 text-red-500' : 'bg-red-50 text-red-400 border border-red-100'}`}><Trash2 size={14}/></button></div>)}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <section className={`lg:col-span-7 p-10 rounded-[50px] shadow-sm border transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100 shadow-slate-100'}`}>
                <h2 className="text-2xl font-black mb-10 flex items-center gap-4 text-blue-600 font-serif"><CheckCircle2 size={32} /> 採購匯總</h2>
                {Object.keys(groupedStats).length === 0 ? (
                  <div className="py-40 flex flex-col items-center justify-center opacity-30 italic"><Coffee size={48} className="mb-6" /><span>今日尚無點餐數據，請於結單前完成採購。</span></div>
                ) : (
                  <div className="space-y-12">
                    {Object.entries(groupedStats).map(([shopName, data]) => (
                      <div key={shopName} className="space-y-4">
                        <div className="flex justify-between items-center border-b-2 border-blue-500/10 pb-3">
                          <div className="flex items-center gap-3"><Store size={20} className="text-blue-500"/><h3 className="text-lg font-black tracking-tight">{shopName}</h3></div>
                          <button onClick={() => copySummaryForMagic(shopName, data)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-black text-[10px] shadow-lg hover:scale-105 active:scale-95 transition-all"><Zap size={12} /> 複製填表數據</button>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {Object.entries(data.items).map(([itemName, details]) => (
                            <div key={itemName} className={`flex justify-between items-center p-6 rounded-[1.5rem] border transition-all ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-100 shadow-sm'}`}>
                              <div className="space-y-1"><span className="font-bold text-base">{itemName}</span><div className="text-[10px] opacity-40 font-black uppercase tracking-widest">{details.names?.join(', ')}</div></div>
                              <div className="flex items-center gap-4"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">數量</span><span className="bg-blue-600 text-white px-6 py-2 rounded-xl font-black text-lg min-w-[4rem] text-center shadow-lg shadow-blue-900/30">{details.count}</span></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="pt-10 mt-10 border-t-2 border-blue-500/20 flex justify-between items-end px-2">
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Grand Total</p>
                       <p className="text-5xl font-black tracking-tighter text-blue-500 animate-pulse">${allOrdersTotalSum}</p>
                    </div>
                  </div>
                )}
              </section>
              <section className={`lg:col-span-5 p-10 rounded-[50px] shadow-2xl border transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-slate-200'}`}>
                <div className="flex justify-between items-center mb-10"><h2 className="text-xl font-black flex items-center gap-4 text-blue-600 font-serif"><CircleDollarSign size={28}/> 全員對帳</h2><button onClick={toggleAdminMode} className={`p-2.5 rounded-xl border flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${isAdmin ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg' : 'text-slate-400'}`}>{isAdmin ? <Unlock size={14}/> : <Lock size={14}/>} {isAdmin ? 'Admin On' : 'Unlock'}</button></div>
                <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                  {orders.length === 0 ? (
                    <p className="text-center py-20 opacity-20 text-[10px] font-black uppercase tracking-widest italic">Waiting for Orders...</p>
                  ) : (
                    orders.map(order => (
                      <div key={order.id} className={`p-6 rounded-[1.5rem] border flex flex-col gap-4 transition-all ${isDarkMode ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50 shadow-sm'}`}>
                        <div className="flex justify-between items-start"><div className="min-w-0"><div className={`font-black truncate text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{order.userName}</div><div className="text-[8px] opacity-40 font-mono italic">#{order.extensionId}</div></div><div className={`font-mono font-black text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-600'}`}>${order.price}</div></div>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => isAdmin && updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id), { isPaid: !order.isPaid })} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${order.isPaid ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>{order.isPaid ? 'Received ✓' : 'Mark Paid'}</button>
                          {order.change > 0 && <button onClick={() => isAdmin && updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', order.id), { isChangeGiven: !order.isChangeGiven })} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${order.isChangeGiven ? 'bg-blue-500/20 text-blue-500 border-blue-500/30' : 'bg-amber-500/10 text-amber-500 border-amber-500/30'}`}>{order.isChangeGiven ? 'Change OK ✓' : `Pending $${order.change}`}</button>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
      <footer className="py-20 text-center opacity-20"><p className="text-[10px] tracking-[0.5em] font-black uppercase italic transition-colors duration-500">Bear Joy Lunch Express ・ Team 熊樂子</p></footer>
      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #3B82F6; border-radius: 20px; }`}</style>
    </div>
  );
};

export default App;