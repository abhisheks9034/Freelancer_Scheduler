import React, { useState, useEffect } from 'react';
import { fetchMe, updateProfile, API_BASE_URL } from '../api';
import { applyTheme, getSavedTheme } from '../utils/theme';

const ProfileSettings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [profile, setProfile] = useState({
        name: '',
        title: '',
        bio: '',
        avatar_url: '',
        company_name: '',
        skills: [],
        hourly_rate: 0,
        theme_preference: 'dark'
    });
    const [skillInput, setSkillInput] = useState('');

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const { data } = await fetchMe();
                setProfile({
                    ...data,
                    skills: data.skills || [],
                    theme_preference: data.theme_preference || getSavedTheme()
                });
                applyTheme(data.theme_preference || getSavedTheme());
            } catch (err) {
                setMsg({ type: 'error', text: 'Failed to load profile.' });
            } finally {
                setLoading(false);
            }
        };
        loadProfile();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMsg({ type: '', text: '' });
        try {
            await updateProfile(profile);
            setMsg({ type: 'success', text: 'Profile updated successfully!' });
            applyTheme(profile.theme_preference || 'dark');
            // Update sessionStorage user name if it changed
            const localUser = JSON.parse(sessionStorage.getItem('user'));
            sessionStorage.setItem('user', JSON.stringify({ ...localUser, name: profile.name, theme_preference: profile.theme_preference || 'dark' }));
        } catch (err) {
            setMsg({ type: 'error', text: 'Failed to update profile.' });
        } finally {
            setSaving(false);
        }
    };

    const addSkill = () => {
        if (skillInput.trim() && !profile.skills.includes(skillInput.trim())) {
            setProfile({ ...profile, skills: [...profile.skills, skillInput.trim()] });
            setSkillInput('');
        }
    };

    const removeSkill = (skill) => {
        setProfile({ ...profile, skills: profile.skills.filter(s => s !== skill) });
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-dark-950">
            <div className="text-accent-500 animate-pulse font-medium underline decoration-2 underline-offset-8 transition-all duration-300">Loading your profile...</div>
        </div>
    );

    return (
        <div className="min-h-screen bg-dark-950 p-6 md:p-12">
            <div className="max-w-4xl mx-auto">
                <header className="mb-10 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Account Settings</h1>
                        <p className="text-slate-400">Manage your public profile and platform preferences.</p>
                    </div>
                    <button 
                        onClick={() => window.history.back()}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-sm font-medium transition-standard"
                    >
                        Go Back
                    </button>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Preview Card */}
                    <div className="lg:col-span-1">
                        <div className="glass-card p-6 sticky top-24">
                            <div className="flex flex-col items-center text-center">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-accent-500 to-violet-500 flex items-center justify-center text-3xl font-bold text-white mb-4 border-4 border-white/5 overflow-hidden shadow-2xl">
                                    {profile.avatar_url ? (
                                        <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
                                    ) : (
                                        profile.name?.substring(0, 2).toUpperCase()
                                    )}
                                </div>
                                <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                                <p className="text-accent-500 text-sm font-medium mb-4">{profile.title || 'Professional'}</p>
                                
                                {profile.bio && <p className="text-slate-400 text-xs italic line-clamp-3 mb-6">"{profile.bio}"</p>}
                                
                                <div className="w-full pt-6 border-t border-white/5 flex flex-wrap gap-2 justify-center">
                                    {profile.skills.map(s => (
                                        <span key={s} className="px-2 py-1 bg-accent-500/10 text-accent-500 text-[10px] font-bold rounded-md border border-accent-500/20 uppercase tracking-tighter">
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Edit Form */}
                    <div className="lg:col-span-2">
                        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-8">
                            {msg.text && (
                                <div className={`p-4 rounded-xl text-xs font-medium border ${msg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                                    {msg.text}
                                </div>
                            )}

                            <section>
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Personal details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-400 ml-1">Display Name</label>
                                        <input 
                                            className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                            value={profile.name}
                                            onChange={e => setProfile({...profile, name: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-400 ml-1">Avatar URL</label>
                                        <input 
                                            className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard placeholder:text-slate-700"
                                            placeholder="https://..."
                                            value={profile.avatar_url}
                                            onChange={e => setProfile({...profile, avatar_url: e.target.value})}
                                        />
                                    </div>
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-xs font-semibold text-slate-400 ml-1">Professional Title</label>
                                        <input 
                                            className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                            placeholder="Senior Full Stack Developer"
                                            value={profile.title}
                                            onChange={e => setProfile({...profile, title: e.target.value})}
                                        />
                                    </div>
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-xs font-semibold text-slate-400 ml-1">Bio / About</label>
                                        <textarea 
                                            className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard min-h-[100px]"
                                            placeholder="Tell potential clients about yourself..."
                                            value={profile.bio}
                                            onChange={e => setProfile({...profile, bio: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </section>

                            <section className="pt-8 border-t border-white/5">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Expertise & Billing</h3>
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-slate-400 ml-1">Skills</label>
                                        <div className="flex gap-2 mb-3 flex-wrap">
                                            {profile.skills.map(s => (
                                                <div key={s} className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg text-xs text-white border border-white/5 group">
                                                    <span>{s}</span>
                                                    <button type="button" onClick={() => removeSkill(s)} className="text-slate-500 hover:text-red-400 transition-colors">&times;</button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input 
                                                className="flex-1 bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                                placeholder="Add a skill..."
                                                value={skillInput}
                                                onChange={e => setSkillInput(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                                            />
                                            <button 
                                                type="button" 
                                                onClick={addSkill}
                                                className="px-6 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-xl text-sm font-medium border border-white/5 transition-standard"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                    
                                    {profile.role === 'freelancer' && (
                                        <div className="space-y-2 flex-1">
                                            <label className="text-xs font-semibold text-slate-400 ml-1">Hourly Rate ($)</label>
                                            <input 
                                                type="number"
                                                className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                                value={profile.hourly_rate}
                                                onChange={e => setProfile({...profile, hourly_rate: e.target.value})}
                                            />
                                        </div>
                                    )}

                                    {profile.role === 'client' && (
                                        <div className="space-y-2 flex-1">
                                            <label className="text-xs font-semibold text-slate-400 ml-1">Company Name</label>
                                            <input 
                                                className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                                value={profile.company_name}
                                                onChange={e => setProfile({...profile, company_name: e.target.value})}
                                            />
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="pt-8 border-t border-white/5">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Appearance</h3>
                                <div className="space-y-2 max-w-sm">
                                    <label className="text-xs font-semibold text-slate-400 ml-1">Theme</label>
                                    <select
                                        className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-500/50 transition-standard"
                                        value={profile.theme_preference || 'dark'}
                                        onChange={(e) => {
                                            const next = e.target.value === 'light' ? 'light' : 'dark';
                                            setProfile({ ...profile, theme_preference: next });
                                            applyTheme(next);
                                        }}
                                    >
                                        <option value="dark">Dark</option>
                                        <option value="light">Light</option>
                                    </select>
                                    <p className="text-xs text-slate-500">Theme applies immediately and is saved to your account.</p>
                                </div>
                            </section>

                            <section className="pt-8 border-t border-white/5">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6">Email Sending</h3>
                                <div className="flex flex-col md:flex-row md:items-center gap-4">
                                    <div className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border w-fit ${
                                        profile.google_connected
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    }`}>
                                        {profile.google_connected ? 'Connected to Google' : 'Not Connected'}
                                    </div>
                                    {!profile.google_connected && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const role = profile.role === 'freelancer' ? 'freelancer' : 'client';
                                                window.location.href = `${API_BASE_URL}/auth/google?role=${role}`;
                                            }}
                                            className="px-5 py-2.5 bg-accent-500 hover:bg-accent-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-standard"
                                        >
                                            Connect Google
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-3">Required for sending direct user-to-user emails from your own account.</p>
                            </section>

                            <div className="pt-8 border-t border-white/5 flex justify-end">
                                <button 
                                    className="px-10 py-4 bg-accent-500 hover:bg-accent-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-accent-500/20 active:scale-[0.98] transition-standard disabled:opacity-50"
                                    type="submit"
                                    disabled={saving}
                                >
                                    {saving ? 'Saving changes...' : 'Save Profile'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileSettings;
