import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, Network, Grid, Tag, X, Save, Trash2, Edit3, ArrowLeft, Eye, LogIn, LogOut, User, Menu } from 'lucide-react';
import { initializeApp } from 'firebase/app';
// 匯入 signInWithRedirect 和 getRedirectResult
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithRedirect, getRedirectResult, linkWithRedirect, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// --- 將此處替換為您的 Firebase 設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyCg0O0I5y_jZIsa43Ad91rkRM3ybJ6hbtE",
  authDomain: "tagmindcard.firebaseapp.com",
  projectId: "tagmindcard",
  storageBucket: "tagmindcard.firebasestorage.app",
  messagingSenderId: "706276976392",
  appId: "1:706276976392:web:78cce0dc5692a422356ebd",
  measurementId: "G-M2NE63D19Z"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'tagmind-app'; 

// 顏色生成器 
const getTagColor = (tag) => {
  const colors = [
    'bg-red-100 text-red-700 border-red-200', 'bg-blue-100 text-blue-700 border-blue-200',
    'bg-green-100 text-green-700 border-green-200', 'bg-yellow-100 text-yellow-700 border-yellow-200',
    'bg-purple-100 text-purple-700 border-purple-200', 'bg-pink-100 text-pink-700 border-pink-200',
    'bg-indigo-100 text-indigo-700 border-indigo-200', 'bg-orange-100 text-orange-700 border-orange-200',
  ];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

// --- 組件：網絡視圖 ---
const NetworkGraph = ({ cards, onNodeClick }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  const { nodes, links } = useMemo(() => {
    const nodes = cards.map(card => ({
      ...card, x: Math.random() * 800, y: Math.random() * 600, vx: 0, vy: 0, radius: 30 + (card.tags.length * 2) 
    }));
    const uniqueLinks = new Map();

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const intersection = nodes[i].tags.filter(t => nodes[j].tags.includes(t));
        if (intersection.length > 0) uniqueLinks.set(`${i}-${j}`, { source: i, target: j, type: 'tag', strength: intersection.length });
      }
    }

    nodes.forEach((node, i) => {
       const linkMatches = [...(node.content || '').matchAll(/\[\[(.*?)\]\]/g)].map(m => m[1]);
       linkMatches.forEach(targetTitle => {
           const targetIndex = nodes.findIndex(n => n.title === targetTitle);
           if (targetIndex !== -1 && targetIndex !== i) {
               const minId = Math.min(i, targetIndex), maxId = Math.max(i, targetIndex);
               uniqueLinks.set(`${minId}-${maxId}`, { source: minId, target: maxId, type: 'explicit', strength: 3 });
           }
       });
    });

    return { nodes, links: Array.from(uniqueLinks.values()) };
  }, [cards]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resize = () => {
        if(containerRef.current && canvas){
            canvas.width = containerRef.current.clientWidth;
            canvas.height = containerRef.current.clientHeight;
        }
    }
    window.addEventListener('resize', resize);
    resize();

    const animate = () => {
      const width = canvas.width, height = canvas.height;
      const repulsion = 1000, springLength = 150, k = 0.05, damping = 0.9, centerForce = 0.005; 

      nodes.forEach(node => {
        node.fx = (width / 2 - node.x) * centerForce;
        node.fy = (height / 2 - node.y) * centerForce;
      });

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0) dist = 0.1;
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          nodes[i].fx -= fx; nodes[i].fy -= fy;
          nodes[j].fx += fx; nodes[j].fy += fy;
        }
      }

      links.forEach(link => {
        const source = nodes[link.source], target = nodes[link.target];
        const dx = target.x - source.x, dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = (dist - springLength) * (k * (link.strength || 1));
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        source.fx += fx; source.fy += fy;
        target.fx -= fx; target.fy -= fy;
      });

      nodes.forEach(node => {
        node.vx = (node.vx + node.fx) * damping; node.vy = (node.vy + node.fy) * damping;
        node.x += node.vx; node.y += node.vy;
        if(node.x < node.radius) node.x = node.radius;
        if(node.x > width - node.radius) node.x = width - node.radius;
        if(node.y < node.radius) node.y = node.radius;
        if(node.y > height - node.radius) node.y = height - node.radius;
      });

      ctx.clearRect(0, 0, width, height);

      links.forEach(link => {
        const source = nodes[link.source], target = nodes[link.target];
        ctx.beginPath(); ctx.moveTo(source.x, source.y); ctx.lineTo(target.x, target.y);
        if (link.type === 'explicit') {
            ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]); 
        } else {
            ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5; ctx.setLineDash([]); 
        }
        ctx.stroke(); ctx.setLineDash([]); 
      });

      nodes.forEach(node => {
        ctx.beginPath(); ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#1e293b'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const label = node.title.length > 5 ? node.title.substring(0, 5) + '...' : node.title;
        ctx.fillText(label, node.x, node.y);
        if (node.tags.length > 0) {
            ctx.beginPath(); ctx.arc(node.x + node.radius * 0.7, node.y - node.radius * 0.7, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444'; ctx.fill(); ctx.fillStyle = 'white'; ctx.font = '10px sans-serif';
            ctx.fillText(node.tags.length, node.x + node.radius * 0.7, node.y - node.radius * 0.7);
        }
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(animationFrameId); };
  }, [nodes, links]);

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const dist = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      if (dist < node.radius) { onNodeClick(node); break; }
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-50 cursor-crosshair overflow-hidden rounded-xl border border-slate-200 shadow-inner relative">
      <div className="absolute top-4 left-4 bg-white/80 p-2 sm:p-3 rounded shadow text-[10px] sm:text-xs text-slate-600 pointer-events-none leading-relaxed">
         <b>圖例說明：</b><br/>
         <span className="inline-block w-3 sm:w-4 border-b-2 border-slate-300 mr-1 mb-1"></span> 共同標籤<br/>
         <span className="inline-block w-3 sm:w-4 border-b-2 border-indigo-400 border-dashed mr-1 mb-1"></span> 內容互連<br/>
      </div>
      <canvas ref={canvasRef} onClick={handleClick} className="w-full h-full" />
    </div>
  );
};

