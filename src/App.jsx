import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Search, Network, Grid, Tag, X, Save, Trash2, Edit3, ArrowLeft, Eye, LogIn, LogOut, User, Menu, Mail, Lock } from 'lucide-react';
// 加入 getApps, getApp 以防止 Firebase 重複初始化崩潰
import { initializeApp, getApps, getApp } from 'firebase/app';
// ⚠️ 新增引入 sendPasswordResetEmail
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, linkWithPopup, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// --- ⚠️ 請替換為您的 Firebase 設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyCg0O0I5y_jZIsa43Ad91rkRM3ybJ6hbtE", 
  authDomain: "tagmindcard.firebaseapp.com",
  projectId: "tagmindcard",
  storageBucket: "tagmindcard.firebasestorage.app",
  messagingSenderId: "706276976392",
  appId: "1:706276976392:web:78cce0dc5692a422356ebd",
  measurementId: "G-M2NE63D19Z"
};

// 安全的 Firebase 初始化
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
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
      ...card, 
      tags: card.tags || [], 
      x: Math.random() * 800, y: Math.random() * 600, vx: 0, vy: 0, 
      radius: 30 + ((card.tags || []).length * 2) 
    }));
    const uniqueLinks = new Map();

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const intersection = nodes[i].tags.filter(t => nodes[j].tags.includes(t));
        if (intersection.length > 0) uniqueLinks.set(`${i}-${j}`, { source: i, target: j, type: 'tag', strength: intersection.length });
      }
    }

    nodes.forEach((node, i) => {
       const content = node.content || ''; 
       const linkMatches = [...content.matchAll(/\[\[(.*?)\]\]/g)].map(m => m[1]);
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
    if (!canvas) return;
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
      if (!width || !height) return; 
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
        const title = node.title || '無標題';
        const label = title.length > 5 ? title.substring(0, 5) + '...' : title;
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
  
  // UI 狀態
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('view'); 
  const [currentCard, setCurrentCard] = useState({ id: null, title: '', content: '', tags: [] });
  const [historyStack, setHistoryStack] = useState([]); 
  
  const [tagInput, setTagInput] = useState('');
  const [isTagInputFocused, setIsTagInputFocused] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  
  // 登入 Modal 狀態
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true); 
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        signInAnonymously(auth).catch(err => console.error("匿名登入失敗:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setAuthError('');
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      if (user && user.isAnonymous) {
        await linkWithPopup(user, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
      setIsAuthModalOpen(false);
    } catch (error) {
      console.error("Google登入錯誤:", error);
      if (error.code === 'auth/credential-already-in-use') {
         await signInWithPopup(auth, provider);
         setIsAuthModalOpen(false);
      } else {
         setAuthError("Google 登入失敗或被瀏覽器阻擋。如果您使用手機，請改用信箱登入。");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsLoggingIn(true);
    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        if (user && user.isAnonymous) {
            try {
                await createUserWithEmailAndPassword(auth, authEmail, authPassword);
            } catch (err) {
                throw err;
            }
        } else {
            await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        }
      }
      setIsAuthModalOpen(false);
      setAuthEmail('');
      setAuthPassword('');
    } catch (error) {
      console.error("信箱驗證錯誤:", error);
      if (error.code === 'auth/invalid-credential') setAuthError("信箱或密碼錯誤，請重新確認或切換至註冊模式。");
      else if (error.code === 'auth/user-not-found') setAuthError("找不到此帳號，請切換至註冊模式。");
      else if (error.code === 'auth/wrong-password') setAuthError("密碼錯誤，請重試。");
      else if (error.code === 'auth/email-already-in-use') setAuthError("此信箱已被 Google 或其他方式註冊，請切換至登入模式。若沒有密碼請點擊下方「忘記密碼」。");
      else if (error.code === 'auth/weak-password') setAuthError("密碼太弱，至少需要 6 個字元。");
      else setAuthError("驗證失敗，請檢查信箱格式或網路。");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // --- 新增：發送重設密碼信件功能 ---
  const handleResetPassword = async () => {
    if (!authEmail.trim()) {
      setAuthError("請先在上方輸入您的電子信箱");
      return;
    }
    setIsLoggingIn(true);
    try {
      await sendPasswordResetEmail(auth, authEmail);
      alert("設定/重設密碼信件已發送！\n請前往信箱收信設定密碼後，即可回到此處用該密碼登入。");
      setAuthError('');
    } catch (error) {
      console.error("重設密碼錯誤:", error);
      if (error.code === 'auth/user-not-found') setAuthError("找不到此信箱，請確認是否輸入正確。");
      else setAuthError("發送重設信失敗，請稍後再試。");
    } finally {
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'cards');
    const unsubscribe = onSnapshot(cardsRef, (snapshot) => {
      const loadedCards = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          title: doc.data().title || '',
          content: doc.data().content || '',
          tags: doc.data().tags || [],
          ...doc.data() 
      }));
      setCards(loadedCards);
    }, (error) => console.error("Firestore error:", error));
    return () => unsubscribe();
  }, [user]);

  const allTags = useMemo(() => {
    const counts = {};
    cards.forEach(card => (card.tags || []).forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]); 
  }, [cards]);

  const suggestedTags = useMemo(() => {
    const lowerInput = tagInput.trim().toLowerCase();
    const currentTags = currentCard.tags || [];
    const availableTags = allTags.map(([tag]) => tag).filter(tag => !currentTags.includes(tag));
    if (!lowerInput) return availableTags.slice(0, 5);
    return availableTags.filter(tag => tag.toLowerCase().includes(lowerInput)).slice(0, 5); 
  }, [tagInput, allTags, currentCard.tags]);

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const cardTitle = card.title || '';
      const cardContent = card.content || '';
      const cardTags = card.tags || [];
      const matchesSearch = cardTitle.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            cardContent.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTag = selectedTagFilter ? cardTags.includes(selectedTagFilter) : true;
      return matchesSearch && matchesTag;
    });
  }, [cards, searchTerm, selectedTagFilter]);

  const isDuplicateTitle = useMemo(() => {
    const currentTitle = (currentCard.title || '').trim().toLowerCase();
    if (!currentTitle) return false;
    return cards.some(c => (c.title || '').trim().toLowerCase() === currentTitle && c.id !== currentCard.id);
  }, [cards, currentCard.title, currentCard.id]);

  const handleSaveCard = async () => {
    const titleToSave = (currentCard.title || '').trim();
    if (!titleToSave || !user || isDuplicateTitle) return;
    
    const cardsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'cards');
    try {
      const dataToSave = {
          title: titleToSave,
          content: currentCard.content || '',
          tags: currentCard.tags || []
      };

      if (currentCard.id) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'cards', currentCard.id), dataToSave);
      } else {
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
    if (card) { 
        setCurrentCard({ ...card, tags: card.tags || [], content: card.content || '', title: card.title || '' }); 
        setModalMode('view'); 
    } 
    else { 
        setCurrentCard({ id: null, title: '', content: '', tags: [] }); 
        setModalMode('edit'); 
    }
    setTagInput(''); setIsModalOpen(true); setHistoryStack([]); 
  };

  const closeModal = () => { setIsModalOpen(false); setHistoryStack([]); };

  const handleLinkClick = (targetTitle) => {
    const targetCard = cards.find(c => (c.title || '') === targetTitle);
    setHistoryStack(prev => [...prev, currentCard]);
    if (targetCard) { 
        setCurrentCard({ ...targetCard, tags: targetCard.tags || [], content: targetCard.content || '', title: targetCard.title || '' }); 
        setModalMode('view'); 
    } 
    else { 
        setCurrentCard({ id: null, title: targetTitle, content: '', tags: [] }); 
        setModalMode('edit'); 
    }
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
    const currentTags = currentCard.tags || [];
    if (newTag && !currentTags.includes(newTag)) {
      setCurrentCard({ ...currentCard, tags: [...currentTags, newTag] });
      setTagInput(''); setIsTagInputFocused(false); 
    }
  };

  const removeTag = (tagToRemove) => {
    const currentTags = currentCard.tags || [];
    setCurrentCard({ ...currentCard, tags: currentTags.filter(t => t !== tagToRemove) });
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
          const targetExists = cards.some(c => (c.title || '') === part);
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
          <button className="md:hidden p-2 text-slate-400 hover:text-slate-600" onClick={() => setIsMobileSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        
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
          {user && !user.isAnonymous ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-slate-700 font-medium truncate">
                <User className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="truncate" title={user.email || user.displayName}>{user.email || user.displayName || '已登入'}</span>
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
              <button onClick={() => { setIsAuthModalOpen(true); setIsMobileSidebarOpen(false); }} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-2 px-3 rounded-md flex items-center justify-center gap-1.5 transition-all shadow-sm font-medium">
                <LogIn className="w-3 h-3" /> 登入 / 註冊以同步
              </button>
            </div>
          )}
        </div>
      </div>

      {/* --- 主內容區 --- */}
      <div className="flex-1 flex flex-col relative h-[100dvh] overflow-hidden">
        {/* 頂部導航列 */}
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 shadow-sm z-10 gap-2">
          
          <button className="md:hidden p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg shrink-0" onClick={() => setIsMobileSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-2 sm:gap-4 bg-slate-100 px-3 py-1.5 sm:py-2 rounded-full flex-1 max-w-md border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-200 transition-all">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input type="text" placeholder="搜尋卡片..." className="bg-transparent border-none outline-none text-sm w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            {searchTerm && <button onClick={() => setSearchTerm('')} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
          </div>
          
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
                    <h3 className="font-bold text-lg text-slate-800 mb-2 line-clamp-1 group-hover:text-indigo-600">{card.title || '無標題'}</h3>
                    <p className="text-slate-600 text-sm mb-4 line-clamp-4 sm:line-clamp-5 flex-1 whitespace-pre-wrap">
                      {(card.content || '').replace(/\[\[(.*?)\]\]/g, '$1').replace(/^[-*]\s+\[\s\]\s+/gm, '☐ ').replace(/^[-*]\s+\[[xX]\]\s+/gm, '☑ ')}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-slate-100">
                      {(card.tags || []).slice(0, 3).map(tag => <span key={tag} className={`text-xs px-2 py-0.5 rounded-full border ${getTagColor(tag)}`}>#{tag}</span>)}
                      {(card.tags || []).length > 3 && <span className="text-xs text-slate-400 px-1">+{(card.tags || []).length - 3}</span>}
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

      <button onClick={() => openCardModal()} className="md:hidden fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-2xl z-30 transition-transform active:scale-95">
        <Plus className="w-6 h-6" />
      </button>

      {/* --- 獨立登入/註冊 Modal --- */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">{isLoginMode ? '登入帳號' : '註冊新帳號'}</h2>
              <button onClick={() => setIsAuthModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleEmailAuth} className="p-6 flex flex-col gap-4">
              {authError && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{authError}</div>}
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Mail className="w-3 h-3"/> 電子信箱</label>
                <input type="email" required value={authEmail} onChange={e => setAuthEmail(e.target.value)} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-sm" placeholder="your@email.com" />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Lock className="w-3 h-3"/> 密碼</label>
                <input type="password" required={isLoginMode} value={authPassword} onChange={e => setAuthPassword(e.target.value)} 
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-sm" placeholder="至少 6 個字元" />
              </div>

              {/* 加入忘記密碼 / 設定密碼功能 */}
              {isLoginMode && (
                <div className="flex justify-end mt-[-8px]">
                  <button type="button" onClick={handleResetPassword} className="text-[11px] text-indigo-600 hover:underline">
                    忘記密碼 / 設定 Google 帳號密碼？
                  </button>
                </div>
              )}

              <button type="submit" disabled={isLoggingIn} className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg shadow-md transition-all active:scale-95 disabled:opacity-50">
                {isLoggingIn ? '處理中...' : (isLoginMode ? '登入' : '註冊')}
              </button>

              <div className="text-center mt-2">
                <button type="button" onClick={() => { setIsLoginMode(!isLoginMode); setAuthError(''); }} className="text-xs text-indigo-600 hover:underline">
                  {isLoginMode ? '還沒有帳號？點此註冊' : '已經有帳號？點此登入'}
                </button>
              </div>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 mx-4 text-slate-400 text-xs">或者用瀏覽器</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <button type="button" onClick={handleGoogleLogin} className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-2.5 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/><path fill="none" d="M1 1h22v22H1z"/></svg>
                Google 登入
              </button>
            </form>
          </div>
        </div>
      )}

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
                    <input type="text" placeholder="卡片標題" value={currentCard.title || ''} onChange={(e) => setCurrentCard({ ...currentCard, title: e.target.value })}
                      className={`w-full text-xl sm:text-2xl font-bold text-slate-800 placeholder:text-slate-300 border-b-2 outline-none bg-transparent mb-2 pb-1 ${isDuplicateTitle ? 'border-red-400' : 'border-transparent focus:border-indigo-300'}`} autoFocus={!currentCard.id} />
                    {isDuplicateTitle && <p className="text-sm text-red-500 mb-4">⚠️ 此標題已存在，請修改。</p>}

                    <div className="mb-2 min-h-[200px] sm:min-h-[150px] flex-1">
                      <textarea placeholder="寫下你的靈感..." value={currentCard.content || ''} onChange={(e) => setCurrentCard({ ...currentCard, content: e.target.value })}
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
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 sm:mb-6">{currentCard.title || '無標題'}</h1>
                    <div className="text-slate-700 leading-relaxed text-base sm:text-lg">
                       {renderFormattedContent(currentCard.content)}
                    </div>
                 </>
              )}

              <div className="border-t border-slate-100 pt-4 mt-6 sm:mt-8 pb-4">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">標籤</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(currentCard.tags || []).map(tag => (
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
                  <button onClick={handleSaveCard} disabled={isDuplicateTitle || !(currentCard.title || '').trim()}
                   className={`w-full sm:w-auto px-6 py-3 sm:py-2 rounded-xl sm:rounded-lg font-bold sm:font-medium flex items-center justify-center gap-2 shadow-md ${isDuplicateTitle || !(currentCard.title || '').trim() ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
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