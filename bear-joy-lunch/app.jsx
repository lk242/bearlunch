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
  UserCheck
} from 'lucide-react';

/**
 * --- 筵皓，雲端鑰匙配置 ---
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
  // --- 狀態管理 ---
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('order');
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  
  // 使用者身分識別
  const [userName, setUserName] = useState('');
  const [userExtension, setUserExtension] = useState(''); // 分機 ID
  
  const [cart, setCart] = useState([]); 
  const [cashGiven, setCashGiven] = useState('');
  
  const [rawMenuText, setRawMenuText] = useState('');
  const [notification, setNotification] = useState(null);
  const [expandedShops, setExpandedShops] = useState({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState('熊樂子正全力加速中...');
  const [isDarkMode, setIsDarkMode] = useState(true); 
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  
  // 編輯與確認視窗狀態
  const [confirmModal, setConfirmModal] = useState({ show: false, type: '', label: '', data: null });
  const [editModal, setEditModal] = useState({ show: false, orderId: '', amount: '' });

  // --- 1. 認證與監聽 ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth Error:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    const unsubscribeOrders = onSnapshot(ordersRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
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
    return () => { unsubscribeOrders(); unsubscribeMenu(); };
  }, [user]);

  // --- 2. 傳送門接收器 ---
  useEffect(() => {
    const handleUrlImport = async () => {
      if (!user) return;
      const hash = window.location.hash;
      if (hash.startsWith('#import=')) {
        const encodedData = hash.replace('#import=', '');
        try {
          const decodedText = decodeURIComponent(escape(atob(encodedData)));
          setRawMenuText(decodedText);
          setActiveTab('admin');
          window.history.replaceState(null, null, window.location.pathname);
          showNotify("傳送門開啟：已從官網導入數據！");
        } catch (e) { console.error("解碼失敗", e); }
      }
    };
    handleUrlImport();
  }, [user]);

  // --- 3. 核心功能 ---
  const showNotify = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPassword === 'root123456') {
      setIsAdmin(true); setAdminPassword(''); setShowAdminLogin(false);
      showNotify("管理權限已解鎖");
    } else { showNotify("密碼不正確"); }
  };

  const toggleAdminMode = () => {
    if (isAdmin) { setIsAdmin(false); showNotify("管理模式已關閉"); }
    else { setShowAdminLogin(true); }
  };

  const addToCart = (item) => {
    if (cart.length > 0 && cart[0].shopName !== item.shopName) {
      showNotify(`單次點餐僅限同一店家：${cart[0].shopName}`);
      return;
    }
    setCart([...cart, { ...item, cartId: Date.now() + Math.random() }]);
    showNotify(`已加入：${item.name}`);
  };

  const removeFromCart = (cartId) => { setCart(cart.filter(i => i.cartId !== cartId)); };
  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price, 0), [cart]);

  const handleAddOrder = async () => {
    if (!userName || !userExtension || cart.length === 0 || !user) return;
    const amountDue = cartTotal;
    const paid = parseFloat(cashGiven) || 0;
    const combinedNames = cart.map(i => i.name).join(' + ');

    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), {
      userName,
      extensionId: userExtension, // 存入分機作為 ID
      shopName: cart[0].shopName,
      itemName: combinedNames, 
      items: cart.map(i => ({ name: i.name, price: i.price })), 
      price: amountDue,
      paidAmount: paid,
      change: paid > amountDue ? paid - amountDue : 0,
      isPaid: false,
      createdAt: Date.now(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    setCart([]); setCashGiven(''); showNotify('點餐已成功結晶！');
  };

  // 修改金額邏輯
  const handleUpdatePaidAmount = async () => {
    const { orderId, amount } = editModal;
    const newPaid = parseFloat(amount) || 0;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', orderId), {
      paidAmount: newPaid,
      change: newPaid > order.price ? newPaid - order.price : 0
    });
    setEditModal({ show: false, orderId: '', amount: '' });
    showNotify("金額已修正");
  };

  const removeOrder = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', id));
      showNotify("訂單已移除");
    } catch (e) { showNotify("移除失敗"); }
  };

  const toggleOrderPayment = async (orderId, currentStatus) => {
    if (!isAdmin) return showNotify("權限不足");
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'orders', orderId), { isPaid: !currentStatus });
  };

  // 菜單解析器
  const processMenuParsing = async (text) => {
    const batch = writeBatch(db);
    let count = 0;
    const lines = text.split('\n');
    let currentShop = "未知店家";
    const seenItems = new Set();
    const blacklist = ['產品', '價格', '數量', '登出', 'Copyright'];

    lines.forEach(line => {
      let trimmed = line.trim().replace(/^[*✪\s\t]+/, '').replace(/[\t\s]+$/, '');
      if (!trimmed) return;
      const shopMatch = trimmed.match(/訂購\s+([^\(\s\n評比]+)/);
      if (shopMatch) { currentShop = shopMatch[1].trim(); return; }
      if (blacklist.some(word => trimmed.includes(word))) return;
      const sameLineMatch = trimmed.match(/^(.*?)[\s\t]+(\d{1,3})\s*元?\s*$/);
      if (sameLineMatch) {
        const name = sameLineMatch[1].trim();
        const price = parseInt(sameLineMatch[2]);
        const key = `${currentShop}-${name}-${price}`;
        if (name.length > 1 && price > 0 && !seenItems.has(key)) {
          batch.set(doc(collection(db, 'artifacts', appId, 'public', 'data', 'menu')), { shopName: currentShop, name, price, createdAt: Date.now() });
          count++; seenItems.add(key);
        }
      }
    });
    if (count > 0) await batch.commit();
    return count;
  };

  const handleParseText = async () => {
    if (!rawMenuText.trim() || !user) return;
    setIsSyncing(true);
    try {
      const count = await processMenuParsing(rawMenuText);
      if (count > 0) { setRawMenuText(''); showNotify(`已同步 ${count} 個品項`); }
      else { showNotify('未能辨識餐點'); }
    } catch (err) { showNotify("同步失敗"); }
    finally { setIsSyncing(false); }
  };

  const executeClearCloud = async () => {
    const { type, label } = confirmModal;
    setConfirmModal({ show: false, type: '', label: '', data: null });
    setIsSyncing(true);
    try {
      const batch = writeBatch(db);
      const data = type === 'orders' ? orders : menu;
      data.forEach(item => batch.delete(doc(db, 'artifacts', appId, 'public', 'data', type, item.id)));
      await batch.commit();
      showNotify(`已清空今日${label}`);
    } catch (err) { showNotify("操作失敗"); }
    finally { setIsSyncing(false); }
  };

  // --- 4. 計算屬性 ---
  const menuByShop = useMemo(() => {
    const groups = {};
    menu.forEach(item => {
      if (!groups[item.shopName]) groups[item.shopName] = [];
      groups[item.shopName].push(item);
    });
    return groups;
  }, [menu]);

  const groupedStats = useMemo(() => {
    const groups = {};
    orders.forEach(order => {
      if (!groups[order.shopName]) groups[order.shopName] = { items: {}, total: 0 };
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          groups[order.shopName].items[item.name] = (groups[order.shopName].items[item.name] || 0) + 1;
        });
      } else { groups[order.shopName].items[order.itemName] = (groups[order.shopName].items[order.itemName] || 0) + 1; }
      groups[order.shopName].total += (order.price || 0);
    });
    return groups;
  }, [orders]);

  const totalAmount = orders.reduce((sum, o) => sum + (o.price || 0), 0);

  // --- 5. UI 渲染 ---
  return (
    <div className={`min-h-screen font-sans transition-all duration-500 selection:bg-blue-500/30 ${isDarkMode ? 'bg-slate-950 text-slate-200' : 'bg-slate-50 text-slate-800'}`}>
      
      {isSyncing && (
        <div className={`fixed inset-0 z-[200] flex flex-col items-center justify-center ${isDarkMode ? 'bg-slate-950/80' : 'bg-white/80'} backdrop-blur-xl animate-in fade-in`}>
          <Truck className="text-blue-500 animate-bounce" size={80} /><p className="mt-8 text-sm font-black uppercase tracking-[0.4em]">{syncStatusText}</p>
        </div>
      )}

      {/* 修改金額視窗 */}
      {editModal.show && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'} p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm border`}>
            <h3 className="text-xl font-black mb-6 flex items-center gap-2"><Edit3 size={20} className="text-blue-500" /> 修改預付金額</h3>
            <input type="number" value={editModal.amount} onChange={(e) => setEditModal({...editModal, amount: e.target.value})} className={`w-full px-6 py-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 mb-6 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`} placeholder="請輸入金額..." />
            <div className="flex gap-3">
              <button onClick={() => setEditModal({ show: false, orderId: '', amount: '' })} className={`flex-1 py-4 rounded-2xl font-bold ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>取消</button>
              <button onClick={handleUpdatePaidAmount} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold">確認更新</button>
            </div>
          </div>
        </div>
      )}

      {showAdminLogin && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'} p-10 rounded-[2.5rem] shadow-2xl w-full max-w-sm border`}>
            <div className="flex justify-between items-center mb-8"><h3 className="text-xl font-black">管理權限解鎖</h3><button onClick={() => setShowAdminLogin(false)}><X /></button></div>
            <form onSubmit={handleAdminLogin} className="space-y-6">
              <input autoFocus type="password" placeholder="管理密碼" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className={`w-full px-6 py-4 rounded-2xl border outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`} />
              <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg">進入管理模式</button>
            </form>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
          <div className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} rounded-[2.5rem] p-10 max-w-sm w-full border text-center shadow-xl`}>
            <RotateCcw size={32} className="mx-auto mb-6 text-red-500" />
            <h3 className="text-xl font-black mb-2">確認操作</h3>
            <p className="text-sm opacity-60 mb-8">確定要執行「{confirmModal.label}」嗎？</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal({ show: false, type: '', label: '', data: null })} className={`flex-1 py-4 rounded-2xl font-bold ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>取消</button>
              <button onClick={() => {
                if(confirmModal.type === 'orders' || confirmModal.type === 'menu') executeClearCloud();
                else if(confirmModal.type === 'delete_single') removeOrder(confirmModal.data);
              }} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold">確定執行</button>
            </div>
          </div>
        </div>
      )}

      <header className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-all duration-500 ${isDarkMode ? 'bg-slate-950/80 border-slate-800/50 shadow-blue-900/10' : 'bg-white/80 border-slate-200 shadow-sm'}`}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 group cursor-default">
            <div className="p-2.5 bg-blue-600 rounded-2xl text-white shadow-lg transition-transform group-hover:scale-110"><Truck size={24}/></div>
            <h1 className="text-xl font-black tracking-tight italic font-serif">熊樂子的午餐快車</h1>
          </div>
          <div className="flex items-center gap-3">
            <nav className={`flex gap-1 p-1.5 rounded-2xl border transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200 shadow-inner'}`}>
              {[{ id: 'order', label: '點餐' }, { id: 'summary', label: '統整' }, { id: 'admin', label: '設定' }].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-400'}`}>{tab.label}</button>
              ))}
            </nav>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-3 rounded-2xl border hover:bg-blue-500/10 transition-colors">{isDarkMode ? <Sun size={20}/> : <Moon size={20}/>}</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {notification && <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[160] bg-blue-600 text-white px-8 py-3 rounded-full shadow-2xl text-sm font-black animate-in slide-in-from-top-4">{notification}</div>}

        {!user ? (
          <div className="text-center py-32 animate-pulse space-y-6">
            <Wind className="mx-auto text-blue-500" size={64} /><p className="text-slate-500 font-black uppercase tracking-[0.5em] text-xs">正在與雲端同步...</p>
          </div>
        ) : (
          <>
            {activeTab === 'admin' && (
              <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
                <section className={`p-8 md:p-10 rounded-[40px] shadow-2xl border transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-slate-100'}`}>
                  <h2 className="text-xl font-black mb-6 flex items-center gap-3 text-blue-500"><ExternalLink size={20} /> 官網登入資訊</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {['帳號', '密碼'].map(label => (
                      <div key={label} className={`p-6 rounded-3xl border cursor-pointer group ${isDarkMode ? 'bg-white/5 border-white/10 hover:border-blue-500/50' : 'bg-slate-50 border-slate-100 hover:bg-white'}`} onClick={() => { navigator.clipboard.writeText('26522689'); showNotify(`${label}已複製`); }}>
                        <div className="text-[10px] uppercase text-slate-500 font-black mb-2 tracking-widest">{label}</div>
                        <div className={`font-mono text-xl flex justify-between items-center font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>26522689 <Copy size={16} className="opacity-40 group-hover:opacity-100 text-blue-500 transition-opacity" /></div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={`p-8 md:p-10 rounded-[40px] border transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-slate-100'}`}>
                  <div className="flex justify-between items-center mb-8">
                    <h2 className="text-xl font-black flex items-center gap-3 text-blue-500"><Layers size={22} /> 貼上結晶模式</h2>
                    <a href="https://dinbendon.net/do/" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/10 text-blue-500 font-black text-[10px] border border-blue-500/20 hover:bg-blue-600/20 uppercase tracking-widest">
                      <ExternalLink size={12} /> 前往 DinBenDon
                    </a>
                  </div>
                  <div className="space-y-6">
                    <textarea rows="8" value={rawMenuText} onChange={(e) => setRawMenuText(e.target.value)} placeholder="在此貼上菜單內容..." className={`w-full px-6 py-5 rounded-3xl border outline-none font-mono text-sm ${isDarkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                    <button onClick={handleParseText} className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black shadow-xl hover:bg-blue-700 transition-all active:scale-95">同步菜單至雲端</button>
                  </div>
                  
                  {/* 管理員專屬：清空功能區 */}
                  {isAdmin && (
                    <div className="pt-10 mt-10 border-t grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-4">
                      <button onClick={() => setConfirmModal({ show: true, type: 'orders', label: '全部訂單' })} className="py-4 border-2 border-red-500/20 text-red-500 hover:bg-red-500/10 rounded-[1.5rem] text-xs font-black transition-all">🗑️ 清空今日訂單</button>
                      <button onClick={() => setConfirmModal({ show: true, type: 'menu', label: '全部門市菜單' })} className={`py-4 border-2 rounded-[1.5rem] text-xs font-black transition-all ${isDarkMode ? 'border-slate-800 text-slate-500 hover:bg-slate-800' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>🧹 清空今日菜單</button>
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'order' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 animate-in slide-in-from-bottom-6 duration-700">
                <div className="lg:col-span-5 space-y-8">
                  <section className={`p-8 md:p-10 rounded-[40px] border shadow-sm transition-all duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100 shadow-slate-100'}`}>
                    <h2 className="text-xl font-black mb-8 flex items-center gap-3 text-blue-500"><Plus size={24} /> 我要訂餐</h2>
                    <div className="space-y-8">
                      {/* 身分識別區塊 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-widest px-1 text-slate-500">你的名字</label>
                          <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="名字..." className={`w-full px-5 py-4 rounded-[1.5rem] border outline-none font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-100 text-slate-800'}`} />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-widest px-1 text-slate-500">分機 ID</label>
                          <input type="text" value={userExtension} onChange={(e) => setUserExtension(e.target.value)} placeholder="分機號碼..." className={`w-full px-5 py-4 rounded-[1.5rem] border outline-none font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-100 border-slate-100 text-slate-800'}`} />
                        </div>
                      </div>

                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {Object.entries(menuByShop).length === 0 ? (
                          <div className="text-center py-20 opacity-30 text-xs font-bold italic tracking-widest">等待統整人同步菜單...</div>
                        ) : (
                          Object.entries(menuByShop).map(([shopName, items]) => (
                            <div key={shopName} className={`border rounded-[1.5rem] overflow-hidden mb-4 ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-100 shadow-sm'}`}>
                              <button onClick={() => setExpandedShops(p => ({ ...p, [shopName]: !p[shopName] }))} className={`w-full px-6 py-4 flex justify-between items-center transition-colors ${expandedShops[shopName] ? 'bg-blue-600 text-white shadow-lg' : (isDarkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-50 text-slate-700')}`}>
                                <div className="flex items-center gap-3"><Store size={18} /><span className="font-black text-sm">{shopName}</span></div>
                                {expandedShops[shopName] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                              {expandedShops[shopName] && (
                                <div className="p-3 space-y-2 animate-in fade-in duration-300">
                                  {items.map(item => (
                                    <button key={item.id} onClick={() => addToCart(item)} className={`w-full p-4 rounded-2xl border flex justify-between items-center transition-all ${isDarkMode ? 'border-slate-800 hover:border-blue-500/50' : 'border-slate-100 hover:border-blue-200'}`}>
                                      <span className="font-bold text-sm">{item.name}</span>
                                      <div className="flex items-center gap-2"><span className="font-mono text-xs font-black text-slate-400">${item.price}</span><PlusCircle size={16} className="text-blue-500" /></div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      {cart.length > 0 && (
                        <div className={`p-6 rounded-[2rem] border-2 border-dashed transition-all animate-in slide-in-from-top-4 ${isDarkMode ? 'border-blue-500/30 bg-blue-500/5' : 'border-blue-200 bg-blue-50/50'}`}>
                           <div className="flex justify-between items-center mb-4">
                             <div className="flex items-center gap-2 text-blue-500 font-black text-xs uppercase tracking-widest"><ShoppingCart size={14} /> 選購清單</div>
                             <button onClick={() => setCart([])} className="text-[10px] text-slate-500 hover:text-red-500 font-bold">清空</button>
                           </div>
                           <div className="space-y-2 mb-6 max-h-[150px] overflow-y-auto custom-scrollbar">
                             {cart.map((item) => (
                               <div key={item.cartId} className="flex justify-between items-center text-sm py-1 border-b border-blue-500/10">
                                 <div className="flex items-center gap-2">
                                   <button onClick={() => removeFromCart(item.cartId)} className="text-red-500/50 hover:text-red-500"><Minus size={14} /></button>
                                   <span className="font-bold">{item.name}</span>
                                 </div>
                                 <span className="font-mono font-black opacity-60">${item.price}</span>
                               </div>
                             ))}
                             <div className="pt-2 flex justify-between items-center font-black">
                               <span className="text-blue-500 uppercase text-[10px]">小計總額</span>
                               <span className="text-lg text-blue-500 font-black">${cartTotal}</span>
                             </div>
                           </div>
                           <div className="space-y-3 pt-4 border-t border-blue-500/10">
                              <div className="text-[10px] uppercase font-black tracking-widest flex items-center gap-1 text-blue-400 px-1"><CircleDollarSign size={12}/> 找零試算</div>
                              <input type="number" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} placeholder="拿出面額 (如 500)..." className={`w-full px-5 py-3 rounded-2xl border outline-none ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`} />
                              {cashGiven && parseFloat(cashGiven) >= cartTotal && (
                                <div className="mt-4 flex justify-between items-center px-1 text-blue-500 animate-pulse font-black"><span className="text-xs uppercase">應找回</span><span className="text-3xl tracking-tighter">${(parseFloat(cashGiven) - cartTotal).toFixed(0)}</span></div>
                              )}
                           </div>
                        </div>
                      )}

                      <button onClick={handleAddOrder} disabled={!userName || !userExtension || cart.length === 0} className={`w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black shadow-2xl shadow-blue-900/30 active:scale-95 transition-all uppercase tracking-widest ${(!userName || !userExtension || cart.length === 0) ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-blue-700'}`}>送出點餐委託</button>
                    </div>
                  </section>
                </div>

                {/* 即時看板：加入自我管控權限 */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="flex justify-between items-center px-4">
                    <h2 className="text-xl font-black flex items-center gap-3 text-blue-500"><Users size={24}/> 即時看板</h2>
                    <div className={`text-[10px] font-black px-4 py-2 rounded-full border uppercase tracking-widest transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-white border-slate-100 text-slate-400'}`}>{orders.length} 份點餐中</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {orders.length === 0 ? (
                       <div className="col-span-full py-40 rounded-[50px] border-4 border-dashed flex flex-col items-center justify-center text-center text-slate-300 opacity-20"><Moon size={48} className="mb-6" /><p className="text-sm font-black uppercase italic tracking-widest">等待第一份午餐的暖意</p></div>
                    ) : (
                      orders.map(order => {
                        // 權限判定：管理員可以改任何東西；使用者只能在「未付款」時改自己的訂單
                        const isMyOrder = order.extensionId === userExtension && userExtension !== '';
                        const canModify = isAdmin || (isMyOrder && !order.isPaid);
                        
                        return (
                          <div key={order.id} className={`p-6 rounded-[2.5rem] border transition-all relative group overflow-hidden ${isDarkMode ? 'bg-slate-900 border-slate-800 hover:border-blue-900' : 'bg-white border-slate-100 hover:border-blue-300 shadow-sm'}`}>
                            <div className="flex items-start gap-5 relative z-10">
                              <div className="w-14 h-14 rounded-[1.5rem] bg-blue-600 text-white flex flex-col items-center justify-center shadow-lg shrink-0">
                                <span className="font-black text-xl leading-none">{order.userName.charAt(0)}</span>
                                <span className="text-[7px] opacity-60 font-mono mt-1">{order.extensionId}</span>
                              </div>
                              <div className="flex-1 min-w-0 pt-1">
                                <div className="text-[9px] font-black uppercase text-blue-500 mb-1 flex items-center gap-2">
                                  {order.shopName} {isMyOrder && <UserCheck size={10} className="text-emerald-500" />}
                                </div>
                                <h3 className="font-black text-lg truncate mb-0.5">{order.userName}</h3>
                                <p className="text-xs opacity-60 mb-3 truncate leading-relaxed">{order.itemName}</p>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-black">${order.price}</span>
                                  {order.change > 0 && <span className="text-[9px] bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full font-black">找 ${order.change}</span>}
                                  {order.isPaid && <span className="text-[8px] border-2 border-emerald-500 text-emerald-500 px-2 py-0.5 rounded-md font-black uppercase tracking-widest">Paid</span>}
                                </div>
                              </div>
                            </div>
                            
                            {/* 操作區：根據權限判定顯示 */}
                            {canModify && (
                              <div className="absolute top-6 right-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all z-20">
                                <button onClick={() => setEditModal({ show: true, orderId: order.id, amount: order.paidAmount })} className={`p-2.5 rounded-full ${isDarkMode ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white' : 'bg-blue-50 text-blue-500 border border-blue-100 hover:bg-blue-500 hover:text-white'}`} title="修改預付金額"><Edit3 size={14}/></button>
                                <button onClick={() => setConfirmModal({ show: true, type: 'delete_single', label: `你的訂單 (${order.itemName})`, data: order.id })} className={`p-2.5 rounded-full ${isDarkMode ? 'bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-red-50 text-red-400 border border-red-100 hover:bg-red-500 hover:text-white'}`} title="移除訂單"><Trash2 size={14}/></button>
                              </div>
                            )}
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
                    <h2 className="text-2xl font-black mb-10 flex items-center gap-4 text-blue-600 font-serif"><CheckCircle2 size={32} /> 採購清單匯總</h2>
                    {Object.keys(groupedStats).length === 0 ? ( <div className="py-20 text-center opacity-30 italic">尚無點餐資料...</div> ) : (
                      <div className="space-y-12">
                        {Object.entries(groupedStats).map(([shopName, data]) => (
                          <div key={shopName} className="space-y-4">
                            <div className="flex items-center gap-3 border-b-2 border-blue-500/10 pb-3"><Store size={20} className="text-blue-500"/><h3 className="text-lg font-black tracking-tight">{shopName}</h3></div>
                            <div className="grid grid-cols-1 gap-3">
                              {Object.entries(data.items).map(([itemName, count]) => (
                                <div key={itemName} className={`flex justify-between items-center p-6 rounded-[1.5rem] border transition-all ${isDarkMode ? 'bg-slate-950 border-slate-800 hover:border-blue-900' : 'bg-slate-50 border-slate-100 hover:bg-white shadow-sm'}`}>
                                  <span className="font-bold text-base">{itemName}</span>
                                  <div className="flex items-center gap-4"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">數量</span><span className="bg-blue-600 text-white px-6 py-2 rounded-xl font-black text-lg min-w-[4rem] text-center shadow-lg shadow-blue-900/30">{count}</span></div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="pt-10 mt-10 border-t-2 border-blue-500/20 flex justify-between items-end px-2">
                           <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Grand Total</p>
                           <p className="text-5xl font-black tracking-tighter text-blue-500 animate-pulse">${totalAmount}</p>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className={`lg:col-span-5 p-10 rounded-[50px] shadow-2xl border transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-slate-200'}`}>
                    <div className="flex justify-between items-center mb-10">
                      <h2 className="text-xl font-black flex items-center gap-4 text-blue-600 font-serif"><CircleDollarSign size={28}/> 全員對帳</h2>
                      <button onClick={toggleAdminMode} className={`p-2.5 rounded-xl transition-all border flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${isAdmin ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg' : (isDarkMode ? 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 shadow-sm')}`}>
                        {isAdmin ? <Unlock size={14}/> : <Lock size={14}/>} {isAdmin ? 'Admin On' : 'Unlock'}
                      </button>
                    </div>
                    <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                      {orders.map(order => (
                        <div key={order.id} className={`p-6 rounded-[1.5rem] border flex justify-between items-center transition-all ${isDarkMode ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50 shadow-sm'}`}>
                          <div className="min-w-0">
                            <div className={`font-black truncate text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{order.userName}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[8px] opacity-40 font-mono italic">#{order.extensionId}</span>
                              {order.change > 0 && <div className="text-[9px] text-amber-500 font-black tracking-widest bg-amber-500/5 px-2 py-0.5 rounded-md border border-amber-500/10 inline-block uppercase">找零: ${order.change}</div>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`font-mono font-black mb-2 text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-600'}`}>${order.price}</div>
                            <button onClick={() => toggleOrderPayment(order.id, order.isPaid)} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${order.isPaid ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'}`}>
                              {order.isPaid ? 'Received' : (isAdmin ? 'Mark Paid' : 'Locked')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      
      <footer className="py-20 text-center opacity-20"><p className="text-[10px] tracking-[0.5em] font-black uppercase italic transition-colors duration-500">Bear Joy Lunch Express ・ Team 熊樂子</p></footer>
      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #3B82F6; border-radius: 20px; }`}</style>
    </div>
  );
};

export default App;