// --- 主應用程式 ---
export default function TagMindApp() {
  const [cards, setCards] = useState([]);
  const [user, setUser] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState(null);
  
  // UI 響應式狀態
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('view'); 
  const [currentCard, setCurrentCard] = useState({ id: null, title: '', content: '', tags: [] });
  const [historyStack, setHistoryStack] = useState([]); 
  
  const [tagInput, setTagInput] = useState('');
  const [isTagInputFocused, setIsTagInputFocused] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  
  // 處理重新導向登入結果的狀態
  const [isLoggingIn, setIsLoggingIn] = useState(true);

  // --- Auth 登入與狀態監聽 ---
  useEffect(() => {
    // 檢查是否有重新導向登入的結果
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // 重新導向登入成功
          console.log("Redirect login successful");
        }
      } catch (error) {
        console.error("Redirect login error:", error);
        // 如果是綁定帳號發生衝突
        if (error.code === 'auth/credential-already-in-use') {
          alert("此 Google 帳號已被使用，系統將直接為您登入。");
          const provider = new GoogleAuthProvider();
          signInWithRedirect(auth, provider);
        } else {
           alert("登入發生錯誤：" + error.message);
        }
      } finally {
        setIsLoggingIn(false);
      }
    };

    checkRedirectResult();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        signInAnonymously(auth).catch(err => console.error("匿名登入失敗:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // 修改 Google 登入邏輯為 Redirect
  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      if (user && user.isAnonymous) {
        // 將當前的匿名帳號「綁定」到 Google，使用 Redirect
        await linkWithRedirect(user, provider);
      } else {
        // 一般登入，使用 Redirect
        await signInWithRedirect(auth, provider);
      }
    } catch (error) {
      console.error("啟動登入錯誤:", error);
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'cards');
    const unsubscribe = onSnapshot(cardsRef, (snapshot) => {
      setCards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Firestore error:", error));
    return () => unsubscribe();
  }, [user]);

  const allTags = useMemo(() => {
    const counts = {};
    cards.forEach(card => card.tags.forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]); 
  }, [cards]);

  const suggestedTags = useMemo(() => {
    const lowerInput = tagInput.trim().toLowerCase();
    const availableTags = allTags.map(([tag]) => tag).filter(tag => !currentCard.tags.includes(tag));
    if (!lowerInput) return availableTags.slice(0, 5);
    return availableTags.filter(tag => tag.toLowerCase().includes(lowerInput)).slice(0, 5); 
  }, [tagInput, allTags, currentCard.tags]);

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const matchesSearch = (card.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (card.content || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTag = selectedTagFilter ? card.tags.includes(selectedTagFilter) : true;
      return matchesSearch && matchesTag;
    });
  }, [cards, searchTerm, selectedTagFilter]);

  const isDuplicateTitle = useMemo(() => {
    if (!currentCard.title) return false;
    return cards.some(c => c.title.trim().toLowerCase() === currentCard.title.trim().toLowerCase() && c.id !== currentCard.id);
  }, [cards, currentCard.title, currentCard.id]);

  const handleSaveCard = async () => {
    if (!currentCard.title.trim() || !user || isDuplicateTitle) return;
    const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'cards');
    try {
      if (currentCard.id) {
        const { id, ...dataToUpdate } = currentCard;
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'cards', currentCard.id), dataToUpdate);
      } else {
        const { id, ...dataToSave } = currentCard;
        await addDoc(cardsRef, { ...dataToSave, createdAt: Date.now() });
      }
      setModalMode('view'); 
      setTagInput('');
    } catch (error) { console.error("Error saving card:", error); }
  };

  const handleDeleteCard = async (id) => {
    if (!user) return;
    if (confirmDeleteId === id) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'cards', id));
      setConfirmDeleteId(null);
      if (isModalOpen && currentCard.id === id) closeModal();
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  const openCardModal = (card = null) => {
    if (card) { setCurrentCard(card); setModalMode('view'); } 
    else { setCurrentCard({ id: null, title: '', content: '', tags: [] }); setModalMode('edit'); }
    setTagInput(''); setIsModalOpen(true); setHistoryStack([]); 
  };

  const closeModal = () => { setIsModalOpen(false); setHistoryStack([]); };

  const handleLinkClick = (targetTitle) => {
    const targetCard = cards.find(c => c.title === targetTitle);
    setHistoryStack(prev => [...prev, currentCard]);
    if (targetCard) { setCurrentCard(targetCard); setModalMode('view'); } 
    else { setCurrentCard({ id: null, title: targetTitle, content: '', tags: [] }); setModalMode('edit'); }
  };

  const handleBack = () => {
    if (historyStack.length > 0) {
        const prevCard = historyStack[historyStack.length - 1];
        setHistoryStack(prev => prev.slice(0, -1)); 
        setCurrentCard(prevCard); setModalMode('view'); 
    }
  };

  const addTag = (tagToAdd = tagInput) => {
    const newTag = tagToAdd.trim();
    if (newTag && !currentCard.tags.includes(newTag)) {
      setCurrentCard({ ...currentCard, tags: [...currentCard.tags, newTag] });
      setTagInput(''); setIsTagInputFocused(false); 
    }
  };

  const removeTag = (tagToRemove) => {
    setCurrentCard({ ...currentCard, tags: currentCard.tags.filter(t => t !== tagToRemove) });
  };

  const renderFormattedContent = (text) => {
    if (!text) return <span className="text-slate-400 italic">尚未填寫內容...</span>;
    return text.split('\n').map((line, lineIndex) => {
      let content = line, type = 'text', prefix = '';
      const indentMatch = content.match(/^(\s*)/);
      const spaces = indentMatch ? indentMatch[1].length : 0;
      content = content.trimStart(); 

      if (content.match(/^[-*]\s+\[\s\]\s+/)) { type = 'checkbox'; content = content.replace(/^[-*]\s+\[\s\]\s+/, ''); } 
      else if (content.match(/^[-*]\s+\[[xX]\]\s+/)) { type = 'checked'; content = content.replace(/^[-*]\s+\[[xX]\]\s+/, ''); } 
      else if (content.match(/^[-*]\s+/)) { type = 'bullet'; content = content.replace(/^[-*]\s+/, ''); } 
      else if (content.match(/^\d+\.\s+/)) { type = 'numbered'; prefix = content.match(/^\d+\.\s+/)[0]; content = content.replace(/^\d+\.\s+/, ''); }

      const parts = content.split(/\[\[(.*?)\]\]/g);
      const renderedLine = parts.map((part, i) => {
        if (i % 2 === 1) {
          const targetExists = cards.some(c => c.title === part);
          return (
            <button key={i} onClick={() => handleLinkClick(part)}
              className={`inline-block px-1.5 py-0.5 mx-0.5 rounded cursor-pointer font-medium transition-colors border-b-2
                ${targetExists ? 'text-indigo-600 border-indigo-200 hover:bg-indigo-50' : 'text-slate-500 border-dashed border-slate-300 hover:bg-slate-100'}`}
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      });

      return (
        <div key={lineIndex} className="min-h-[1.5rem] my-0.5" style={{ paddingLeft: `${spaces * 0.5}rem` }}>
           {type === 'checkbox' && <label className="flex items-start gap-2 group"><input type="checkbox" disabled className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300" /><span>{renderedLine}</span></label>}
           {type === 'checked' && <label className="flex items-start gap-2 group"><input type="checkbox" checked disabled className="mt-1 w-4 h-4 text-indigo-600 rounded border-slate-300" /><span className="line-through text-slate-400">{renderedLine}</span></label>}
           {type === 'bullet' && <div className="flex items-start gap-2 pl-1"><span className="text-slate-400 font-bold">•</span><span>{renderedLine}</span></div>}
           {type === 'numbered' && <div className="flex items-start gap-2"><span className="text-slate-500 font-medium w-5 shrink-0 text-right">{prefix}</span><span>{renderedLine}</span></div>}
           {type === 'text' && <div>{renderedLine}</div>}
        </div>
      );
    });
  };

  return (
    <div className="flex h-[100dvh] w-full bg-slate-100 text-slate-800 font-sans overflow-hidden">
      
      {/* --- 手機版側邊欄遮罩 --- */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden transition-opacity" 
          onClick={() => setIsMobileSidebarOpen(false)} 
        />
      )}

      {/* --- 響應式側邊欄 --- */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transform ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:relative md:translate-x-0 md:flex w-72 md:w-64 bg-white border-r border-slate-200 flex flex-col shadow-2xl md:shadow-lg transition-transform duration-300 ease-in-out
      `}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-600">
            <Network className="w-6 h-6" /> TagMind
          </h1>
          {/* 手機版關閉側邊欄按鈕 */}
          <button className="md:hidden p-2 text-slate-400 hover:text-slate-600" onClick={() => setIsMobileSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* 電腦版「新增卡片」按鈕 */}
        <div className="p-4 hidden md:block">
          <button onClick={() => openCardModal()} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 shadow-md">
            <Plus className="w-4 h-4" /> 新增卡片
          </button>
        </div>

        <div className="px-4 py-2 overflow-y-auto flex-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 mt-2 md:mt-0">熱門標籤</div>
          <div className="space-y-1">
            <button 
              onClick={() => { setSelectedTagFilter(null); setIsMobileSidebarOpen(false); }} 
              className={`w-full text-left px-3 py-3 md:py-2 rounded-md text-sm flex items-center justify-between ${!selectedTagFilter ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-slate-50'}`}
            >
              <span>全部顯示</span>
              <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full text-xs">{cards.length}</span>
            </button>
            {allTags.map(([tag, count]) => (
              <button 
                key={tag} 
                onClick={() => { setSelectedTagFilter(tag === selectedTagFilter ? null : tag); setIsMobileSidebarOpen(false); }} 
                className={`w-full text-left px-3 py-3 md:py-2 rounded-md text-sm flex items-center justify-between ${selectedTagFilter === tag ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2 truncate"><Tag className="w-3 h-3 shrink-0" /><span className="truncate">{tag}</span></div>
                <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-xs">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 底部使用者狀態與登入區塊 */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 pb-8 md:pb-4">
          {isLoggingIn ? (
            <div className="text-sm text-slate-500 flex justify-center items-center py-2">
              <span className="animate-pulse">登入中...</span>
            </div>
          ) : user && !user.isAnonymous ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-slate-700 font-medium truncate">
                <User className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="truncate" title={user.displayName || user.email}>{user.displayName || user.email || '已登入'}</span>
              </div>
              <button onClick={() => signOut(auth)} className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors w-fit">
                <LogOut className="w-3 h-3" /> 登出
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                訪客模式 (未同步)
              </div>
              <button onClick={handleGoogleLogin} className="w-full bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-indigo-600 text-xs py-2 px-3 rounded-md flex items-center justify-center gap-1.5 transition-all shadow-sm font-medium">
                <LogIn className="w-3 h-3" /> 登入 Google 以同步
              </button>
            </div>
          )}
        </div>
      </div>

      {/* --- 主內容區 --- */}
      <div className="flex-1 flex flex-col relative h-[100dvh] overflow-hidden">
        {/* 頂部導航列 */}
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 shadow-sm z-10 gap-2">
          
          {/* 手機版開啟側邊欄漢堡按鈕 */}
          <button 
            className="md:hidden p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg shrink-0" 
            onClick={() => setIsMobileSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* 搜尋列 */}
          <div className="flex items-center gap-2 sm:gap-4 bg-slate-100 px-3 py-1.5 sm:py-2 rounded-full flex-1 max-w-md border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-200 transition-all">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input type="text" placeholder="搜尋卡片..." className="bg-transparent border-none outline-none text-sm w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            {searchTerm && (
               <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
               </button>
            )}
          </div>
          
          {/* 視圖切換 */}
          <div className="flex items-center gap-1 sm:gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 sm:p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}><Grid className="w-4 h-4 sm:w-5 sm:h-5" /></button>
            <button onClick={() => setViewMode('network')} className={`p-1.5 sm:p-2 rounded-md transition-all ${viewMode === 'network' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}><Network className="w-4 h-4 sm:w-5 sm:h-5" /></button>
          </div>
        </div>

        {/* 內容顯示區 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50 relative">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pb-24">
              {filteredCards.length === 0 ? (
                 <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400">
                    <p>沒有找到符合的卡片</p>
                 </div>
              ) : (
                filteredCards.map(card => (
                  <div key={card.id} onClick={() => openCardModal(card)} className="group bg-white rounded-xl p-4 sm:p-5 border border-slate-200 shadow-sm hover:shadow-lg cursor-pointer flex flex-col h-56 sm:h-64 transition-all active:scale-[0.98]">
                    <h3 className="font-bold text-lg text-slate-800 mb-2 line-clamp-1 group-hover:text-indigo-600">{card.title}</h3>
                    <p className="text-slate-600 text-sm mb-4 line-clamp-4 sm:line-clamp-5 flex-1 whitespace-pre-wrap">
                      {card.content.replace(/\[\[(.*?)\]\]/g, '$1').replace(/^[-*]\s+\[\s\]\s+/gm, '☐ ').replace(/^[-*]\s+\[[xX]\]\s+/gm, '☑ ')}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-slate-100">
                      {card.tags.slice(0, 3).map(tag => <span key={tag} className={`text-xs px-2 py-0.5 rounded-full border ${getTagColor(tag)}`}>#{tag}</span>)}
                      {card.tags.length > 3 && <span className="text-xs text-slate-400 px-1">+{card.tags.length - 3}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="h-[calc(100%-1rem)] w-full pb-20">
              <NetworkGraph cards={filteredCards} onNodeClick={openCardModal} />
            </div>
          )}
        </div>
      </div>

      {/* --- 手機專屬「懸浮新增按鈕 (FAB)」 --- */}
      <button 
        onClick={() => openCardModal()} 
        className="md:hidden fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-2xl z-30 transition-transform active:scale-95"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* --- 編輯器/閱讀器 Modal --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/60 sm:backdrop-blur-sm sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl flex flex-col h-[95dvh] sm:h-auto sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2 sm:gap-3">
                {historyStack.length > 0 && (
                   <button onClick={handleBack} className="p-1 sm:p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-sm font-medium flex items-center"><ArrowLeft className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">返回</span></button>
                )}
                <h2 className="text-base sm:text-lg font-bold text-slate-800 line-clamp-1">{modalMode === 'view' ? '閱讀卡片' : (currentCard.id ? '編輯卡片' : '新卡片')}</h2>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                {modalMode === 'view' ? (
                  <button onClick={() => setModalMode('edit')} className="p-1.5 sm:p-2 text-indigo-600 bg-indigo-50 rounded-lg text-sm font-medium flex items-center"><Edit3 className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">編輯</span></button>
                ) : (
                  <button onClick={() => currentCard.id && setModalMode('view')} className="p-1.5 sm:p-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm flex items-center"><Eye className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">預覽</span></button>
                )}
                {currentCard.id && (
                  <button onClick={() => handleDeleteCard(currentCard.id)} className={`p-1.5 sm:p-2 rounded-lg ${confirmDeleteId === currentCard.id ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-red-500'}`}>
                    {confirmDeleteId === currentCard.id ? <span className="text-xs px-1 font-bold">確認刪除</span> : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
                <div className="w-px h-5 sm:h-6 bg-slate-200 mx-0.5 sm:mx-1"></div>
                <button onClick={closeModal} className="p-1.5 sm:p-2 text-slate-400 hover:bg-slate-200 rounded-lg"><X className="w-5 h-5 sm:w-6 sm:h-6" /></button>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 relative">
              {modalMode === 'edit' ? (
                 <>
                    <input type="text" placeholder="卡片標題" value={currentCard.title} onChange={(e) => setCurrentCard({ ...currentCard, title: e.target.value })}
                      className={`w-full text-xl sm:text-2xl font-bold text-slate-800 placeholder:text-slate-300 border-b-2 outline-none bg-transparent mb-2 pb-1 ${isDuplicateTitle ? 'border-red-400' : 'border-transparent focus:border-indigo-300'}`} autoFocus={!currentCard.id} />
                    {isDuplicateTitle && <p className="text-sm text-red-500 mb-4">⚠️ 此標題已存在，請修改。</p>}

                    <div className="mb-2 min-h-[200px] sm:min-h-[150px] flex-1">
                      <textarea placeholder="寫下你的靈感..." value={currentCard.content} onChange={(e) => setCurrentCard({ ...currentCard, content: e.target.value })}
                        className="w-full h-full min-h-[30vh] sm:min-h-[250px] resize-none text-base sm:text-lg text-slate-600 placeholder:text-slate-300 border-none outline-none bg-transparent leading-relaxed" />
                    </div>
                    
                    <div className="text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded mb-4 space-y-1">
                       <p>💡 <b>排版語法提示 (切換預覽觀看)</b>：</p>
                       <ul className="list-disc pl-4 text-slate-600 space-y-0.5">
                         <li>輸入 <code>[[標題]]</code> 建立連結</li>
                         <li>輸入 <code>- [ ] </code> 建立待辦</li>
                         <li>輸入 <code>- </code> 建立項目</li>
                       </ul>
                    </div>
                 </>
              ) : (
                 <>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">{currentCard.title}</h1>
                    <div className="text-slate-700 leading-relaxed text-base sm:text-lg">
                       {renderFormattedContent(currentCard.content)}
                    </div>
                 </>
              )}

              {/* 標籤區塊 */}
              <div className="border-t border-slate-100 pt-4 mt-6 sm:mt-8 pb-4">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">標籤</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {currentCard.tags.map(tag => (
                    <span key={tag} className={`px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm flex items-center gap-1 shadow-sm ${getTagColor(tag)}`}>
                      <Tag className="w-3 h-3" />{tag}
                      {modalMode === 'edit' && <button onClick={() => removeTag(tag)} className="ml-1 hover:text-black/50 p-0.5"><X className="w-3 h-3" /></button>}
                    </span>
                  ))}
                  
                  {modalMode === 'edit' && (
                    <div className="relative flex flex-col">
                      <div className="flex items-center">
                        <input type="text" placeholder="新增標籤..." value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()}
                          onFocus={() => setIsTagInputFocused(true)} onBlur={() => setTimeout(() => setIsTagInputFocused(false), 200)} 
                          className="bg-slate-100 px-3 py-1.5 rounded-full text-xs sm:text-sm outline-none border border-transparent focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 w-32 sm:w-36" 
                        />
                        {tagInput && <button onClick={() => addTag()} className="absolute right-2 text-indigo-600"><Plus className="w-3 h-3" /></button>}
                      </div>
                      
                      {(isTagInputFocused && suggestedTags.length > 0) && (
                        <div className="absolute bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 left-0 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden">
                          <div className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50 border-b border-slate-100">
                            {tagInput ? '相符的標籤：' : '建議標籤：'}
                          </div>
                          {suggestedTags.map(tag => (
                            <button key={tag} onMouseDown={(e) => { e.preventDefault(); addTag(tag); }} 
                              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2">
                              <Tag className="w-3 h-3" /> {tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {modalMode === 'edit' && (
               <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex justify-end pb-8 sm:pb-4">
                  <button onClick={handleSaveCard} disabled={isDuplicateTitle || !currentCard.title.trim()}
                   className={`w-full sm:w-auto px-6 py-3 sm:py-2 rounded-xl sm:rounded-lg font-bold sm:font-medium flex items-center justify-center gap-2 shadow-md ${isDuplicateTitle || !currentCard.title.trim() ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                   <Save className="w-5 h-5 sm:w-4 sm:h-4" /> 儲存卡片
                 </button>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}