import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { 
    fetchBookings, fetchAllBookings, fetchStats, fetchFinancials,
    addAvailability, deleteAvailability, createBulkAvailability, 
    toggleAvailability, approveMeeting, declineMeeting, manualBooking, chatWithAI,
    fetchChatThreads, fetchThreadMessages, SOCKET_BASE_URL,
    fetchFreelancerServices, createService, deleteService
} from '../api';

const FreelancerDashboard = () => {
    const user = JSON.parse(sessionStorage.getItem('user')) || { name: 'Freelancer' };
    const [bookings, setBookings] = useState([]);
    const [allHistory, setAllHistory] = useState([]);
    const [availability, setAvailability] = useState([]);
    const [stats, setStats] = useState({ total_hours: 0, pending_requests: 0 });
    const [financials, setFinancials] = useState({ total_confirmed_hours: 0, total_earnings: 0 });
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('overview'); // overview | availability | bookings | requests
    const [services, setServices] = useState([]);
    const [newService, setNewService] = useState({ title: '', description: '', price: '', duration_minutes: 60 });

    // Form states
    const [newSlot, setNewSlot] = useState({ date: '', start: '', end: '' });
    const [bulk, setBulk] = useState({ date: '', startTime: '', endTime: '', duration: 60 });
    const [manual, setManual] = useState({ client_name: '', client_email: '', booking_date: '', start_time: '', end_time: '' });
    const [chatMessages, setChatMessages] = useState([
        { role: 'ai', text: 'Hi! I can bulk-create availability for you. Example: "Create 30-minute slots tomorrow from 10:00 to 14:00".' }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [aiTyping, setAiTyping] = useState(false);
    const aiChatRef = React.useRef(null);
    const dmChatRef = React.useRef(null);
    const [toast, setToast] = useState({ show: false, type: 'info', text: '' });
    const [deleteSlotId, setDeleteSlotId] = useState(null);
    const [declineModal, setDeclineModal] = useState({ open: false, id: null, reason: '' });
    const [threads, setThreads] = useState([]);
    const [activeThread, setActiveThread] = useState(null);
    const [threadMessages, setThreadMessages] = useState([]);
    const [threadInput, setThreadInput] = useState('');
    const [chatBusy, setChatBusy] = useState(false);
    const socketRef = React.useRef(null);
    const activeThreadRef = React.useRef(null);

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

    useEffect(() => {
        const t = setTimeout(() => {
            if (aiChatRef.current) {
                aiChatRef.current.scrollTop = aiChatRef.current.scrollHeight;
            }
        }, 50);
        return () => clearTimeout(t);
    }, [chatMessages, aiTyping]);

    useEffect(() => {
        const t = setTimeout(() => {
            if (dmChatRef.current) {
                dmChatRef.current.scrollTop = dmChatRef.current.scrollHeight;
            }
        }, 50);
        return () => clearTimeout(t);
    }, [threadMessages]);

    const loadData = async () => {
        try {
            const [bRes, hRes, sRes, fRes, srvRes] = await Promise.all([
                fetchBookings(),
                fetchAllBookings(),
                fetchStats(),
                fetchFinancials().catch(() => ({ data: { total_earnings: 0, total_confirmed_hours: 0 } })),
                fetchFreelancerServices(user.id).catch(() => ({ data: [] }))
            ]);
            
            setBookings(bRes.data || []);
            setServices(srvRes.data || []);
            setAllHistory(hRes.data || []);
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Filter available (non-booked) slots from full history for the Open Slots panel
            setAvailability((hRes.data || []).filter(s => {
                const isAvailable = !s.is_booked && s.status === 'available';
                if (!isAvailable) return false;

                const bDate = new Date(s.booking_date);
                const bDay = new Date(bDate.getFullYear(), bDate.getMonth(), bDate.getDate());

                if (bDay > today) return true;
                if (bDay < today) return false;

                // It's today! Check end_time
                const [h, m] = (s.end_time || "00:00:00").split(':').map(Number);
                const sessionEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
                return sessionEnd > now;
            }));
            setStats(sRes.data || { weekHours: 0, monthStats: {}, pending_requests: 0 });
            setFinancials(fRes.data || { total_earnings: 0, total_confirmed_hours: 0, totalHours: 0, totalEarnings: 0 });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleAddSlot = async (e) => {
        e.preventDefault();
        try {
            await addAvailability({ booking_date: newSlot.date, start_time: newSlot.start, end_time: newSlot.end });
            setNewSlot({ date: '', start: '', end: '' });
            loadData();
            pushToast('Slot added successfully.', 'success');
        } catch (err) { pushToast(err.response?.data?.error || 'Failed to add slot', 'error'); }
    };

    const handleBulkAdd = async (e) => {
        e.preventDefault();
        try {
            await createBulkAvailability({
                booking_date: bulk.date,
                start_time: bulk.startTime,
                end_time: bulk.endTime,
                session_duration: bulk.duration
            });
            setBulk({ date: '', startTime: '', endTime: '', duration: 60 });
            loadData();
            pushToast('Bulk slots created successfully.', 'success');
        } catch (err) { pushToast(err.response?.data?.error || 'Bulk add failed', 'error'); }
    };

    const handleDeleteSlot = async () => {
        if (!deleteSlotId) return;
        try {
            await deleteAvailability(deleteSlotId);
            setDeleteSlotId(null);
            loadData();
            pushToast('Slot deleted.', 'success');
        } catch (err) { pushToast('Delete failed', 'error'); }
    };

    const handleManualBooking = async (e) => {
        e.preventDefault();
        try {
            const { data } = await manualBooking(manual);
            setManual({ client_name: '', client_email: '', booking_date: '', start_time: '', end_time: '' });
            loadData();
            pushToast('Manual booking sent.', 'success');
            if (data?.warning) pushToast(data.warning, 'error');
        } catch (err) { pushToast(err.response?.data?.error || 'Manual booking failed', 'error'); }
    };

    const handleApprove = async (id) => {
        try {
            const { data } = await approveMeeting(id);
            loadData();
            pushToast('Session approved.', 'success');
            if (data?.warning) pushToast(data.warning, 'error');
        } catch (err) { pushToast('Approval failed', 'error'); }
    };

    const handleDecline = async () => {
        try {
            const { data } = await declineMeeting(declineModal.id, { reason: declineModal.reason });
            setDeclineModal({ open: false, id: null, reason: '' });
            loadData();
            pushToast('Session declined.', 'success');
            if (data?.warning) pushToast(data.warning, 'error');
        } catch (err) { pushToast('Decline failed', 'error'); }
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
            setChatMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
            loadData();
        } catch (err) {
            console.error("Freelancer AI chat failed:", err.response?.data?.error || err.message);
            setChatMessages(prev => [...prev, { role: 'ai', text: "I couldn't process that right now. Please try again." }]);
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

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-dark-950">
            <div className="text-accent-500 animate-pulse font-bold tracking-widest uppercase">Initializing Dashboard...</div>
        </div>
    );

    const pendingRequests = bookings.filter(b => b.status === 'pending');
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
    const totalEarnings = financials.totalEarnings || financials.total_earnings || 0;
    const totalHours = financials.totalHours || financials.total_confirmed_hours || 0;

    return (
        <div className="min-h-screen bg-dark-950 flex flex-col md:flex-row font-syne text-slate-200">
            {/* Sidebar */}
            <aside className="w-full md:w-72 bg-dark-900 border-r border-white/5 flex flex-col h-auto md:h-screen md:sticky top-0 p-4 md:p-8 z-50">
                <div className="flex items-center gap-3 mb-4 md:mb-10">
                    <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center shadow-lg shadow-accent-500/20">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" fill="white"/><rect x="8" y="1" width="5" height="5" rx="1" fill="white" opacity="0.6"/><rect x="1" y="8" width="5" height="5" rx="1" fill="white" opacity="0.6"/><rect x="8" y="8" width="5" height="5" rx="1" fill="white"/></svg>
                    </div>
                    <span className="font-bold text-white text-lg uppercase tracking-widest">FreelanceOS</span>
                </div>

                <nav className="hidden md:block flex-1 space-y-2">
                    {[
                        { id: 'overview', icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', label: 'Overview' },
                        { id: 'availability', icon: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', label: 'Availability' },
                        { id: 'products', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', label: 'Products & Pricing' },
                        { id: 'bookings', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z', label: 'Bookings' },
                        { id: 'requests', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9', label: 'Requests', count: pendingRequests.length },
                        { id: 'schedule', icon: 'M12 4v16m8-8H4', label: 'Schedule Client' },
                        { id: 'ai', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', label: 'AI Scheduler' },
                        { id: 'messages', icon: 'M8 10h8M8 14h5M5 19l-2 2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5z', label: 'Messages' },
                    ].map(item => (
                        <button 
                            key={item.id}
                            onClick={() => setTab(item.id)}
                            className={`w-full flex items-center justify-between p-3.5 rounded-xl transition-standard group ${tab === item.id ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                        >
                            <div className="flex items-center gap-3">
                                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d={item.icon}/></svg>
                                <span className="text-sm font-bold tracking-wide">{item.label}</span>
                            </div>
                            {item.count > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${tab === item.id ? 'bg-white text-accent-500' : 'bg-red-500 text-white animate-pulse'}`}>{item.count}</span>}
                        </button>
                    ))}
                </nav>

                <nav className="md:hidden flex overflow-x-auto gap-2 pb-2 custom-scrollbar">
                    {[
                        { id: 'overview', label: 'Overview' },
                        { id: 'availability', label: 'Availability' },
                        { id: 'products', label: 'Products' },
                        { id: 'bookings', label: 'Bookings' },
                        { id: 'requests', label: 'Requests' },
                        { id: 'schedule', label: 'Schedule' },
                        { id: 'ai', label: 'AI' },
                        { id: 'messages', label: 'Messages' },
                    ].map(item => (
                        <button
                            key={item.id}
                            onClick={() => setTab(item.id)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-standard ${
                                tab === item.id ? 'bg-accent-500 text-white shadow-md shadow-accent-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="hidden md:block pt-8 border-t border-white/5 space-y-4">
                    <Link to="/settings" className="flex items-center gap-3 p-3.5 text-slate-500 hover:text-white transition-standard group">
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        <span className="text-sm font-bold tracking-wide">Settings</span>
                    </Link>
                    <button 
                        onClick={() => { sessionStorage.clear(); window.location.href = '/auth'; }}
                        className="w-full flex items-center gap-3 p-3.5 text-slate-500 hover:text-red-400 transition-standard group"
                    >
                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
                        <span className="text-sm font-bold tracking-wide">Logout</span>
                    </button>
                    <div className="pt-4 flex items-center gap-3 text-xs">
                        <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center font-black text-slate-400">{user.name.substring(0,2).toUpperCase()}</div>
                        <div className="flex-1 overflow-hidden">
                            <div className="text-white font-bold truncate">{user.name}</div>
                            <div className="text-slate-600 truncate">{user.email}</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-4 md:p-12 overflow-y-auto md:max-h-screen custom-scrollbar">
                {tab === 'overview' && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <section>
                            <h2 className="text-3xl font-bold text-white mb-2">Workspace Overview</h2>
                            <p className="text-slate-500 mb-8 font-medium">Tracking your performance and core platform metrics.</p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div className="glass-card p-6 border-l-4 border-l-accent-500">
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Confirmed Hours</div>
                                    <div className="text-3xl font-bold text-white font-mono">{totalHours.toFixed ? totalHours.toFixed(1) : totalHours} hrs</div>
                                </div>
                                <div className="glass-card p-6 border-l-4 border-l-emerald-500">
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Total Earnings</div>
                                    <div className="text-3xl font-bold text-white font-mono">${Number(totalEarnings).toFixed(2)}</div>
                                </div>
                                <div className="glass-card p-6 border-l-4 border-l-amber-500">
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">This Week</div>
                                    <div className="text-3xl font-bold text-white font-mono">{stats.weekHours || 0} hrs</div>
                                </div>
                                <div className="glass-card p-6 border-l-4 border-l-violet-500">
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Hourly Rate</div>
                                    <div className="text-3xl font-bold text-white font-mono">${user.hourly_rate || 0}</div>
                                </div>
                            </div>
                        </section>

                        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-bold text-white tracking-tight">Recent Sessions</h3>
                                    <button onClick={() => setTab('bookings')} className="text-xs font-bold text-accent-500 hover:text-white transition-standard uppercase tracking-widest">View All</button>
                                </div>
                                <div className="space-y-4">
                                    {confirmedBookings.length === 0 ? (
                                        <div className="p-12 text-center glass border-dashed text-slate-600 text-sm italic">No confirmed sessions yet.</div>
                                    ) : (
                                        confirmedBookings.slice(0, 4).map(b => (
                                            <div key={b.id} className="p-4 glass rounded-2xl flex items-center justify-between group hover:bg-white/[0.02] transition-standard">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-dark-700 flex items-center justify-center text-white font-bold text-sm shadow-inner uppercase">
                                                        {b.client_name?.substring(0,2)}
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-bold text-sm">{b.client_name}{b.service_title ? <span className="text-accent-500 font-normal text-[10px] ml-2">• {b.service_title}</span> : null}</div>
                                                        <div className="text-[10px] font-mono text-slate-600">{fmtDate(b.booking_date)} • {fmtTime(b.start_time)}</div>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Active</div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-bold text-white tracking-tight">Public Presence</h3>
                                    <button onClick={() => toggleAvailability().then(loadData)} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-slate-400 transition-standard uppercase tracking-widest border border-white/5">Toggle Visibility</button>
                                </div>
                                <div className="glass-card p-6 bg-gradient-to-br from-dark-800 to-dark-900 border-accent-500/10 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 bg-accent-500 rounded-bl-3xl">
                                        <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24"><path d="M12 21a9 9 0 1 0-9-9c0 1.48.35 2.89 1 4.13L3 21l4.87-1c1.24.65 2.65 1 4.13 1z"/></svg>
                                    </div>
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-16 h-16 rounded-2xl bg-dark-700 p-0.5 overflow-hidden shadow-2xl border border-white/10">
                                            <div className="w-full h-full bg-gradient-to-tr from-accent-600 to-violet-600 flex items-center justify-center text-2xl font-bold text-white">
                                                {user.name.substring(0,2).toUpperCase()}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-white font-bold text-xl">{user.name}</div>
                                            <div className="text-accent-500 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
                                                Public & Active
                                            </div>
                                        </div>
                                    </div>
                                    <Link to={`/book/${user.id}`} target="_blank" className="block w-full py-3 bg-white text-dark-950 text-center rounded-xl font-bold text-sm hover:bg-slate-200 transition-standard shadow-xl shadow-white/5">
                                        Open Booking Page
                                    </Link>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {tab === 'availability' && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <header>
                            <h2 className="text-3xl font-bold text-white mb-2">Schedule Management</h2>
                            <p className="text-slate-500 font-medium">Add, manage, and batch-create your public availability slots.</p>
                        </header>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            {/* Single Slot Add */}
                            <div className="glass-card p-8">
                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] mb-8">Add Quick Slot</h3>
                                <form onSubmit={handleAddSlot} className="space-y-6">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Select Date</label>
                                        <input type="date" required className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard" value={newSlot.date} onChange={e => setNewSlot({...newSlot, date: e.target.value})} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">StartTime</label>
                                            <input type="time" required className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard" value={newSlot.start} onChange={e => setNewSlot({...newSlot, start: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">EndTime</label>
                                            <input type="time" required className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard" value={newSlot.end} onChange={e => setNewSlot({...newSlot, end: e.target.value})} />
                                        </div>
                                    </div>
                                    <button type="submit" className="w-full py-4 bg-accent-500 hover:bg-accent-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-accent-500/20 active:scale-[0.98] transition-standard">Add to Schedule</button>
                                </form>
                            </div>

                            {/* Bulk Creation */}
                            <div className="glass-card p-8">
                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] mb-8">Bulk Generator</h3>
                                <p className="text-[10px] text-slate-600 mb-6">Pick a date, set your available window, and choose a session length — we'll auto-create all slots.</p>
                                <form onSubmit={handleBulkAdd} className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Date</label>
                                        <input type="date" required className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-500 transition-standard" value={bulk.date} onChange={e => setBulk({...bulk, date: e.target.value})} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Window Start</label>
                                            <input type="time" required className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-500 transition-standard" value={bulk.startTime} onChange={e => setBulk({...bulk, startTime: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Window End</label>
                                            <input type="time" required className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-500 transition-standard" value={bulk.endTime} onChange={e => setBulk({...bulk, endTime: e.target.value})} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Session Duration</label>
                                        <select className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-500 transition-standard" value={bulk.duration} onChange={e => setBulk({...bulk, duration: parseInt(e.target.value)})}>
                                            <option value={30}>30 minutes</option>
                                            <option value={45}>45 minutes</option>
                                            <option value={60}>1 hour</option>
                                            <option value={90}>1.5 hours</option>
                                            <option value={120}>2 hours</option>
                                        </select>
                                    </div>
                                    <button type="submit" className="w-full py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-bold text-xs border border-white/5 transition-standard">Generate Batch Slots</button>
                                </form>
                            </div>
                        </div>

                        <section>
                            <h3 className="text-lg font-bold text-white mb-6">Open Slots</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {availability.length === 0 ? (
                                    <div className="md:col-span-4 p-20 text-center glass border-dashed text-slate-500 italic">No open slots available. Start by adding one above.</div>
                                ) : (
                                    availability.map(s => (
                                        <div key={s.id} className="p-4 glass rounded-2xl group hover:border-red-500/20 transition-standard relative overflow-hidden">
                                            <div className="text-[10px] font-black text-slate-600 uppercase mb-2">{fmtDate(s.booking_date)}</div>
                                            <div className="text-white font-bold font-mono">{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</div>
                                            <button 
                                                onClick={() => setDeleteSlotId(s.id)}
                                                className="absolute top-2 right-2 p-1.5 text-slate-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-standard"
                                            >
                                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {tab === 'products' && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <header>
                            <h2 className="text-3xl font-bold text-white mb-2">Products & Pricing</h2>
                            <p className="text-slate-500 font-medium">Create custom services and products for clients to book at specific prices.</p>
                        </header>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                            {/* Create Product Form */}
                            <div className="lg:col-span-1 glass-card p-8 h-fit">
                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] mb-8">Add New Product</h3>
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    try {
                                        await createService(newService);
                                        setNewService({ title: '', description: '', price: '', duration_minutes: 60 });
                                        loadData();
                                        pushToast('Product created successfully.', 'success');
                                    } catch (err) { pushToast(err.response?.data?.error || 'Failed to create product', 'error'); }
                                }} className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Product Title</label>
                                        <input type="text" required placeholder="e.g. 1-Hour Consultation" className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-500 transition-standard" value={newService.title} onChange={e => setNewService({...newService, title: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Description</label>
                                        <textarea rows="3" placeholder="What does this include?" className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-500 transition-standard custom-scrollbar resize-none" value={newService.description} onChange={e => setNewService({...newService, description: e.target.value})}></textarea>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Price ($)</label>
                                            <input type="number" required min="0" step="0.01" className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-500 transition-standard" value={newService.price} onChange={e => setNewService({...newService, price: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Duration (mins)</label>
                                            <input type="number" required min="15" step="15" className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-accent-500 transition-standard" value={newService.duration_minutes} onChange={e => setNewService({...newService, duration_minutes: parseInt(e.target.value)})} />
                                        </div>
                                    </div>
                                    <button type="submit" className="w-full py-3 bg-accent-500 hover:bg-accent-600 text-white rounded-xl font-bold text-xs shadow-xl shadow-accent-500/20 active:scale-[0.98] mt-4 transition-standard">Create Product</button>
                                </form>
                            </div>

                            {/* Existing Products List */}
                            <div className="lg:col-span-2 space-y-4">
                                <h3 className="text-lg font-bold text-white mb-6">Your Offerings</h3>
                                {services.length === 0 ? (
                                    <div className="p-20 text-center glass border-dashed text-slate-500 italic">You haven't created any specific products yet. Clients will book using your default hourly rate.</div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {services.map(s => (
                                            <div key={s.id} className="p-6 glass-card group hover:border-accent-500/30 transition-standard relative flex flex-col">
                                                <button 
                                                    onClick={async () => {
                                                        try {
                                                            await deleteService(s.id);
                                                            loadData();
                                                            pushToast('Product deleted.', 'success');
                                                        } catch (err) { pushToast('Failed to delete product', 'error'); }
                                                    }}
                                                    className="absolute top-4 right-4 p-2 text-slate-700 hover:text-red-500 bg-dark-900 rounded-full opacity-0 group-hover:opacity-100 transition-standard"
                                                >
                                                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                                </button>
                                                <div className="text-xl font-bold text-white mb-2 pr-8">{s.title}</div>
                                                <div className="text-xs text-slate-400 mb-6 flex-1">{s.description || 'No description provided.'}</div>
                                                <div className="flex items-center justify-between border-t border-white/5 pt-4">
                                                    <div className="text-accent-500 font-black text-xl tracking-tight">${s.price}</div>
                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-dark-900 px-3 py-1.5 rounded-lg border border-white/5">{s.duration_minutes} mins</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'bookings' && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <header className="flex items-center justify-between">
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Confirmed Engagements</h2>
                                <p className="text-slate-500 font-medium tracking-tight">Accessing full history and upcoming confirmed client sessions.</p>
                            </div>
                            <div className="glass-card px-4 py-2 flex items-center gap-4">
                                <div className="text-center">
                                    <div className="text-xs font-black text-slate-500 uppercase tracking-tighter">Capacity</div>
                                    <div className="text-sm font-bold text-white">{confirmedBookings.length} Active</div>
                                </div>
                                <div className="h-8 w-px bg-white/5" />
                                <div className="text-center font-bold text-emerald-500 font-mono text-sm">${financials.total_earnings} Ready</div>
                            </div>
                        </header>

                        <div className="space-y-4">
                            {confirmedBookings.length === 0 ? (
                                <div className="py-32 text-center glass border-dashed">
                                    <div className="text-5xl mb-6 opacity-10">🗓️</div>
                                    <div className="text-slate-500 font-medium">No confirmed bookings on record.</div>
                                </div>
                            ) : (
                                confirmedBookings.map(b => (
                                    <div key={b.id} className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-white/[0.02] transition-standard group">
                                        <div className="flex items-center gap-6">
                                            <div className="w-12 h-12 rounded-2xl bg-dark-700 flex items-center justify-center border border-white/5 shadow-inner">
                                                <div className="text-lg font-bold text-white uppercase">{b.client_name?.substring(0,2)}</div>
                                            </div>
                                            <div>
                                                <div className="text-white font-bold text-lg leading-tight mb-1">{b.client_name}</div>
                                                {b.service_title && <div className="text-accent-500 text-xs font-bold">{b.service_title}</div>}
                                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                                    <span className="font-mono text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{fmtTime(b.start_time)} – {fmtTime(b.end_time)}</span>
                                                    <span>{fmtDate(b.booking_date)}</span>
                                                    <span className="text-slate-700">{b.client_email}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right mr-4 hidden sm:block">
                                                <div className="text-xs font-bold text-white">Confirmed</div>
                                                <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest leading-none mt-1">SaaS Contracted</div>
                                            </div>
                                            <button onClick={() => setDeclineModal({ open: true, id: b.id, reason: '' })} className="p-3 text-slate-700 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-standard border border-transparent hover:border-red-500/10 opacity-0 group-hover:opacity-100">
                                                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {tab === 'requests' && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <header>
                            <h2 className="text-3xl font-bold text-white mb-2">Pending Proposals</h2>
                            <p className="text-slate-500 font-medium tracking-tight">Review and manage client-initiated session requests.</p>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {pendingRequests.length === 0 ? (
                                <div className="md:col-span-2 py-32 text-center glass border-dashed">
                                    <div className="text-5xl mb-6 opacity-10">🔔</div>
                                    <div className="text-slate-500 font-medium">All clear! No pending requests at the moment.</div>
                                </div>
                            ) : (
                                pendingRequests.map(b => (
                                    <div key={b.id} className="glass-card p-8 flex flex-col border-amber-500/10 hover:border-amber-500/30 transition-standard relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 p-3 bg-amber-500/10 rounded-bl-2xl">
                                            <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest">New</div>
                                        </div>
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className="w-14 h-14 rounded-2xl bg-dark-700 flex items-center justify-center text-xl font-bold text-white shadow-2xl border border-white/5">
                                                {b.client_name?.substring(0,2).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="text-white font-bold text-lg mb-0.5">{b.client_name}</div>
                                                {b.service_title && <div className="text-accent-500 text-xs font-bold mb-0.5">{b.service_title}</div>}
                                                <div className="text-slate-500 text-xs truncate max-w-[200px]">{b.client_email}</div>
                                            </div>
                                        </div>
                                        <div className="bg-white/5 p-4 rounded-2xl mb-8 flex justify-between items-center">
                                            <div>
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1 font-mono">Proposed Slot</div>
                                                <div className="text-white font-bold text-sm tracking-tight">{fmtDate(b.booking_date)}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1 font-mono">Proposed Time</div>
                                                <div className="text-accent-500 font-bold text-sm font-mono">{fmtTime(b.start_time)} – {fmtTime(b.end_time)}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-3 mt-auto">
                                            <button 
                                                onClick={() => setDeclineModal({ open: true, id: b.id, reason: '' })}
                                                className="flex-1 py-3.5 bg-dark-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl font-bold text-xs border border-white/5 transition-standard"
                                            >
                                                Decline
                                            </button>
                                            <button 
                                                onClick={() => handleApprove(b.id)}
                                                className="flex-[2] py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-emerald-500/20 transition-standard active:scale-[0.98]"
                                            >
                                                Approve Session
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {tab === 'schedule' && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <header>
                            <h2 className="text-3xl font-bold text-white mb-2">Schedule a Client</h2>
                            <p className="text-slate-500 font-medium tracking-tight">Manually book a confirmed slot for a client — an email invite will be sent to them automatically.</p>
                        </header>

                        <div className="max-w-xl">
                            <div className="glass-card p-8">
                                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.25em] mb-8">Client Details</h3>
                                <form onSubmit={handleManualBooking} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Client Name</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="John Smith"
                                                className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                                value={manual.client_name}
                                                onChange={e => setManual({...manual, client_name: e.target.value})}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Client Email</label>
                                            <input
                                                type="email"
                                                required
                                                placeholder="client@example.com"
                                                className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                                value={manual.client_email}
                                                onChange={e => setManual({...manual, client_email: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Meeting Date</label>
                                        <input
                                            type="date"
                                            required
                                            className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                            value={manual.booking_date}
                                            onChange={e => setManual({...manual, booking_date: e.target.value})}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">Start Time</label>
                                            <input
                                                type="time"
                                                required
                                                className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                                value={manual.start_time}
                                                onChange={e => setManual({...manual, start_time: e.target.value})}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 mb-2 block uppercase">End Time</label>
                                            <input
                                                type="time"
                                                required
                                                className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                                value={manual.end_time}
                                                onChange={e => setManual({...manual, end_time: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    <div className="pt-2 p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl text-[10px] text-amber-500/70">
                                        ⚡ This creates a <strong>confirmed</strong> booking immediately and emails the client a calendar invite.
                                    </div>
                                    <button type="submit" className="w-full py-4 bg-accent-500 hover:bg-accent-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-accent-500/20 active:scale-[0.98] transition-standard">Book &amp; Send Invite</button>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'messages' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <header>
                            <h2 className="text-3xl font-bold text-white mb-2">Client Messages</h2>
                            <p className="text-slate-500 font-medium tracking-tight">Chat only with clients who already have a pending or confirmed booking relationship.</p>
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
                )}

                {tab === 'ai' && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <header>
                            <h2 className="text-3xl font-bold text-white mb-2">AI Slot Scheduler</h2>
                            <p className="text-slate-500 font-medium tracking-tight">Generate multiple slots with one prompt. The assistant skips overlaps automatically.</p>
                        </header>

                        <div className="max-w-4xl">
                            <div className="glass-card flex flex-col h-[70vh] border-accent-500/20 shadow-2xl shadow-accent-500/5">
                                <div className="p-6 border-b border-white/5 bg-accent-500/5 flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-accent-500/20 flex items-center justify-center text-accent-500 border border-accent-500/20">
                                        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white tracking-tight">FreelanceOS Intelligence</h3>
                                        <p className="text-xs text-slate-500">Try: "Create 45-minute slots on 2026-04-14 from 09:00 to 13:30".</p>
                                    </div>
                                </div>

                                <div ref={aiChatRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-dark-900/40">
                                    {chatMessages.map((m, i) => (
                                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] p-4 rounded-3xl text-sm font-medium shadow-sm leading-relaxed whitespace-pre-line ${m.role === 'user' ? 'bg-accent-500 text-white rounded-tr-sm shadow-accent-500/20' : 'bg-dark-800 text-slate-300 border border-white/5 rounded-tl-sm'}`}>
                                                <div>{renderSafeMarkdown(m.text)}</div>
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
                                            placeholder='Create 30-minute slots tomorrow from 10:00 to 16:00'
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
                )}
            </main>

            {deleteSlotId && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setDeleteSlotId(null)} />
                    <div className="glass-card w-full max-w-md p-6 relative z-10 border-red-500/20">
                        <h3 className="text-lg font-bold text-white mb-2">Delete slot?</h3>
                        <p className="text-slate-500 text-sm mb-6">This removes the open slot from your public availability.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteSlotId(null)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 text-xs font-bold uppercase tracking-widest">Cancel</button>
                            <button onClick={handleDeleteSlot} className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl text-white text-xs font-bold uppercase tracking-widest">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {declineModal.open && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setDeclineModal({ open: false, id: null, reason: '' })} />
                    <div className="glass-card w-full max-w-md p-6 relative z-10 border-amber-500/20">
                        <h3 className="text-lg font-bold text-white mb-2">Decline request</h3>
                        <p className="text-slate-500 text-sm mb-4">Optional reason shown in client communication.</p>
                        <textarea
                            rows={3}
                            value={declineModal.reason}
                            onChange={(e) => setDeclineModal(prev => ({ ...prev, reason: e.target.value }))}
                            placeholder="Freelancer is unavailable at this time."
                            className="w-full bg-dark-800/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard mb-5"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setDeclineModal({ open: false, id: null, reason: '' })} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 text-xs font-bold uppercase tracking-widest">Cancel</button>
                            <button onClick={handleDecline} className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl text-white text-xs font-bold uppercase tracking-widest">Decline</button>
                        </div>
                    </div>
                </div>
            )}

            {toast.show && (
                <div className="fixed bottom-6 right-6 z-[130] animate-in slide-in-from-bottom-3 fade-in duration-300">
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
    );
};

export default FreelancerDashboard;
