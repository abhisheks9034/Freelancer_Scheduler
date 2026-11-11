import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
    const [scrollY, setScrollY] = useState(0);
    const [visibleSections, setVisibleSections] = useState(new Set());
    const sectionRefs = useRef([]);

    useEffect(() => {
        const handleScroll = () => setScrollY(window.scrollY);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setVisibleSections(prev => new Set([...prev, entry.target.dataset.id]));
                    }
                });
            },
            { threshold: 0.15 }
        );
        sectionRefs.current.forEach(el => el && observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const addRef = (el) => {
        if (el && !sectionRefs.current.includes(el)) sectionRefs.current.push(el);
    };

    const isVisible = (id) => visibleSections.has(id);

    const features = [
        {
            icon: (
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/>
                </svg>
            ),
            color: 'text-accent-500',
            bg: 'bg-accent-500/10',
            border: 'border-accent-500/20',
            title: 'Smart Scheduling',
            desc: 'Set your availability once. Clients request slots, you approve — zero back-and-forth email chains.'
        },
        {
            icon: (
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
            ),
            color: 'text-violet-400',
            bg: 'bg-violet-500/10',
            border: 'border-violet-500/20',
            title: 'Client Discovery',
            desc: 'A global marketplace connects clients to the right professionals — filtered by skills, rate, and availability.'
        },
        {
            icon: (
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.1a16 16 0 0 0 5.999 5.999l1.23-1.23a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
            ),
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20',
            title: 'Instant Notifications',
            desc: 'Every booking event triggers a real email with a calendar invite attached — clients and freelancers always stay in sync.'
        },
        {
            icon: (
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
            ),
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/20',
            title: 'Conflict Detection',
            desc: 'Built-in overlap detection prevents double-bookings at the API level — your calendar stays clean automatically.'
        },
        {
            icon: (
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
            ),
            color: 'text-pink-400',
            bg: 'bg-pink-500/10',
            border: 'border-pink-500/20',
            title: 'Earnings Tracking',
            desc: 'See your confirmed hours, weekly stats, and total earnings — all calculated automatically from your bookings.'
        },
        {
            icon: (
                <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            ),
            color: 'text-cyan-400',
            bg: 'bg-cyan-500/10',
            border: 'border-cyan-500/20',
            title: 'Secure by Default',
            desc: 'JWT-protected APIs, per-tab session isolation, and role-based access control — security built into every layer.'
        },
    ];

    const steps = [
        { step: '01', title: 'Create your profile', desc: 'Sign up as a freelancer or client in seconds. Add your skills, set your rate, write a bio.' },
        { step: '02', title: 'Set your availability', desc: 'Block out your open hours with single slots or auto-batch generate sessions by duration.' },
        { step: '03', title: 'Get discovered & booked', desc: 'Clients find you in the marketplace, request a time, and you approve — all from one dashboard.' },
    ];

    const stats = [
        { value: '100%', label: 'Conflict-free scheduling' },
        { value: '< 2s', label: 'Booking confirmation time' },
        { value: '∞', label: 'Clients per freelancer' },
        { value: '0', label: 'Missed appointments' },
    ];

    return (
        <div className="min-h-screen bg-dark-950 text-slate-200 font-syne overflow-x-hidden">
            {/* ── NAVBAR ──────────────────────────────── */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrollY > 40 ? 'glass border-b border-white/5 backdrop-blur-xl' : ''}`}>
                <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center shadow-lg shadow-accent-500/30">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <rect x="1" y="1" width="5" height="5" rx="1" fill="white"/>
                                <rect x="8" y="1" width="5" height="5" rx="1" fill="white" opacity="0.5"/>
                                <rect x="1" y="8" width="5" height="5" rx="1" fill="white" opacity="0.5"/>
                                <rect x="8" y="8" width="5" height="5" rx="1" fill="white"/>
                            </svg>
                        </div>
                        <span className="text-lg font-bold text-white tracking-tight">ScheduleIn</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8">
                        <a href="#features" className="text-sm text-slate-400 hover:text-white transition-colors font-medium">Features</a>
                        <a href="#how" className="text-sm text-slate-400 hover:text-white transition-colors font-medium">How it works</a>
                        <a href="#stats" className="text-sm text-slate-400 hover:text-white transition-colors font-medium">Stats</a>
                        <Link to="/client" className="text-sm text-accent-400 hover:text-accent-300 transition-colors font-bold flex items-center gap-1">
                            Marketplace <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        </Link>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link to="/auth" className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors">
                            Sign in
                        </Link>
                        <Link
                            to="/auth"
                            className="px-5 py-2.5 bg-accent-500 hover:bg-accent-600 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-accent-500/25 active:scale-95"
                        >
                            Get started free
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── HERO ──────────────────────────────── */}
            <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 pt-24 pb-16 overflow-hidden">
                {/* Background glows */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[-20%] left-[10%] w-[60vw] h-[60vw] max-w-3xl max-h-3xl rounded-full bg-accent-500/[0.07] blur-[120px]" />
                    <div className="absolute bottom-[-10%] right-[-5%] w-[40vw] h-[40vw] max-w-2xl max-h-2xl rounded-full bg-violet-600/[0.07] blur-[100px]" />
                    <div className="absolute top-[40%] left-[-10%] w-[30vw] h-[30vw] max-w-xl max-h-xl rounded-full bg-emerald-600/[0.05] blur-[100px]" />
                </div>

                {/* Subtle grid overlay */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.03]"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
                        backgroundSize: '80px 80px'
                    }}
                />

                <div className="relative z-10 max-w-4xl mx-auto">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-400 text-xs font-bold uppercase tracking-widest mb-10 animate-pulse">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-400" />
                        Professional Scheduling Platform
                    </div>

                    <h1 className="text-5xl md:text-7xl font-bold text-white leading-[1.05] mb-8 tracking-tight">
                        Book smarter.
                        <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-400 via-violet-400 to-emerald-400 animate-[shimmer_3s_ease_infinite] bg-[length:200%_auto]">
                            Work better.
                        </span>
                    </h1>

                    <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12 font-medium">
                        ScheduleIn is a modern scheduling platform built for freelancers and their clients — real-time availability, instant booking requests, and automatic email confirmations.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
                        <Link
                            to="/auth"
                            id="hero-cta-signup"
                            className="w-full sm:w-auto px-10 py-4 bg-accent-500 hover:bg-accent-600 text-white font-bold text-base rounded-2xl transition-all shadow-2xl shadow-accent-500/30 active:scale-[0.97] flex items-center justify-center gap-3 group"
                        >
                            Start scheduling free
                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="group-hover:translate-x-1 transition-transform">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                        </Link>
                        <a
                            href="#how"
                            id="hero-cta-howit"
                            className="w-full sm:w-auto px-10 py-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-base rounded-2xl border border-white/10 transition-all active:scale-[0.97] flex items-center justify-center gap-3"
                        >
                            See how it works
                        </a>
                    </div>

                    {/* Hero dashboard preview card */}
                    <div className="relative mx-auto max-w-3xl">
                        <div className="absolute -inset-px bg-gradient-to-r from-accent-500/30 via-violet-500/20 to-emerald-500/20 rounded-3xl blur-md" />
                        <div className="relative glass-card p-2 rounded-3xl border border-white/10 shadow-2xl">
                            <div className="bg-dark-900 rounded-2xl p-6 overflow-hidden">
                                {/* Fake browser chrome */}
                                <div className="flex items-center gap-2 mb-6">
                                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                                    <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                                    <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                                    <div className="flex-1 mx-4 bg-dark-800 rounded-md h-6 flex items-center px-3">
                                        <span className="text-[10px] text-slate-600 font-mono">schedulein.app/freelancer</span>
                                    </div>
                                </div>
                                {/* Mock dashboard content */}
                                <div className="grid grid-cols-4 gap-3 mb-5">
                                    {[
                                        { label: 'Confirmed Hours', val: '24.5 hrs', color: 'border-accent-500' },
                                        { label: 'Total Earnings', val: '$1,960', color: 'border-emerald-500' },
                                        { label: 'This Week', val: '8 hrs', color: 'border-amber-500' },
                                        { label: 'Hourly Rate', val: '$80', color: 'border-violet-500' },
                                    ].map(card => (
                                        <div key={card.label} className={`bg-dark-800 rounded-xl p-3 border-l-2 ${card.color}`}>
                                            <div className="text-[9px] text-slate-600 uppercase font-bold mb-1">{card.label}</div>
                                            <div className="text-sm font-bold text-white font-mono">{card.val}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { name: 'Alex M.', time: '10:00 – 11:00', date: 'Today', status: 'confirmed', color: 'text-emerald-400 bg-emerald-500/10' },
                                        { name: 'Sarah K.', time: '14:00 – 15:30', date: 'Tomorrow', status: 'pending', color: 'text-amber-400 bg-amber-500/10' },
                                        { name: 'David R.', time: '09:00 – 10:00', date: 'Fri Apr 8', status: 'confirmed', color: 'text-emerald-400 bg-emerald-500/10' },
                                    ].map((b, i) => (
                                        <div key={i} className="bg-dark-800/80 border border-white/5 rounded-xl p-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="w-7 h-7 rounded-lg bg-dark-700 flex items-center justify-center text-[10px] font-bold text-white">{b.name.substring(0,2)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[10px] font-bold text-white truncate">{b.name}</div>
                                                    <div className="text-[8px] text-slate-600">{b.date}</div>
                                                </div>
                                            </div>
                                            <div className="text-[9px] font-mono text-accent-400 mb-1.5">{b.time}</div>
                                            <div className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full w-fit ${b.color}`}>{b.status}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── STATS ──────────────────────────────── */}
            <section id="stats" className="py-20 border-y border-white/5">
                <div
                    className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8"
                    data-id="stats"
                    ref={addRef}
                >
                    {stats.map((s, i) => (
                        <div
                            key={s.label}
                            className={`text-center transition-all duration-700 ${isVisible('stats') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                            style={{ transitionDelay: `${i * 100}ms` }}
                        >
                            <div className="text-4xl md:text-5xl font-bold text-white font-mono mb-2">{s.value}</div>
                            <div className="text-xs text-slate-500 uppercase font-bold tracking-widest">{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── FEATURES ──────────────────────────────── */}
            <section id="features" className="py-28 px-6">
                <div className="max-w-6xl mx-auto">
                    <div
                        className={`text-center mb-20 transition-all duration-700 ${isVisible('features-header') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                        data-id="features-header"
                        ref={addRef}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-bold uppercase tracking-widest mb-6">
                            Platform Features
                        </div>
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-5 tracking-tight">
                            Everything you need to run<br/>your scheduling workflow
                        </h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                            No spreadsheets. No endless Calendly alternatives. Just a clean, powerful platform built for serious freelancers.
                        </p>
                    </div>

                    <div
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        data-id="features-grid"
                        ref={addRef}
                    >
                        {features.map((f, i) => (
                            <div
                                key={f.title}
                                className={`glass-card p-8 group hover:border-white/10 transition-all duration-700 hover:-translate-y-1 ${isVisible('features-grid') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                                style={{ transitionDelay: `${i * 80}ms` }}
                            >
                                <div className={`w-14 h-14 rounded-2xl ${f.bg} border ${f.border} flex items-center justify-center ${f.color} mb-6 group-hover:scale-110 transition-transform duration-300`}>
                                    {f.icon}
                                </div>
                                <h3 className="text-lg font-bold text-white mb-3">{f.title}</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ──────────────────────────────── */}
            <section id="how" className="py-28 px-6 bg-dark-900/40 border-y border-white/5">
                <div className="max-w-4xl mx-auto">
                    <div
                        className={`text-center mb-20 transition-all duration-700 ${isVisible('how-header') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                        data-id="how-header"
                        ref={addRef}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-6">
                            How it works
                        </div>
                        <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                            Up and running in 3 steps
                        </h2>
                    </div>

                    <div className="relative" data-id="how-steps" ref={addRef}>
                        {/* Connecting line */}
                        <div className="hidden md:block absolute top-10 left-[calc(50%-1px)] bottom-10 w-px bg-gradient-to-b from-accent-500/40 via-violet-500/30 to-transparent" />

                        <div className="space-y-12">
                            {steps.map((s, i) => (
                                <div
                                    key={s.step}
                                    className={`flex flex-col md:flex-row items-center gap-8 transition-all duration-700 ${isVisible('how-steps') ? 'opacity-100 translate-x-0' : `opacity-0 ${i % 2 === 0 ? '-translate-x-12' : 'translate-x-12'}`}`}
                                    style={{ transitionDelay: `${i * 150}ms` }}
                                >
                                    <div className={`flex-1 ${i % 2 === 1 ? 'md:order-2 md:text-right' : ''}`}>
                                        <div className="text-xs font-black text-slate-600 uppercase tracking-widest mb-3">{s.step}</div>
                                        <h3 className="text-2xl font-bold text-white mb-3">{s.title}</h3>
                                        <p className="text-slate-400 leading-relaxed">{s.desc}</p>
                                    </div>
                                    <div className="w-20 h-20 shrink-0 rounded-2xl bg-gradient-to-br from-accent-500/20 to-violet-500/10 border border-accent-500/20 flex items-center justify-center text-3xl font-black text-white/10 font-mono">
                                        {s.step}
                                    </div>
                                    <div className={`flex-1 hidden md:block ${i % 2 === 1 ? 'md:order-1' : ''}`} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── DUAL CTA ──────────────────────────────── */}
            <section className="py-28 px-6">
                <div
                    className={`max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-700 ${isVisible('dual-cta') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                    data-id="dual-cta"
                    ref={addRef}
                >
                    {/* Freelancer CTA */}
                    <div className="glass-card p-10 relative overflow-hidden group border-accent-500/20 hover:border-accent-500/40 transition-all">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-accent-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
                        <div className="w-14 h-14 bg-accent-500/10 border border-accent-500/20 rounded-2xl flex items-center justify-center text-accent-400 mb-6">
                            <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                                <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="2"/>
                            </svg>
                        </div>
                        <div className="text-xs font-black text-accent-500 uppercase tracking-widest mb-3">For Freelancers</div>
                        <h3 className="text-2xl font-bold text-white mb-4">Grow your freelance business</h3>
                        <p className="text-slate-400 text-sm leading-relaxed mb-8">
                            Set your rates, showcase your skills, and let clients book you directly. Track earnings and manage your entire schedule from a single dashboard.
                        </p>
                        <Link
                            to="/auth"
                            id="cta-freelancer"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-accent-500/20 active:scale-95"
                        >
                            Join as a freelancer
                            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        </Link>
                    </div>

                    {/* Client CTA */}
                    <div className="glass-card p-10 relative overflow-hidden group border-violet-500/20 hover:border-violet-500/40 transition-all">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-violet-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
                        <div className="w-14 h-14 bg-violet-500/10 border border-violet-500/20 rounded-2xl flex items-center justify-center text-violet-400 mb-6">
                            <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                        </div>
                        <div className="text-xs font-black text-violet-400 uppercase tracking-widest mb-3">For Clients</div>
                        <h3 className="text-2xl font-bold text-white mb-4">Find and book top talent</h3>
                        <p className="text-slate-400 text-sm leading-relaxed mb-8">
                            Browse verified professionals, compare rates, and request meetings in seconds. No cold emails — just straightforward, professional scheduling.
                        </p>
                        <Link
                            to="/auth"
                            id="cta-client"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-violet-500 hover:bg-violet-600 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-violet-500/20 active:scale-95"
                        >
                            Join as a client
                            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        </Link>
                    </div>
                </div>
            </section>

            {/* ── FOOTER ──────────────────────────────── */}
            <footer className="border-t border-white/5 py-10 px-6">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 bg-accent-500 rounded-lg flex items-center justify-center shadow-lg shadow-accent-500/20">
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                                <rect x="1" y="1" width="5" height="5" rx="1" fill="white"/>
                                <rect x="8" y="1" width="5" height="5" rx="1" fill="white" opacity="0.5"/>
                                <rect x="1" y="8" width="5" height="5" rx="1" fill="white" opacity="0.5"/>
                                <rect x="8" y="8" width="5" height="5" rx="1" fill="white"/>
                            </svg>
                        </div>
                        <span className="text-white font-bold tracking-tight">ScheduleIn</span>
                        <span className="text-slate-700 text-sm">— Scheduling made simple.</span>
                    </div>
                    <div className="flex items-center gap-8">
                        <Link to="/auth" className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium uppercase tracking-widest">Sign in</Link>
                        <Link to="/auth" className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium uppercase tracking-widest">Sign up</Link>
                        <Link to="/privacy" className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium uppercase tracking-widest">Privacy</Link>
                    </div>
                    <div className="text-xs text-slate-700">
                        © {new Date().getFullYear()} ScheduleIn. All rights reserved.
                    </div>
                </div>
            </footer>

            {/* Scroll to top button */}
            {scrollY > 600 && (
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-8 right-8 z-50 w-12 h-12 bg-accent-500 hover:bg-accent-600 text-white rounded-2xl shadow-2xl shadow-accent-500/30 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 animate-in fade-in slide-in-from-bottom-4"
                    aria-label="Scroll to top"
                >
                    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>
                </button>
            )}
        </div>
    );
};

export default LandingPage;
