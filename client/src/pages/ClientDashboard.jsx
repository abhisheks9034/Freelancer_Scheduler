import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
    fetchClientBookings, cancelBooking, fetchMyFreelancers,
    fetchAvailability, requestMeeting, fetchDirectory, chatWithAI,
    fetchChatThreads, fetchThreadMessages, SOCKET_BASE_URL,
    fetchAllServices
} from '../api';

const ClientDashboard = () => {
    const user = JSON.parse(sessionStorage.getItem('user')) || { name: 'Client' };
    const [bookings, setBookings] = useState([]);
    const [freelancers, setFreelancers] = useState([]);
    const [directory, setDirectory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('upcoming'); // upcoming | history | professionals | marketplace | messages | ai
    const [services, setServices] = useState([]);

    // Modal state
    const [selectedFreelancer, setSelectedFreelancer] = useState(null);
    const [freelancerSlots, setFreelancerSlots] = useState([]);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [bookingSlot, setBookingSlot] = useState(null);
    const [bookingError, setBookingError] = useState('');

    // Custom request state
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [customFormData, setCustomFormData] = useState({
        booking_date: '',
        start_time: '',
        end_time: ''
    });

    // AI Assistant State

    const [chatMessages, setChatMessages] = useState([
        { role: 'ai', text: `Hello ${user.name.split(' ')[0]}! I've analyzed your schedule. You have ${bookings.filter(b => b.status === 'confirmed').length} confirmed sessions. How can I help you today?` }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [aiTyping, setAiTyping] = useState(false);
    const aiChatRef = React.useRef(null);
    const dmChatRef = React.useRef(null);

    useEffect(() => {
        const t = setTimeout(() => {
            if (aiChatRef.current) {
                aiChatRef.current.scrollTop = aiChatRef.current.scrollHeight;
            }
        }, 50);
        return () => clearTimeout(t);
    }, [chatMessages, aiTyping]);




    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');    // professionals tab
    const [marketplaceQuery, setMarketplaceQuery] = useState(''); // marketplace tab
    const [marketplaceSort, setMarketplaceSort] = useState('newest'); // newest | price_asc | price_desc | duration
    const [maxRate, setMaxRate] = useState(250);
    const [showQuickBook, setShowQuickBook] = useState(false);
    const [quickBookData, setQuickBookData] = useState({
        freelancer_id: '',
        booking_date: '',
        start_time: '',
        end_time: ''
    });
    const [toast, setToast] = useState({ show: false, type: 'info', text: '' });
    const [cancelBookingId, setCancelBookingId] = useState(null);
    const [threads, setThreads] = useState([]);
    const [activeThread, setActiveThread] = useState(null);
    const [threadMessages, setThreadMessages] = useState([]);
    const [threadInput, setThreadInput] = useState('');
    const [chatBusy, setChatBusy] = useState(false);
    const socketRef = React.useRef(null);
    const activeThreadRef = React.useRef(null);

    useEffect(() => {
        const t = setTimeout(() => {
            if (dmChatRef.current) {
                dmChatRef.current.scrollTop = dmChatRef.current.scrollHeight;
            }
        }, 50);
        return () => clearTimeout(t);
    }, [threadMessages]);

    const pushToast = (text, type = 'info') => {
        setToast({ show: true, type, text });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 2800);
    };
    const renderSafeMarkdown = (text = '') => {
        const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, idx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <b key={idx}>{part.slice(2, -2)}</b>;
            }
            return <React.Fragment key={idx}>{part}</React.Fragment>;
        });
    };

    const loadData = async () => {
        try {
            // We are adding individual .catch blocks so if one fails, it doesn't break the others!
            const [bRes, fRes, dRes, sRes] = await Promise.all([
                fetchClientBookings().catch(err => {
                    console.error("❌ Bookings Error:", err.response?.data || err.message);
                    return { data: [] };
                }),
                fetchMyFreelancers().catch(err => {
                    console.error("❌ Professionals Error:", err.response?.data || err.message);
                    return { data: [] };
                }),
                fetchDirectory().catch(err => {
                    console.error("❌ Directory Error:", err.response?.data || err.message);
                    return { data: [] };
                }),
                fetchAllServices().catch(err => {
                    console.error("❌ Services Error:", err.response?.data || err.message);
                    return { data: [] };
                })
            ]);

            setBookings(bRes.data || []);
            setFreelancers(fRes.data || []);
            setDirectory((dRes.data || []).filter(f => f.email !== user.email));
            setServices(sRes.data || []);

        } catch (err) {
            console.error("Critical Load Error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleCancel = async (id) => {
        try {
            await cancelBooking(id);
            setCancelBookingId(null);
            await loadData();
            pushToast('Booking cancelled.', 'success');
        } catch (err) {
            pushToast('Failed to cancel booking.', 'error');
        }
    };

    const handleOpenBooking = async (f) => {
        setSelectedFreelancer(f);
        setLoadingSlots(true);
        setFreelancerSlots([]);
        setBookingSlot(null);
        setBookingError('');
        try {
            const { data } = await fetchAvailability(f.id);
            setFreelancerSlots((data || []).filter(s => !s.is_booked));
        } catch {
            setBookingError('Failed to load slots.');
        } finally {
            setLoadingSlots(false);
        }
    };

    const handleConfirmRequest = async () => {
        if (!bookingSlot) return;
        try {
            const { data } = await requestMeeting({
                freelancer_id: selectedFreelancer.id,
                booking_date: bookingSlot.booking_date,
                start_time: bookingSlot.start_time,
                end_time: bookingSlot.end_time
            });
            pushToast('Meeting request sent. Awaiting freelancer approval.', 'success');
            if (data?.warning) pushToast(data.warning, 'error');
            setSelectedFreelancer(null);
            await loadData();
        } catch (err) {
            setBookingError(err.response?.data?.error || 'Request failed.');
        }
    };

    const handleCustomRequest = async (e) => {
        e.preventDefault();
        try {
            const { data } = await requestMeeting({
                freelancer_id: selectedFreelancer.id,
                ...customFormData
            });
            pushToast('Custom meeting request sent. Awaiting freelancer approval.', 'success');
            if (data?.warning) pushToast(data.warning, 'error');
            setShowCustomModal(false);
            setSelectedFreelancer(null);
            await loadData();
        } catch (err) {
            setBookingError(err.response?.data?.error || 'Custom request failed.');
        }
    };

    const handleUseSuggestedSlot = async (slot) => {
        try {
            const { data } = await requestMeeting({
                freelancer_id: slot.freelancer_id,
                booking_date: slot.booking_date,
                start_time: slot.start_time,
                end_time: slot.end_time
            });
            setChatMessages(prev => [
                ...prev,
                { role: 'ai', text: `✅ Requested **${slot.freelancer_name}** on ${slot.booking_date} from ${slot.start_time} to ${slot.end_time}.` }
            ]);
            if (data?.warning) {
                setChatMessages(prev => [...prev, { role: 'ai', text: `⚠️ ${data.warning}` }]);
            }
            await loadData();
        } catch (err) {
            setChatMessages(prev => [
                ...prev,
                { role: 'ai', text: err.response?.data?.error || 'That suggested slot is no longer available. Please try another one.' }
            ]);
        }
    };

    const handleSendChat = async (e) => {
        e.preventDefault();
        if (!chatInput.trim() || aiTyping) return;

        const userMsg = chatInput.trim();
        setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setChatInput('');
        setAiTyping(true);

        try {
            const { data } = await chatWithAI({ message: userMsg, history: chatMessages });
            setChatMessages(prev => [...prev, { role: 'ai', text: data.reply, suggestions: data.suggestions || [] }]);
        } catch (err) {
            console.error("Chat Interaction Failed:", err.response?.data?.error || err.message);
            setChatMessages(prev => [...prev, { role: 'ai', text: "I'm having trouble connecting right now. Please try again later." }]);
        } finally {
            setAiTyping(false);
        }
    };

    const loadThreads = async () => {
        try {
            const { data } = await fetchChatThreads();
            setThreads(data || []);
        } catch (err) {
            console.error('Failed to load chat threads:', err.response?.data || err.message);
        }
    };

    const openThread = async (thread) => {
        setActiveThread(thread);
        activeThreadRef.current = thread;
        setChatBusy(true);
        try {
            const { data } = await fetchThreadMessages(thread.counterpart_id);
            setThreadMessages(data || []);
        } catch (err) {
            pushToast(err.response?.data?.error || 'Unable to load messages.', 'error');
        } finally {
            setChatBusy(false);
        }
    };

    const handleSendThreadMessage = async (e) => {
        e.preventDefault();
        const text = threadInput.trim();
        if (!activeThread || !text) return;
        if (!socketRef.current || !socketRef.current.connected) {
            pushToast('Realtime connection unavailable. Please wait a moment.', 'error');
            return;
        }
        socketRef.current.emit('send_message', {
            counterpartId: activeThread.counterpart_id,
            message_text: text
        });
        setThreadInput('');
    };

    useEffect(() => {
        if (tab !== 'messages') return;
        loadThreads();
    }, [tab]);

    useEffect(() => {
        if (tab !== 'messages' || !activeThread) return;
        if (socketRef.current?.connected) {
            socketRef.current.emit('join_thread', { counterpartId: activeThread.counterpart_id });
        }
        const id = setInterval(async () => {
            try {
                const { data } = await fetchThreadMessages(activeThread.counterpart_id);
                setThreadMessages(data || []);
            } catch (err) {
                // silent polling failure
            }
        }, 1200);
        return () => clearInterval(id);
    }, [tab, activeThread]);

    useEffect(() => {
        activeThreadRef.current = activeThread;
    }, [activeThread]);

    useEffect(() => {
        if (tab !== 'messages') return;
        const id = setInterval(() => {
            loadThreads();
        }, 8000);
        return () => clearInterval(id);
    }, [tab]);

    useEffect(() => {
        const token = sessionStorage.getItem('token');
        if (!token) return;
        const socket = io(SOCKET_BASE_URL, {
            transports: ['websocket'],
            auth: { token }
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            if (activeThreadRef.current) {
                socket.emit('join_thread', { counterpartId: activeThreadRef.current.counterpart_id });
            }
        });

        socket.on('new_message', ({ counterpartId, message }) => {
            if (!message) return;
            if (activeThreadRef.current && Number(activeThreadRef.current.counterpart_id) === Number(counterpartId)) {
                setThreadMessages(prev => {
                    if (prev.some((m) => m.id === message.id)) return prev;
                    return [...prev, message];
                });
            }
            loadThreads();
        });

        socket.on('chat_error', (payload) => {
            if (payload?.message) pushToast(payload.message, 'error');
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
    const fmtTime = (t) => t ? t.substring(0, 5) : '';
    const getInitials = (name) => name?.substring(0, 2).toUpperCase() || '??';

    const upcoming = bookings.filter(b => {
        if (b.status !== 'confirmed' && b.status !== 'pending') return false;
        
        const now = new Date();
        const bDate = new Date(b.booking_date);
        const bDay = new Date(bDate.getFullYear(), bDate.getMonth(), bDate.getDate());
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (bDay > today) return true;
        if (bDay < today) return false;
        
        // It's today! Check end_time
        const [h, m] = (b.end_time || "00:00:00").split(':').map(Number);
        const sessionEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
        return sessionEnd > now;
    });
    const history = bookings.filter(b => !upcoming.includes(b));

    const activeList = tab === 'upcoming' ? upcoming : tab === 'history' ? history : [];

    return (
        <div className="min-h-screen bg-dark-950 text-slate-200 font-syne flex flex-col md:flex-row">
            {/* Left Sidebar */}
            <aside className="w-full md:w-64 glass border-r border-white/5 flex flex-col h-auto md:h-screen sticky top-0 z-50 shrink-0">
                <div className="px-6 py-5 flex items-center gap-3 border-b border-white/5">
                    <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center shadow-lg shadow-accent-500/20">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" fill="white" /><rect x="8" y="1" width="5" height="5" rx="1" fill="white" opacity="0.6" /><rect x="1" y="8" width="5" height="5" rx="1" fill="white" opacity="0.6" /><rect x="8" y="8" width="5" height="5" rx="1" fill="white" /></svg>
                    </div>
                    <span className="font-bold text-white text-sm uppercase tracking-widest hidden md:block">Client Portal</span>
                </div>
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto hidden md:block custom-scrollbar">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 mt-1 px-2">Navigation</div>
                    {[
                        { id: 'upcoming', label: 'Upcoming', icon: '🗓️' },
                        { id: 'history', label: 'History', icon: '⏳' },
                        { id: 'marketplace', label: 'Marketplace', icon: '🛒' },
                        { id: 'professionals', label: 'Directory', icon: '💼' },
                        { id: 'messages', label: 'Messages', icon: '💬' },
                        { id: 'ai', label: 'AI Assistant', icon: '✨' },
                    ].map(item => (
                        <button
                            key={item.id}
                            onClick={() => setTab(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-standard ${tab === item.id ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
                        >
                            <span className="text-base shrink-0">{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </nav>


                {/* Mobile Tab nav */}
                <nav className="md:hidden flex overflow-x-auto p-4 gap-2 border-b border-white/5 bg-dark-900/80 custom-scrollbar">
                    {['upcoming', 'history', 'marketplace', 'professionals', 'messages', 'ai'].map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-standard ${tab === t ? 'bg-accent-500 text-white shadow-md shadow-accent-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                        >
                            {t === 'ai' ? 'AI Assistant' : t === 'marketplace' ? 'Marketplace' : t === 'professionals' ? 'Directory' : t}
                        </button>
                    ))}
                </nav>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                {/* Top Header */}
                <header className="sticky top-0 z-40 glass border-b border-white/5 px-6 py-4 flex items-center justify-end shadow-sm">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setShowQuickBook(true)}
                            className="px-4 py-2 bg-white text-dark-950 font-bold text-[10px] uppercase tracking-widest rounded-lg hover:bg-slate-200 transition-standard shadow-lg active:scale-95 border border-white"
                        >
                            Quick Book
                        </button>
                        <Link to="/settings" className="text-xs text-slate-400 hover:text-white transition-standard uppercase tracking-widest font-bold">Settings</Link>
                        <div className="flex items-center gap-3 pl-6 border-l border-white/5">
                            <div className="text-right hidden sm:block">
                                <div className="text-sm font-bold text-white">{user.name}</div>
                                <div className="text-[10px] text-accent-500 uppercase font-bold tracking-tighter">Premium Client</div>
                            </div>
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-500 to-violet-500 flex items-center justify-center text-xs font-bold text-white shadow-lg overflow-hidden border border-white/10">
                                {getInitials(user.name)}
                            </div>
                            <button
                                onClick={() => { sessionStorage.clear(); window.location.href = '/auth'; }}
                                className="p-2 text-slate-500 hover:text-red-400 transition-standard"
                                title="Logout"
                            >
                                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                            </button>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto px-6 py-8 md:px-12 md:py-12 custom-scrollbar">
                    <div className="max-w-5xl mx-auto">
                        {tab === 'marketplace' ? (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <header className="mb-10 text-center">
                                    <h2 className="text-3xl font-bold text-white mb-2">Service Marketplace</h2>
                                    <p className="text-slate-400">Discover and book specific products from top professionals.</p>
                                </header>
                                
                                <div className="mb-8 max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-4">
                                    <div className="relative flex-1 w-full">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                        </span>
                                        <input 
                                            type="text" 
                                            placeholder="Search for web design, SEO..." 
                                            className="w-full bg-dark-900 border border-white/5 rounded-xl pl-9 pr-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard shadow-lg"
                                            value={marketplaceQuery}
                                            onChange={(e) => setMarketplaceQuery(e.target.value)}
                                        />
                                    </div>
                                    <select 
                                        value={marketplaceSort} 
                                        onChange={(e) => setMarketplaceSort(e.target.value)}
                                        className="bg-dark-900 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard shadow-lg cursor-pointer"
                                    >
                                        <option value="newest">Newest First</option>
                                        <option value="price_asc">Price: Low → High</option>
                                        <option value="price_desc">Price: High → Low</option>
                                        <option value="duration">Duration: Shortest</option>
                                    </select>
                                </div>

                                {services.length === 0 ? (
                                    <div className="text-center py-20 text-slate-500 italic glass border-dashed rounded-2xl">
                                        <div className="text-4xl mb-4 opacity-20">🛒</div>
                                        No services available yet. Check back soon!
                                    </div>
                                ) : (() => {
                                    const filtered = services.filter(s => 
                                        s.title.toLowerCase().includes(marketplaceQuery.toLowerCase()) || 
                                        (s.description || '').toLowerCase().includes(marketplaceQuery.toLowerCase()) ||
                                        s.freelancer_name.toLowerCase().includes(marketplaceQuery.toLowerCase())
                                    );
                                    const sorted = [...filtered].sort((a, b) => {
                                        if (marketplaceSort === 'price_asc') return Number(a.price) - Number(b.price);
                                        if (marketplaceSort === 'price_desc') return Number(b.price) - Number(a.price);
                                        if (marketplaceSort === 'duration') return (a.duration_minutes || 60) - (b.duration_minutes || 60);
                                        return 0; // newest — already sorted from API
                                    });
                                    return sorted.length === 0 ? (
                                        <div className="text-center py-16 text-slate-500 italic">No services match your search.</div>
                                    ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {sorted.map(service => (
                                            <div key={service.id} className="glass-card flex flex-col hover:border-accent-500/30 transition-standard group">
                                                <div className="p-6 flex-1 flex flex-col">
                                                    <div className="flex items-start justify-between mb-4">
                                                        <div className="bg-accent-500/10 text-accent-500 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-accent-500/20">
                                                            {service.duration_minutes} mins
                                                        </div>
                                                        <div className="text-2xl font-black text-white tracking-tight">${service.price}</div>
                                                    </div>
                                                    <h3 className="text-xl font-bold text-white mb-2">{service.title}</h3>
                                                    <p className="text-sm text-slate-400 mb-6 flex-1 line-clamp-3">{service.description || 'No description provided.'}</p>
                                                    
                                                    <div className="flex items-center gap-3 pt-4 border-t border-white/5 mt-auto">
                                                        <div className="w-8 h-8 rounded-full bg-dark-800 flex items-center justify-center font-bold text-xs text-white shadow-inner">
                                                            {service.freelancer_name.substring(0,2).toUpperCase()}
                                                        </div>
                                                        <div className="flex-1 overflow-hidden">
                                                            <div className="text-sm font-bold text-white truncate">{service.freelancer_name}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <Link 
                                                    to={`/book/${service.freelancer_id}?service_id=${service.id}`}
                                                    className="w-full py-4 bg-dark-800 hover:bg-accent-500 text-white font-bold text-sm transition-all duration-300 rounded-b-2xl border-t border-white/5 group-hover:border-transparent flex items-center justify-center gap-2"
                                                >
                                                    Book This Service
                                                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                                </Link>
                                            </div>
                                        ))}
                                    </div>
                                    );
                                })()}
                            </div>
                        ) : tab === 'professionals' ? (
                            <div className="flex items-center justify-between gap-4 mb-6 pb-6 border-b border-white/5 w-full">
                                <div className="text-lg font-bold text-white hidden md:block">Explore Professionals</div>
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Search experts..."
                                            className="bg-white/5 border border-white/5 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-accent-500/50 transition-standard w-48"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Rate: ${maxRate}</span>
                                        <input
                                            type="range"
                                            min="20"
                                            max="500"
                                            step="10"
                                            className="accent-accent-500 w-24 h-1 cursor-pointer"
                                            value={maxRate}
                                            onChange={(e) => setMaxRate(parseInt(e.target.value))}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {loading ? (
                            <div className="py-20 text-center animate-pulse text-slate-500 italic">Synchronizing workspace...</div>
                        ) : tab === 'ai' ? (
                            <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[500px]">
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl w-full mx-auto my-auto flex flex-col flex-1 max-h-[800px]">
                                    <div className="glass-card flex flex-col flex-1 overflow-hidden border-accent-500/20 shadow-2xl shadow-accent-500/5">
                                        <div className="p-6 border-b border-white/5 bg-accent-500/5 flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-accent-500/20 flex items-center justify-center text-accent-500 border border-accent-500/20 shadow-[0_0_15px_rgba(108,143,255,0.15)]">
                                                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-white tracking-tight">FreelanceOS Intelligence</h2>
                                                <p className="text-xs text-slate-500 flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    Powered by Groq Llama 3.3. I can analyze your dashboard and book meetings.
                                                </p>
                                            </div>
                                        </div>

                                        <div ref={aiChatRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-dark-900/40">
                                            {chatMessages.map((m, i) => (
                                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[85%] p-4 rounded-3xl text-sm font-medium shadow-sm leading-relaxed whitespace-pre-line ${m.role === 'user' ? 'bg-accent-500 text-white rounded-tr-sm shadow-accent-500/20' : 'bg-dark-800 text-slate-300 border border-white/5 rounded-tl-sm'}`}>
                                                        <div>{renderSafeMarkdown(m.text)}</div>
                                                        {m.role === 'ai' && Array.isArray(m.suggestions) && m.suggestions.length > 0 && (
                                                            <div className="mt-4 grid gap-2">
                                                                {m.suggestions.map((s, idx) => (
                                                                    <button
                                                                        key={`${s.freelancer_id}-${s.booking_date}-${s.start_time}-${idx}`}
                                                                        onClick={() => handleUseSuggestedSlot(s)}
                                                                        className="text-left p-3 rounded-xl bg-white/5 border border-white/10 hover:border-accent-500/40 hover:bg-accent-500/10 transition-standard"
                                                                    >
                                                                        <div className="text-white text-xs font-bold">{s.freelancer_name}</div>
                                                                        <div className="text-[11px] text-slate-400">{s.booking_date} • {s.start_time} - {s.end_time}</div>
                                                                        <div className="text-[10px] text-accent-500 font-bold uppercase tracking-wider mt-1">Request this slot</div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            {aiTyping && (
                                                <div className="flex justify-start">
                                                    <div className="bg-dark-800 p-4 rounded-3xl rounded-tl-sm border border-white/5 flex gap-1.5 items-center h-12">
                                                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <form onSubmit={handleSendChat} className="p-4 border-t border-white/5 bg-dark-950/50">
                                            <div className="relative flex items-center gap-3">
                                                <input
                                                    type="text"
                                                    value={chatInput}
                                                    onChange={e => setChatInput(e.target.value)}
                                                    placeholder="E.g., Can you book a meeting with Alex tomorrow at 14:00?"
                                                    className="flex-1 bg-dark-800 border border-white/10 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:border-accent-500 transition-standard"
                                                />
                                                <button type="submit" className="w-14 h-14 bg-accent-500 rounded-2xl flex items-center justify-center text-white hover:bg-accent-600 transition-standard shadow-lg shadow-accent-500/20 active:scale-95">
                                                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        ) : tab === 'messages' ? (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <header>
                                    <h2 className="text-3xl font-bold text-white mb-2">Messages</h2>
                                    <p className="text-slate-500 font-medium tracking-tight">Chat securely with freelancers you already matched with through pending or confirmed bookings.</p>
                                </header>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 h-auto lg:h-[70vh]">
                                    <div className="glass-card p-4 overflow-y-auto custom-scrollbar space-y-2">
                                        {threads.length === 0 ? (
                                            <div className="text-sm text-slate-500 p-4">No matched chats yet.</div>
                                        ) : (
                                            threads.map((t) => (
                                                <button
                                                    key={t.counterpart_id}
                                                    onClick={() => openThread(t)}
                                                    className={`w-full text-left p-3 rounded-xl border transition-standard ${
                                                        activeThread?.counterpart_id === t.counterpart_id
                                                            ? 'bg-accent-500/10 border-accent-500/40'
                                                            : 'bg-white/[0.02] border-white/5 hover:border-white/15'
                                                    }`}
                                                >
                                                    <div className="text-sm font-bold text-white">{t.counterpart_name}</div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-xs text-slate-500 truncate flex-1">{t.last_message || 'No messages yet'}</div>
                                                        {t.last_message_at && <div className="text-[9px] text-slate-600 font-mono whitespace-nowrap">{new Date(t.last_message_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                    <div className="lg:col-span-2 glass-card flex flex-col overflow-hidden min-h-[55vh] md:min-h-[60vh] lg:min-h-0">
                                        {!activeThread ? (
                                            <div className="flex-1 flex items-center justify-center text-slate-500">Select a chat to start messaging.</div>
                                        ) : (
                                            <>
                                                <div className="p-4 border-b border-white/5 text-white font-bold">{activeThread.counterpart_name}</div>
                                                <div ref={dmChatRef} className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-3 bg-dark-900/30">
                                                    {chatBusy ? (
                                                        <div className="text-slate-500 text-sm">Loading messages...</div>
                                                    ) : threadMessages.length === 0 ? (
                                                        <div className="text-slate-500 text-sm">No messages yet. Say hello.</div>
                                                    ) : (
                                                        threadMessages.map((m) => (
                                                            <div key={m.id} className={`flex ${m.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
                                                                <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                                                                    m.sender_id === user.id ? 'bg-accent-500 text-white' : 'bg-dark-800 text-slate-200 border border-white/5'
                                                                }`}>
                                                                    {m.message_text}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                                <form onSubmit={handleSendThreadMessage} className="p-4 border-t border-white/5 bg-dark-950/50">
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="text"
                                                            value={threadInput}
                                                            onChange={(e) => setThreadInput(e.target.value)}
                                                            placeholder="Write a message..."
                                                            maxLength={2000}
                                                            className="flex-1 bg-dark-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500"
                                                        />
                                                        <button type="submit" className="px-4 py-3 bg-accent-500 hover:bg-accent-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest">Send</button>
                                                    </div>
                                                    {threadInput.length > 0 && <div className={`text-right text-[10px] mt-1 font-mono ${threadInput.length > 1800 ? 'text-red-400' : 'text-slate-600'}`}>{threadInput.length}/2000</div>}
                                                </form>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : tab === 'professionals' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {(freelancers)
                                        .filter(f => (f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.title?.toLowerCase().includes(searchQuery.toLowerCase())) && (f.hourly_rate || 80) <= maxRate)
                                        .map(f => (
                                            <div key={f.id} className="glass-card p-6 flex flex-col group hover:border-white/10 transition-standard">
                                                <div className="flex items-start gap-4 mb-5">
                                                    <div className="w-14 h-14 rounded-2xl bg-dark-700 flex items-center justify-center text-lg font-bold text-white border border-white/5 overflow-hidden shadow-inner">
                                                        {f.avatar_url ? (
                                                            <img src={f.avatar_url} alt={f.name} className="w-full h-full object-cover" />
                                                        ) : getInitials(f.name)}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-white font-bold text-lg mb-0.5">{f.name}</div>
                                                        <div className="text-accent-500 text-xs font-bold uppercase tracking-tighter">{f.title || 'Expert Professional'}</div>
                                                    </div>
                                                </div>
                                                <p className="text-slate-400 text-sm mb-6 line-clamp-2 leading-relaxed italic">
                                                    "{f.bio || 'Available for strategic consulting and custom development projects.'}"
                                                </p>
                                                <div className="flex flex-wrap gap-1.5 mb-8">
                                                    {(f.skills || ['Node.js', 'React', 'Consulting']).slice(0, 3).map(s => (
                                                        <span key={s} className="px-2 py-1 bg-dark-800 text-[10px] font-bold text-slate-500 rounded border border-white/5">
                                                            {s}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between">
                                                    <div className="text-white font-mono font-bold">${f.hourly_rate || '80'}<span className="text-[10px] text-slate-600 ml-1">/hr</span></div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedFreelancer(f);
                                                                setShowCustomModal(true);
                                                                setBookingError('');
                                                            }}
                                                            className="px-4 py-2.5 bg-dark-800 text-slate-300 font-bold text-[10px] uppercase tracking-widest rounded-lg border border-white/5 hover:bg-dark-700 transition-standard"
                                                        >
                                                            Custom
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                handleOpenBooking(f);
                                                                setShowCustomModal(false);
                                                            }}
                                                            className="px-5 py-2.5 bg-white text-dark-950 font-bold text-xs rounded-lg hover:bg-slate-200 transition-standard shadow-lg"
                                                        >
                                                            Schedule
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                                ) : (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {activeList.length === 0 ? (
                                        <div className="py-24 text-center glass-card border-dashed">
                                            <div className="text-4xl mb-4 opacity-20">📭</div>
                                            <div className="text-slate-500 font-medium">No session records found items here.</div>
                                        </div>
                                    ) : (
                                        activeList.map(b => (
                                            <div key={b.id} className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-white/[0.02] transition-standard">
                                                <div className="flex items-center gap-5">
                                                    <div className="w-12 h-12 bg-dark-800 rounded-xl flex flex-col items-center justify-center border border-white/5 shadow-inner">
                                                        <div className="text-[9px] uppercase font-black text-slate-600 tracking-tighter">
                                                            {new Date(b.booking_date).toLocaleString('en-US', { month: 'short' })}
                                                        </div>
                                                        <div className="text-lg font-bold text-white leading-none">
                                                            {new Date(b.booking_date).getDate()}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-bold text-lg mb-1">{b.service_title || 'Session'} with {b.freelancer_name}</div>
                                                        <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                                                            <span className="font-mono text-accent-500 bg-accent-500/10 px-2 py-0.5 rounded border border-accent-500/20">
                                                                {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                                                            </span>
                                                            <span className="w-1 h-1 bg-slate-800 rounded-full" />
                                                            <span>{fmtDate(b.booking_date)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {b.status === 'pending' ? (
                                                        <span className="px-3 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest border border-amber-500/20 rounded-full shadow-[0_0_12px_rgba(245,158,11,0.1)]">Pending Approval</span>
                                                    ) : (
                                                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.1)]">Confirmed</span>
                                                    )}
                                                    {tab === 'upcoming' && (
                                                        <button
                                                            onClick={() => setCancelBookingId(b.id)}
                                                            className="p-2.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-standard border border-transparent hover:border-red-500/20"
                                                        >
                                                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                        ))}
                                </div>
                )}
                            </div>
            </main>

                {/* Booking Request Modal */}
                {selectedFreelancer && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm shadow-2xl" onClick={() => setSelectedFreelancer(null)} />
                        <div className="w-full max-w-lg glass-card relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                            <div className="p-8 pb-4 flex items-center justify-between border-b border-white/5">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-accent-500/10 flex items-center justify-center text-accent-500 border border-accent-500/20">
                                        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">Request Session</h3>
                                        <p className="text-xs text-slate-500">Proposed meeting with {selectedFreelancer.name}</p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedFreelancer(null)} className="text-slate-500 hover:text-white transition-standard text-2xl">&times;</button>
                            </div>

                            <div className="p-8">
                                {bookingError && <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{bookingError}</div>}

                                <div className="mb-8">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Available Slots</label>
                                    {loadingSlots ? (
                                        <div className="py-12 text-center text-slate-500 animate-pulse italic">Scanning availability...</div>
                                    ) : freelancerSlots.length === 0 ? (
                                        <div className="py-12 text-center glass bg-dark-800/40 rounded-2xl border-dashed">
                                            <div className="text-2xl mb-2 opacity-50">📵</div>
                                            <div className="text-xs text-slate-500 px-10">This professional has no public availability listed. Please try again later.</div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                            {freelancerSlots.map(s => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setBookingSlot(s)}
                                                    className={`flex items-center justify-between p-4 rounded-xl border transition-standard group ${bookingSlot?.id === s.id ? 'bg-accent-500/10 border-accent-500 shadow-[0_0_15px_rgba(108,143,255,0.1)]' : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'}`}
                                                >
                                                    <div className="text-left">
                                                        <div className={`text-sm font-bold transition-standard ${bookingSlot?.id === s.id ? 'text-white' : 'text-slate-300'}`}>{fmtDate(s.booking_date)}</div>
                                                        <div className="text-[10px] font-mono text-slate-500 group-hover:text-slate-400">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</div>
                                                    </div>
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-standard ${bookingSlot?.id === s.id ? 'border-accent-500 bg-accent-500' : 'border-white/10'}`}>
                                                        {bookingSlot?.id === s.id && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4 7L8 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-4">
                                    <button onClick={() => setSelectedFreelancer(null)} className="flex-1 py-4 text-slate-400 font-bold text-sm bg-white/5 hover:bg-white/10 rounded-2xl transition-standard border border-transparent">Cancel</button>
                                    <button
                                        disabled={!bookingSlot}
                                        onClick={handleConfirmRequest}
                                        className="flex-[2] py-4 bg-accent-500 hover:bg-accent-600 text-white font-bold text-sm rounded-2xl transition-standard shadow-xl shadow-accent-500/20 disabled:opacity-30 disabled:shadow-none active:scale-[0.98]"
                                    >
                                        Confirm Request
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Custom Request Modal */}
                {showCustomModal && selectedFreelancer && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div className="absolute inset-0 bg-dark-950/90 backdrop-blur-md shadow-2xl" onClick={() => setShowCustomModal(false)} />
                        <div className="w-full max-w-md glass-card relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border-accent-500/30">
                            <div className="p-8 pb-4 flex items-center justify-between border-b border-white/5 bg-accent-500/5">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-accent-500/20 flex items-center justify-center text-accent-500 border border-accent-500/20">
                                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <h3 className="text-lg font-bold text-white uppercase tracking-tight">Custom Request</h3>
                                </div>
                                <button onClick={() => setShowCustomModal(false)} className="text-slate-500 hover:text-white transition-standard text-2xl">&times;</button>
                            </div>

                            <form onSubmit={handleCustomRequest} className="p-8 space-y-6">
                                {bookingError && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest">{bookingError}</div>}

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Booking Date</label>
                                        <input
                                            type="date"
                                            required
                                            min={new Date().toISOString().split('T')[0]}
                                            className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500 transition-standard"
                                            onChange={(e) => setCustomFormData({ ...customFormData, booking_date: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Start Time</label>
                                            <input
                                                type="time"
                                                required
                                                className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500 transition-standard"
                                                onChange={(e) => setCustomFormData({ ...customFormData, start_time: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">End Time</label>
                                            <input
                                                type="time"
                                                required
                                                className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500 transition-standard"
                                                onChange={(e) => setCustomFormData({ ...customFormData, end_time: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button type="button" onClick={() => setShowCustomModal(false)} className="flex-1 py-3.5 text-slate-400 font-bold text-[10px] uppercase tracking-widest bg-white/5 hover:bg-white/10 rounded-xl transition-standard">Cancel</button>
                                    <button
                                        type="submit"
                                        className="flex-[2] py-3.5 bg-accent-500 hover:bg-accent-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-standard shadow-xl shadow-accent-500/20 active:scale-[0.98]"
                                    >
                                        Send Request
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Quick Book Modal */}
                {showQuickBook && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div className="absolute inset-0 bg-dark-950/90 backdrop-blur-md shadow-2xl" onClick={() => setShowQuickBook(false)} />
                        <div className="w-full max-w-lg glass-card relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border-accent-500/30">
                            <div className="p-8 pb-4 flex items-center justify-between border-b border-white/5 bg-accent-500/5">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-accent-500/20 flex items-center justify-center text-accent-500 border border-accent-500/20">
                                        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                                    </div>
                                    <h3 className="text-lg font-bold text-white uppercase tracking-tight">Quick Book Experience</h3>
                                </div>
                                <button onClick={() => setShowQuickBook(false)} className="text-slate-500 hover:text-white transition-standard text-2xl">&times;</button>
                            </div>

                            <form onSubmit={async (e) => {
                                e.preventDefault();
                                try {
                                    const { data } = await requestMeeting(quickBookData);
                                    pushToast('Proposal transmitted successfully.', 'success');
                                    if (data?.warning) pushToast(data.warning, 'error');
                                    setShowQuickBook(false);
                                    await loadData();
                                } catch (err) {
                                    pushToast(err.response?.data?.error || 'Booking transmission failed.', 'error');
                                }
                            }} className="p-8 space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Select Expert</label>
                                    <select
                                        required
                                        className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-accent-500 appearance-none transition-standard"
                                        onChange={(e) => setQuickBookData({ ...quickBookData, freelancer_id: e.target.value })}
                                    >
                                        <option value="">-- Choose a professional --</option>
                                        {directory.concat(freelancers).filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i).map(f => (
                                            <option key={f.id} value={f.id}>{f.name} ({f.title || 'Expert'}) — ${f.hourly_rate || 80}/hr</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Target Date</label>
                                        <input
                                            type="date"
                                            required
                                            min={new Date().toISOString().split('T')[0]}
                                            className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500 transition-standard"
                                            onChange={(e) => setQuickBookData({ ...quickBookData, booking_date: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Start Time</label>
                                            <input
                                                type="time"
                                                required
                                                className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500 transition-standard"
                                                onChange={(e) => setQuickBookData({ ...quickBookData, start_time: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">End Time</label>
                                            <input
                                                type="time"
                                                required
                                                className="w-full bg-dark-800 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500 transition-standard"
                                                onChange={(e) => setQuickBookData({ ...quickBookData, end_time: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button type="button" onClick={() => setShowQuickBook(false)} className="flex-1 py-3.5 text-slate-400 font-bold text-[10px] uppercase tracking-widest bg-white/5 hover:bg-white/10 rounded-xl transition-standard">Discard</button>
                                    <button
                                        type="submit"
                                        className="flex-[2] py-3.5 bg-accent-500 hover:bg-accent-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-standard shadow-xl shadow-accent-500/20 active:scale-[0.98]"
                                    >
                                        Transmit Request
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {cancelBookingId && (
                    <div className="fixed inset-0 z-[140] flex items-center justify-center p-6 animate-in fade-in duration-200">
                        <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setCancelBookingId(null)} />
                        <div className="w-full max-w-md glass-card p-6 relative z-10 border-red-500/20">
                            <h3 className="text-lg font-bold text-white mb-2">Cancel booking?</h3>
                            <p className="text-sm text-slate-500 mb-6">This action removes your scheduled session.</p>
                            <div className="flex gap-3">
                                <button onClick={() => setCancelBookingId(null)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 text-xs font-bold uppercase tracking-widest">Keep</button>
                                <button onClick={() => handleCancel(cancelBookingId)} className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl text-white text-xs font-bold uppercase tracking-widest">Cancel Session</button>
                            </div>
                        </div>
                    </div>
                )}

                {toast.show && (
                    <div className="fixed bottom-6 right-6 z-[150] animate-in slide-in-from-bottom-3 fade-in duration-300">
                        <div className={`px-4 py-3 rounded-xl border text-sm font-semibold shadow-2xl ${
                            toast.type === 'success'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : toast.type === 'error'
                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                : 'bg-white/10 border-white/20 text-slate-200'
                        }`}>
                            {toast.text}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClientDashboard;
