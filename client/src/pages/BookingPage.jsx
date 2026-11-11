import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { fetchAvailability, fetchProfile, createBooking } from '../api';

const BookingPage = () => {
    const { freelancerId } = useParams();
    const [searchParams] = useSearchParams();
    const serviceId = searchParams.get('service_id');
    const [availability, setAvailability] = useState([]);
    const [freelancer, setFreelancer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [bookingForm, setBookingForm] = useState({ client_name: '', client_email: '' });
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const [avRes, profRes] = await Promise.all([
                    fetchAvailability(freelancerId),
                    fetchProfile(freelancerId).catch(() => ({ data: { name: 'Expert Freelancer', title: 'Consultant' } }))
                ]);
                setFreelancer(profRes.data);
                // Only show slots that are NOT booked and NOT status 'pending'/'confirmed'
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                setAvailability((avRes.data || []).filter(s => {
                    const isAvailable = !s.is_booked && (s.status === 'available' || !s.status);
                    if (!isAvailable) return false;

                    const bDate = new Date(s.booking_date);
                    const bDay = new Date(bDate.getFullYear(), bDate.getMonth(), bDate.getDate());

                    if (bDay > today) return true;
                    if (bDay < today) return false;

                    // It's today! Check start_time
                    const [h, m] = (s.start_time || "00:00:00").split(':').map(Number);
                    const sessionStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
                    return sessionStart > now;
                }));
            } catch {
                setError('Unable to load availability. Please try refreshing.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [freelancerId]);

    const handleBook = async (e) => {
        e.preventDefault();
        if (!bookingForm.client_name || !bookingForm.client_email) {
            setError('Identification required: name and email.');
            return;
        }
        setConfirming(true);
        setError('');
        try {
            await createBooking({
                slot_id: selectedSlot.id,
                client_name: bookingForm.client_name,
                client_email: bookingForm.client_email,
                service_id: serviceId
            });
            setSuccessMsg(`Proposal Sent! ${freelancer.name} will review your request shortly.`);
            setSelectedSlot(null);
            setAvailability(prev => prev.filter(s => s.id !== selectedSlot.id));
        } catch (err) {
            setError(err.response?.data?.error || 'Request failed. The slot may have been taken.');
        } finally {
            setConfirming(false);
        }
    };

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    const fmtTime = (t) => t ? t.substring(0, 5) : '';

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-dark-950">
            <div className="text-accent-500 animate-pulse font-bold tracking-widest uppercase">Connecting to Workspace...</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-dark-950 text-slate-200 font-syne selection:bg-accent-500/30">
            {/* Background Accents */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-500/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-500/10 blur-[120px] rounded-full" />
            </div>

            <nav className="relative z-10 p-8 flex justify-between items-center max-w-6xl mx-auto">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center shadow-lg shadow-accent-500/20">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" fill="white"/><rect x="8" y="1" width="5" height="5" rx="1" fill="white" opacity="0.6"/><rect x="1" y="8" width="5" height="5" rx="1" fill="white" opacity="0.6"/><rect x="8" y="8" width="5" height="5" rx="1" fill="white"/></svg>
                    </div>
                    <span className="font-bold text-white tracking-widest uppercase text-sm">FreelanceOS</span>
                </div>
                <Link to="/auth" className="text-xs font-bold text-slate-500 hover:text-white transition-standard uppercase tracking-widest border border-white/5 px-4 py-2 rounded-full hover:bg-white/5">Provider Login</Link>
            </nav>

            <main className="relative z-10 max-w-2xl mx-auto px-6 py-12">
                <div className="text-center mb-16">
                    <div className="inline-block p-1 bg-gradient-to-tr from-accent-500 to-violet-500 rounded-full mb-6 shadow-2xl">
                        <div className="w-24 h-24 rounded-full bg-dark-900 flex items-center justify-center text-3xl font-bold text-white uppercase border-2 border-white/10">
                            {freelancer?.name?.substring(0,2)}
                        </div>
                    </div>
                    <h1 className="text-4xl font-bold text-white tracking-tight mb-3">Book {freelancer?.name}</h1>
                    <div className="text-accent-500 font-bold uppercase tracking-[0.2em] text-[10px] mb-6">{freelancer?.title || 'Professional Partner'}</div>
                    <p className="text-slate-400 font-medium leading-relaxed max-w-md mx-auto">{freelancer?.bio || `Expertise delivered on-demand. Secure a session to discuss your next project.`}</p>
                </div>

                {successMsg ? (
                    <div className="glass-card p-12 text-center animate-in zoom-in duration-500">
                        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
                            <svg width="32" height="32" fill="none" stroke="#10b981" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Request Submitted</h2>
                        <p className="text-slate-500 mb-8 font-medium">{successMsg}</p>
                        <button onClick={() => setSuccessMsg('')} className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm text-slate-300 transition-standard">Book Another Session</button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Available Openings</h2>
                            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter bg-white/5 px-2 py-0.5 rounded italic">Auto-Synced to Local Time</span>
                        </div>

                        {availability.length === 0 ? (
                            <div className="glass-card py-20 text-center border-dashed border-white/10">
                                <p className="text-slate-500 italic font-medium">No active openings found. Please check back later.</p>
                            </div>
                        ) : (
                            availability.map(slot => (
                                <div key={slot.id} className="glass-card p-6 flex items-center justify-between group hover:border-accent-500/30 transition-all duration-300 hover:translate-x-1">
                                    <div>
                                        <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">{fmtDate(slot.booking_date)}</div>
                                        <div className="text-white font-bold text-xl font-mono tracking-tight">{fmtTime(slot.start_time)} – {fmtTime(slot.end_time)}</div>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedSlot(slot)}
                                        className="px-6 py-3 bg-white text-dark-950 font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-accent-500 hover:text-white transition-all duration-300 shadow-xl shadow-white/5"
                                    >
                                        Reserve
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                ) }

                <div className="mt-20 pt-12 border-t border-white/5 flex flex-col items-center gap-6">
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.3em]">Secure Infrastructure by FreelanceOS</p>
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-standard cursor-pointer">
                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.84 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                        </div>
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-standard cursor-pointer">
                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.042-1.416-4.042-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
                        </div>
                    </div>
                </div>
            </main>

            {/* Modal */}
            {selectedSlot && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm" onClick={() => setSelectedSlot(null)} />
                    <div className="glass-card w-full max-w-md p-8 relative z-10 animate-in zoom-in-95 duration-300 border-accent-500/20 shadow-2xl shadow-accent-500/10">
                        <h3 className="text-xl font-bold text-white mb-1">Confirm Proposal</h3>
                        <p className="text-slate-500 text-sm mb-6">Enter your details to initiate a meeting request.</p>
                        
                        <div className="bg-white/5 p-4 rounded-xl mb-8 flex justify-between items-center border border-white/5">
                            <div>
                                <div className="text-[10px] font-black text-slate-600 uppercase tracking-tighter mb-1">Proposed Slot</div>
                                <div className="text-white font-bold text-sm">{fmtDate(selectedSlot.booking_date)}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-[10px] font-black text-slate-600 uppercase tracking-tighter mb-1">Window</div>
                                <div className="text-accent-500 font-bold text-sm font-mono">{fmtTime(selectedSlot.start_time)} – {fmtTime(selectedSlot.end_time)}</div>
                            </div>
                        </div>

                        {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs font-bold mb-6 text-center italic">{error}</div>}

                        <form onSubmit={handleBook} className="space-y-6">
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 mb-2 block uppercase tracking-widest">Full Name</label>
                                <input 
                                    type="text" required placeholder="John Doe"
                                    className="w-full bg-dark-800/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                    onChange={e => setBookingForm({ ...bookingForm, client_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-500 mb-2 block uppercase tracking-widest">Email Address</label>
                                <input 
                                    type="email" required placeholder="john@example.com"
                                    className="w-full bg-dark-800/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                    onChange={e => setBookingForm({ ...bookingForm, client_email: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setSelectedSlot(null)} className="flex-1 py-4 bg-dark-800 hover:bg-dark-700 text-slate-400 rounded-xl font-bold text-xs uppercase tracking-widest border border-white/5 transition-standard">Cancel</button>
                                <button type="submit" disabled={confirming} className="flex-[2] py-4 bg-accent-500 hover:bg-accent-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-accent-500/20 transition-all active:scale-[0.98]">
                                    {confirming ? 'Sending...' : 'Send Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BookingPage;
