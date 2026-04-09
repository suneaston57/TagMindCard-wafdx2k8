import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, Network, Grid, Tag, X, Save, Trash2, Edit3, MoreHorizontal, ArrowLeft, Eye } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// Firebase 初始化 (畫布環境設定)
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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'tagmind-app';

// 顏色生成器 (根據標籤名稱生成固定顏色)
const getTagColor = (tag) => {
  const colors = [
    'bg-red-100 text-red-700 border-red-200',
    'bg-blue-100 text-blue-700 border-blue-200',
    'bg-green-100 text-green-700 border-green-200',
    'bg-yellow-100 text-yellow-700 border-yellow-200',
    'bg-purple-100 text-purple-700 border-purple-200',
    'bg-pink-100 text-pink-700 border-pink-200',
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-orange-100 text-orange-700 border-orange-200',
  ];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// --- 組件：網絡視圖 (Canvas Force-Directed Graph) ---
const NetworkGraph = ({ cards, onNodeClick }) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // 處理數據轉換為節點和連線
  const { nodes, links } = useMemo(() => {
    const nodes = cards.map(card => ({
      ...card,
      x: Math.random() * 800,
      y: Math.random() * 600,
      vx: 0,
      vy: 0,
      radius: 30 + (card.tags.length * 2) 
    }));

    const uniqueLinks = new Map();

    // 1. 標籤關聯連線 (灰色實線)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const intersection = nodes[i].tags.filter(t => nodes[j].tags.includes(t));
        if (intersection.length > 0) {
          uniqueLinks.set(`${i}-${j}`, {
            source: i,
            target: j,
            type: 'tag',
            strength: intersection.length
          });
        }
      }
    }

    // 2. 內容提及連線 [[卡片標題]] (紫色虛線)
    nodes.forEach((node, i) => {
       const linkMatches = [...(node.content || '').matchAll(/\[\[(.*?)\]\]/g)].map(m => m[1]);
       linkMatches.forEach(targetTitle => {
           const targetIndex = nodes.findIndex(n => n.title === targetTitle);
           if (targetIndex !== -1 && targetIndex !== i) {
               const minId = Math.min(i, targetIndex);
               const maxId = Math.max(i, targetIndex);
               const linkId = `${minId}-${maxId}`;
               // 若已有標籤連線，我們將其覆蓋或標記為混合類型，這裡我們優先顯示明確的內容連結
               uniqueLinks.set(linkId, {
                   source: minId,
                   target: maxId,
                   type: 'explicit',
                   strength: 3 // 明確連結有較強的引力
               });
           }
       });
    });

    const links = Array.from(uniqueLinks.values());
    return { nodes, links };
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
      const width = canvas.width;
      const height = canvas.height;
      
      const repulsion = 1000; 
      const springLength = 150; 
      const k = 0.05; 
      const damping = 0.9; 
      const centerForce = 0.005; 

      // 1. 計算力
      nodes.forEach(node => {
        node.fx = 0;
        node.fy = 0;
        node.fx += (width / 2 - node.x) * centerForce;
        node.fy += (height / 2 - node.y) * centerForce;
      });

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0) dist = 0.1;
          
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          nodes[i].fx -= fx;
          nodes[i].fy -= fy;
          nodes[j].fx += fx;
          nodes[j].fy += fy;
        }
      }

      links.forEach(link => {
        const source = nodes[link.source];
        const target = nodes[link.target];
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const force = (dist - springLength) * (k * (link.strength || 1));
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        source.fx += fx;
        source.fy += fy;
        target.fx -= fx;
        target.fy -= fy;
      });

      // 2. 更新位置
      nodes.forEach(node => {
        node.vx = (node.vx + node.fx) * damping;
        node.vy = (node.vy + node.fy) * damping;
        node.x += node.vx;
        node.y += node.vy;

        if(node.x < node.radius) node.x = node.radius;
        if(node.x > width - node.radius) node.x = width - node.radius;
        if(node.y < node.radius) node.y = node.radius;
        if(node.y > height - node.radius) node.y = height - node.radius;
      });

      // 3. 繪製
      ctx.clearRect(0, 0, width, height);

      // 畫線
      links.forEach(link => {
        const source = nodes[link.source];
        const target = nodes[link.target];
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        
        if (link.type === 'explicit') {
            ctx.strokeStyle = '#818cf8'; // indigo-400
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 6]); // 虛線表示內容連結
        } else {
            ctx.strokeStyle = '#cbd5e1'; // slate-300
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]); // 實線表示標籤連結
        }
        
        ctx.stroke();
        ctx.setLineDash([]); // 重設
      });

      // 畫節點
      nodes.forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#3b82f6'; 
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#1e293b'; 
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = node.title.length > 5 ? node.title.substring(0, 5) + '...' : node.title;
        ctx.fillText(label, node.x, node.y);
        
        if (node.tags.length > 0) {
            ctx.beginPath();
            ctx.arc(node.x + node.radius * 0.7, node.y - node.radius * 0.7, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444'; 
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = '10px sans-serif';
            ctx.fillText(node.tags.length, node.x + node.radius * 0.7, node.y - node.radius * 0.7);
        }
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [nodes, links]);

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const dist = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
      if (dist < node.radius) {
        onNodeClick(node);
        break;
      }
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-50 cursor-crosshair overflow-hidden rounded-xl border border-slate-200 shadow-inner relative">
       <div className="absolute top-4 left-4 bg-white/80 p-3 rounded shadow text-xs text-slate-600 pointer-events-none leading-relaxed">
          <b>圖例說明：</b><br/>
          <span className="inline-block w-4 border-b-2 border-slate-300 mr-1 mb-1"></span> 共同標籤連線<br/>
          <span className="inline-block w-4 border-b-2 border-indigo-400 border-dashed mr-1 mb-1"></span> 內容互相提及連線<br/>
          小圓點數字：標籤數量
       </div>
      <canvas 
        ref={canvasRef} 
        onClick={handleClick}
        className="w-full h-full"
      />
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
  
  // 編輯器與導航狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('view'); // 'view' or 'edit'
  const [currentCard, setCurrentCard] = useState({ id: null, title: '', content: '', tags: [] });
  const [historyStack, setHistoryStack] = useState([]); // 儲存卡片瀏覽歷史
  
  const [tagInput, setTagInput] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // 動態載入 Tailwind CSS CDN (解決在 StackBlitz 等外部環境排版跑掉的問題)
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
  }, []);

  // Firebase Auth 初始化
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 監聽 Firestore 資料
  useEffect(() => {
    if (!user) return;
    const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'cards');
    const unsubscribe = onSnapshot(cardsRef, (snapshot) => {
      const loadedCards = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCards(loadedCards);
    }, (error) => {
      console.error("Firestore error:", error);
    });
    return () => unsubscribe();
  }, [user]);

  const allTags = useMemo(() => {
    const counts = {};
    cards.forEach(card => {
      card.tags.forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]); 
  }, [cards]);

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const matchesSearch = (card.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (card.content || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTag = selectedTagFilter ? card.tags.includes(selectedTagFilter) : true;
      return matchesSearch && matchesTag;
    });
  }, [cards, searchTerm, selectedTagFilter]);

  // --- 標題重複檢查 ---
  const isDuplicateTitle = useMemo(() => {
    if (!currentCard.title) return false;
    return cards.some(c => 
      c.title.trim().toLowerCase() === currentCard.title.trim().toLowerCase() && 
      c.id !== currentCard.id // 排除自己 (編輯模式下)
    );
  }, [cards, currentCard.title, currentCard.id]);

  // --- 卡片操作邏輯 ---
  const handleSaveCard = async () => {
    if (!currentCard.title.trim() || !user || isDuplicateTitle) return;
    const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'cards');

    try {
      if (currentCard.id) {
        const cardDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'cards', currentCard.id);
        const { id, ...dataToUpdate } = currentCard;
        await updateDoc(cardDoc, dataToUpdate);
        setModalMode('view'); // 儲存後切換回閱讀模式
      } else {
        const { id, ...dataToSave } = currentCard;
        const docRef = await addDoc(cardsRef, {
          ...dataToSave,
          createdAt: Date.now()
        });
        setCurrentCard({ ...currentCard, id: docRef.id });
        setModalMode('view'); 
      }
      setTagInput('');
    } catch (error) {
      console.error("Error saving card:", error);
    }
  };

  const handleDeleteCard = async (id) => {
    if (!user) return;
    if (confirmDeleteId === id) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'cards', id));
        setConfirmDeleteId(null);
        if (isModalOpen && currentCard.id === id) {
            closeModal();
        }
      } catch (error) {
        console.error("Error deleting card:", error);
      }
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  // --- 視窗與導航邏輯 ---
  const openCardModal = (card = null) => {
    if (card) {
        setCurrentCard(card);
        setModalMode('view');
    } else {
        setCurrentCard({ id: null, title: '', content: '', tags: [] });
        setModalMode('edit');
    }
    setTagInput('');
    setIsModalOpen(true);
    setHistoryStack([]); // 重新打開時清空歷史
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setHistoryStack([]);
  };

  const handleLinkClick = (targetTitle) => {
    const targetCard = cards.find(c => c.title === targetTitle);
    
    // 將當前卡片推入歷史堆疊
    setHistoryStack(prev => [...prev, currentCard]);

    if (targetCard) {
        setCurrentCard(targetCard);
        setModalMode('view');
    } else {
        // 若找不到卡片，則自動建立一張包含該標題的新草稿並進入編輯模式
        setCurrentCard({ id: null, title: targetTitle, content: '', tags: [] });
        setModalMode('edit');
    }
  };

  const handleBack = () => {
    if (historyStack.length > 0) {
        const prevCard = historyStack[historyStack.length - 1];
        setHistoryStack(prev => prev.slice(0, -1)); // 移除最後一個
        setCurrentCard(prevCard);
        setModalMode('view'); // 返回時預設用閱讀模式
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !currentCard.tags.includes(tagInput.trim())) {
      setCurrentCard({ ...currentCard, tags: [...currentCard.tags, tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setCurrentCard({
      ...currentCard,
      tags: currentCard.tags.filter(t => t !== tagToRemove)
    });
  };

  // --- 內容渲染器 (解析 [[雙向連結]]) ---
  const renderContentWithLinks = (text) => {
    if (!text) return <span className="text-slate-400 italic">尚未填寫內容...</span>;
    
    // 使用正則表達式分割文字，提取 [[標題]]
    const parts = text.split(/\[\[(.*?)\]\]/g);
    
    return parts.map((part, i) => {
      // 奇數索引代表正則表達式捕獲的群組 (即括號內的文字)
      if (i % 2 === 1) {
        const targetExists = cards.some(c => c.title === part);
        return (
          <button
            key={i}
            onClick={() => handleLinkClick(part)}
            className={`inline-block px-1.5 py-0.5 mx-0.5 rounded cursor-pointer font-medium transition-colors border-b-2
              ${targetExists 
                ? 'text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-400' 
                : 'text-slate-500 border-dashed border-slate-300 hover:bg-slate-100 hover:text-slate-800'}`}
            title={targetExists ? "點擊跳轉至卡片" : "點擊建立新卡片"}
          >
            {part}
          </button>
        );
      }
      // 偶數索引是一般文字
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="flex h-screen w-full bg-slate-100 text-slate-800 font-sans overflow-hidden">
      
      {/* 側邊欄 */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-lg z-10 hidden md:flex">
        <div className="p-4 border-b border-slate-100">
          <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-600">
            <Network className="w-6 h-6" />
            TagMind
          </h1>
          <p className="text-xs text-slate-400 mt-1">標籤驅動的知識網絡</p>
        </div>

        <div className="p-4">
          <button 
            onClick={() => openCardModal()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4" />
            新增卡片
          </button>
        </div>

        <div className="px-4 py-2 overflow-y-auto flex-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">熱門標籤</div>
          <div className="space-y-1">
            <button 
               onClick={() => setSelectedTagFilter(null)}
               className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between transition-colors ${!selectedTagFilter ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-slate-50 text-slate-600'}`}
            >
              <span>全部顯示</span>
              <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full text-xs">{cards.length}</span>
            </button>
            {allTags.map(([tag, count]) => (
              <button 
                key={tag}
                onClick={() => setSelectedTagFilter(tag === selectedTagFilter ? null : tag)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between transition-colors ${selectedTagFilter === tag ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-slate-50 text-slate-600'}`}
              >
                <div className="flex items-center gap-2">
                  <Tag className="w-3 h-3" />
                  <span>{tag}</span>
                </div>
                <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-xs">{count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 主內容區 */}
      <div className="flex-1 flex flex-col relative h-full">
        {/* 頂部導航列 */}
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10">
          <div className="flex items-center gap-4 bg-slate-100 px-3 py-1.5 rounded-full w-full max-w-md border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-200 transition-all">
            <Search className="w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="搜尋卡片標題或內容..." 
              className="bg-transparent border-none outline-none text-sm w-full placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              title="網格視圖"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('network')}
              className={`p-2 rounded-md transition-all ${viewMode === 'network' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              title="網絡視圖"
            >
              <Network className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 內容顯示區 */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 relative">
          
          {selectedTagFilter && (
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm text-slate-500">篩選中：</span>
              <span className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 ${getTagColor(selectedTagFilter)}`}>
                <Tag className="w-3 h-3" />
                {selectedTagFilter}
                <button onClick={() => setSelectedTagFilter(null)} className="ml-1 hover:text-black/50"><X className="w-3 h-3" /></button>
              </span>
            </div>
          )}

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
              {filteredCards.length === 0 ? (
                <div className="col-span-full text-center py-20 text-slate-400">
                  <p>找不到符合條件的卡片</p>
                  <button onClick={() => openCardModal()} className="mt-4 text-indigo-600 hover:underline">建立一張新卡片？</button>
                </div>
              ) : (
                filteredCards.map(card => (
                  <div 
                    key={card.id} 
                    onClick={() => openCardModal(card)}
                    className="group bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all cursor-pointer flex flex-col h-64"
                  >
                    <h3 className="font-bold text-lg text-slate-800 mb-2 line-clamp-1 group-hover:text-indigo-600 transition-colors">{card.title}</h3>
                    <p className="text-slate-600 text-sm mb-4 line-clamp-4 flex-1">
                      {/* 在網格視圖簡單移除了 [[ 和 ]] 符號以保持乾淨 */}
                      {card.content.replace(/\[\[(.*?)\]\]/g, '$1')}
                    </p>
                    
                    <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-slate-100">
                      {card.tags.length > 0 ? (
                         card.tags.slice(0, 3).map(tag => (
                          <span key={tag} className={`text-xs px-2 py-0.5 rounded-full border ${getTagColor(tag)}`}>
                            #{tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 italic">無標籤</span>
                      )}
                      {card.tags.length > 3 && (
                        <span className="text-xs text-slate-400 px-1">+{card.tags.length - 3}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="h-full w-full">
              <NetworkGraph 
                cards={filteredCards} 
                onNodeClick={(card) => openCardModal(card)}
              />
            </div>
          )}
        </div>
      </div>

      {/* 編輯器/閱讀器 Modal (覆蓋層) */}
      {isModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                {historyStack.length > 0 && (
                   <button 
                     onClick={handleBack}
                     className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
                   >
                     <ArrowLeft className="w-4 h-4" /> 返回
                   </button>
                )}
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  {modalMode === 'view' ? '閱讀卡片' : (currentCard.id ? '編輯卡片' : '新卡片')}
                </h2>
              </div>
              
              <div className="flex items-center gap-2">
                {modalMode === 'view' ? (
                  <button 
                    onClick={() => setModalMode('edit')}
                    className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
                  >
                    <Edit3 className="w-4 h-4" /> 編輯
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                        // 只有已存在的卡片可以放棄編輯回到檢視，新卡片只能關閉
                        if (currentCard.id) {
                            // 重新抓取原本的資料 (為求簡單這裡只切換模式，未儲存的變更會保留在 state 中)
                            setModalMode('view');
                        }
                    }}
                    className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 text-sm"
                    title="切換回閱讀模式"
                  >
                    <Eye className="w-4 h-4" /> 預覽
                  </button>
                )}

                {currentCard.id && (
                  <button 
                    onClick={() => handleDeleteCard(currentCard.id)}
                    className={`p-2 rounded-lg transition-colors ${confirmDeleteId === currentCard.id ? 'bg-red-500 text-white shadow-md' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                    title={confirmDeleteId === currentCard.id ? "再次點擊以確認刪除" : "刪除"}
                  >
                    {confirmDeleteId === currentCard.id ? <span className="text-xs px-1 font-bold whitespace-nowrap">確認刪除</span> : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button 
                  onClick={closeModal}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              {modalMode === 'edit' ? (
                 <>
                    <input
                      type="text"
                      placeholder="卡片標題"
                      className={`w-full text-2xl font-bold text-slate-800 placeholder:text-slate-300 border-b-2 outline-none bg-transparent mb-2 pb-1 transition-colors ${isDuplicateTitle ? 'border-red-400 focus:border-red-500' : 'border-transparent focus:border-indigo-300'}`}
                      value={currentCard.title}
                      onChange={(e) => setCurrentCard({ ...currentCard, title: e.target.value })}
                      autoFocus={!currentCard.id}
                    />
                    
                    {/* 重複標題警告 */}
                    {isDuplicateTitle && (
                      <p className="text-sm text-red-500 mb-4 flex items-center gap-1 animate-in fade-in">
                        ⚠️ 此標題已存在，請修改標題以確保雙向連結正常運作。
                      </p>
                    )}

                    <div className="mb-2 min-h-[150px]">
                      <textarea
                        placeholder="寫下你的想法..."
                        className="w-full h-full min-h-[200px] resize-none text-slate-600 placeholder:text-slate-300 border-none outline-none bg-transparent leading-relaxed"
                        value={currentCard.content}
                        onChange={(e) => setCurrentCard({ ...currentCard, content: e.target.value })}
                      />
                    </div>
                    <p className="text-xs text-indigo-500 bg-indigo-50 px-3 py-2 rounded mb-4">
                       💡 <b>小提示</b>：在文字中輸入 <code>[[另一張卡片的標題]]</code> 即可自動建立雙向連結！
                    </p>
                 </>
              ) : (
                 <>
                    <h1 className="text-2xl font-bold text-slate-800 mb-6">{currentCard.title}</h1>
                    <div className="text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[150px] text-lg">
                       {renderContentWithLinks(currentCard.content)}
                    </div>
                 </>
              )}

              {/* 標籤區塊 (檢視與編輯模式皆顯示) */}
              <div className="border-t border-slate-100 pt-4 mt-8">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">標籤 (Tags)</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {currentCard.tags.map(tag => (
                    <span key={tag} className={`px-3 py-1 rounded-full text-sm flex items-center gap-1 shadow-sm ${getTagColor(tag)}`}>
                      <Tag className="w-3 h-3" />
                      {tag}
                      {modalMode === 'edit' && (
                         <button onClick={() => removeTag(tag)} className="ml-1 hover:text-black/50 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                      )}
                    </span>
                  ))}
                  
                  {modalMode === 'edit' && (
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        placeholder="新增標籤..."
                        className="bg-slate-100 px-3 py-1 rounded-full text-sm outline-none border border-transparent focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all w-32"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addTag()}
                      />
                      {tagInput && (
                        <button onClick={addTag} className="absolute right-2 text-indigo-600 hover:text-indigo-800">
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                  
                  {currentCard.tags.length === 0 && modalMode === 'view' && (
                      <span className="text-sm text-slate-400 italic">這張卡片還沒有標籤</span>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer (僅編輯模式顯示儲存按鈕) */}
            {modalMode === 'edit' && (
               <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                  <button 
                   onClick={handleSaveCard}
                   disabled={isDuplicateTitle || !currentCard.title.trim()}
                   className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 shadow-md transition-all active:scale-95 ${isDuplicateTitle || !currentCard.title.trim() ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                 >
                   <Save className="w-4 h-4" />
                   儲存卡片
                 </button>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}