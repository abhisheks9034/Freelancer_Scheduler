import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, registerUser, API_BASE_URL } from '../api';

const Auth = () => {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '', email: '', password: '', role: ''
    });

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const userJson = params.get('user');
        const errorParam = params.get('error');
        const reasonParam = params.get('reason');

        if (errorParam) {
            setError(reasonParam ? `Google authentication failed: ${reasonParam}` : 'Google authentication failed. Please try again.');
            return;
        }

        if (token && userJson) {
            try {
                sessionStorage.setItem('token', token);
                sessionStorage.setItem('user', userJson);
                const user = JSON.parse(userJson);
                navigate(user.role === 'freelancer' ? '/freelancer' : '/client');
            } catch {
                setError('Failed to process login. Please try again.');
            }
        }
    }, [navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!isLogin && !formData.role) {
            setError('Please select whether you are a Freelancer or Client.');
            return;
        }

        setLoading(true);
        try {
            if (isLogin) {
                const { data } = await loginUser({ email: formData.email, password: formData.password });
                sessionStorage.setItem('token', data.token);
                sessionStorage.setItem('user', JSON.stringify(data.user));
                navigate(data.user.role === 'freelancer' ? '/freelancer' : '/client');
            } else {
                await registerUser(formData);
                setSuccess('Account created! Please log in.');
                setIsLogin(true);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = () => {
        if (!formData.role) {
            setError('Please select your role (Freelancer or Client) before continuing with Google.');
            return;
        }
        window.location.href = `${API_BASE_URL}/auth/google?role=${formData.role}`;
    };

    return (
        <div className="min-header-screen flex items-center justify-center p-6 bg-dark-950 relative overflow-hidden">
            {/* Background Decorative Gradients */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-500/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-500/10 blur-[120px] rounded-full pointer-events-none" />

            <div className="w-full max-w-md glass-card p-10 relative z-10 transition-standard">
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-9 h-9 bg-accent-500 rounded-lg flex items-center justify-center shadow-lg shadow-accent-500/20">
                        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="1" width="6" height="6" rx="1.5" fill="white"/>
                            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" opacity="0.6"/>
                            <rect x="1" y="9" width="6" height="6" rx="1.5" fill="white" opacity="0.6"/>
                            <rect x="9" y="9" width="6" height="6" rx="1.5" fill="white"/>
                        </svg>
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white">FreelanceOS</span>
                </div>

                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-white mb-2">{isLogin ? 'Welcome back' : 'Create account'}</h2>
                    <p className="text-sm text-slate-400">
                        {isLogin ? 'Sign in to your dashboard' : 'Get started with FreelanceOS today'}
                    </p>
                </div>

                <div className="flex bg-dark-800/50 p-1 rounded-xl mb-8 border border-white/5">
                    <button 
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-standard ${isLogin ? 'bg-dark-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                        onClick={() => { setIsLogin(true); setError(''); setSuccess(''); }}
                    >
                        Sign in
                    </button>
                    <button 
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-standard ${!isLogin ? 'bg-dark-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                        onClick={() => { setIsLogin(false); setError(''); setSuccess(''); }}
                    >
                        Sign up
                    </button>
                </div>

                {error && (
                    <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs animate-in fade-in slide-in-from-top-2 duration-300">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs animate-in fade-in slide-in-from-top-2 duration-300">
                        {success}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    {!isLogin && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Full Name</label>
                            <input
                                className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent-500/50 focus:ring-4 focus:ring-accent-500/10 transition-standard"
                                type="text"
                                placeholder="Jane Doe"
                                required
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                    )}

                    {/* Role selector — visible in signup mode for both manual and Google auth */}
                    {!isLogin && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">I am a</label>
                            <select
                                className={`w-full bg-dark-800/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-500/50 transition-standard ${formData.role ? 'text-white border-white/5' : 'text-slate-500 border-amber-500/30'}`}
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            >
                                <option value="" disabled>-- Select your role --</option>
                                <option value="freelancer">Freelancer</option>
                                <option value="client">Client</option>
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Email Address</label>
                        <input
                            className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent-500/50 focus:ring-4 focus:ring-accent-500/10 transition-standard"
                            type="email"
                            placeholder="jane@example.com"
                            required
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Password</label>
                        <input
                            className="w-full bg-dark-800/50 border border-white/5 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent-500/50 focus:ring-4 focus:ring-accent-500/10 transition-standard"
                            type="password"
                            placeholder="••••••••"
                            required
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>

                    <button 
                        className="w-full py-4 bg-accent-500 hover:bg-accent-600 text-white rounded-xl font-semibold text-sm shadow-xl shadow-accent-500/20 active:scale-[0.98] transition-standard disabled:opacity-50 mt-4" 
                        type="submit" 
                        disabled={loading}
                    >
                        {loading ? 'Please wait...' : isLogin ? 'Sign in' : 'Create account'}
                    </button>
                </form>

                <div className="flex items-center gap-4 my-8">
                    <div className="flex-1 h-px bg-white/5" />
                    <span className="text-xs text-slate-600 uppercase tracking-widest font-medium">Or</span>
                    <div className="flex-1 h-px bg-white/5" />
                </div>

                {/* Role selector for Google auth — shown in login mode since signup mode already has one above */}
                {isLogin && (
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Sign in as</label>
                        <select
                            className={`w-full bg-dark-800/50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-500/50 transition-standard ${formData.role ? 'text-white border-white/5' : 'text-slate-500 border-amber-500/30'}`}
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        >
                            <option value="" disabled>-- Select your role --</option>
                            <option value="freelancer">Freelancer</option>
                            <option value="client">Client</option>
                        </select>
                    </div>
                )}

                <button 
                    className="w-full py-3 bg-white/5 border border-white/5 hover:bg-white/10 text-slate-200 rounded-xl font-medium text-sm flex items-center justify-center gap-3 active:scale-[0.98] transition-standard"
                    onClick={handleGoogleLogin}
                >
                    <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" alt="Google" className="w-5 h-5 pointer-events-none" />
                    <span>Continue with Google</span>
                </button>

                <div className="mt-8 flex items-center justify-between text-[11px] text-slate-600">
                    <a href="/privacy" className="hover:text-slate-400 transition-colors">Privacy Policy</a>
                    <span className="text-slate-700">© {new Date().getFullYear()} FreelanceOS</span>
                </div>
            </div>
        </div>
    );
};

export default Auth;
