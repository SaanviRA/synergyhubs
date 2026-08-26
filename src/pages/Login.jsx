import React, { useState, useEffect, useRef } from 'react';
import { Mail, Lock, User, AlertCircle, Eye, EyeOff, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';

export default function Login({ role, onBackToRole, onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const googleBtnRef = useRef(null);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '11127031988-hlc3r0rc9naq07lte3r0mp9msqopeuhl.apps.googleusercontent.com';

  // Initialize Google Sign-In
  useEffect(() => {
    /* global google */
    if (typeof google !== 'undefined' && GOOGLE_CLIENT_ID) {
      try {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredentialResponse,
          context: 'signin',
          auto_select: false
        });

        // Render Google Sign-in button
        google.accounts.id.renderButton(
          googleBtnRef.current,
          { 
            theme: 'outline', 
            size: 'large', 
            width: '100%', 
            text: 'continue_with',
            shape: 'pill'
          }
        );
      } catch (err) {
        console.error('Error initializing Google Sign-In:', err);
      }
    }
  }, [GOOGLE_CLIENT_ID, isSignUp]); // Re-render when switching modes to ensure element references hold

  // Handle Google Token Callback
  const handleGoogleCredentialResponse = async (response) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential, role })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Google login failed');

      // Save credentials & notify parent
      localStorage.setItem('authToken', data.token);
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Traditional Submit (Login / SignUp)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Quick client-side checks
    if (isSignUp && password !== confirmPassword) {
      return setError('Passwords do not match');
    }
    if (password.length < 8) {
      return setError('Password must be at least 8 characters long');
    }

    setLoading(true);
    const endpoint = isSignUp ? '/api/auth/signup' : '/api/auth/login';
    const payload = isSignUp ? { name, email, password, role } : { email, password, role };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      // Save token and notify parent
      localStorage.setItem('authToken', data.token);
      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface-100 px-4 py-12 relative overflow-hidden">
      
      {/* Decorative gradient glowing orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-400/10 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse pointer-events-none" />

      {/* Main Glass Card container */}
      <div className="w-full max-w-md bg-white backdrop-blur-xl border border-surface-200 shadow-2xl rounded-3xl p-8 sm:p-10 space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-500 pt-12 sm:pt-14">
        
        {/* Back Button */}
        <button
          type="button"
          onClick={onBackToRole}
          className="absolute top-5 left-6 text-surface-400 hover:text-surface-700 transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold uppercase tracking-wider"
          title="Change Role"
        >
          <ArrowLeft size={14} />
          <span>Role</span>
        </button>

        {/* Branding header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-heading font-black tracking-tight bg-gradient-to-r from-brand-600 to-indigo-600 bg-clip-text text-transparent">
            {isSignUp ? 'Create an Account' : 'Welcome Back'}
          </h1>
          <p className="text-sm text-surface-500 font-medium">
            {isSignUp 
              ? `Get started as a ${role} by setting up your workspace` 
              : `Log in to manage your ${role === 'teacher' ? 'class groups' : 'group projects'}`
            }
          </p>
        </div>

        {/* Error notification */}
        {error && (
          <div className="flex items-start gap-2 bg-rose-50 text-rose-700 px-4 py-3 rounded-xl border border-rose-100 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Login/Signup Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-surface-600 uppercase tracking-wider pl-1">Full Name</label>
              <div className="relative">
                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type="text"
                  required
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-50 border border-surface-200 rounded-xl py-3 pl-11 pr-4 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium text-sm"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-surface-600 uppercase tracking-wider pl-1">Email Address</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="email"
                required
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-50 border border-surface-200 rounded-xl py-3 pl-11 pr-4 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-surface-600 uppercase tracking-wider pl-1">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-50 border border-surface-200 rounded-xl py-3 pl-11 pr-12 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {isSignUp && (
            <div className="space-y-1.5 animate-in slide-in-from-top-4 duration-300">
              <label className="text-xs font-bold text-surface-600 uppercase tracking-wider pl-1">Confirm Password</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-surface-50 border border-surface-200 rounded-xl py-3 pl-11 pr-4 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium text-sm"
                />
              </div>
            </div>
          )}

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-brand-500/25 active:scale-95 transition-all text-sm mt-6"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 py-2 text-surface-400 text-xs font-bold uppercase tracking-widest">
          <div className="h-px bg-surface-200 flex-1" />
          <span>or</span>
          <div className="h-px bg-surface-200 flex-1" />
        </div>

        {/* Google SSO Button Element */}
        <div className="space-y-3">
          <div ref={googleBtnRef} className="w-full min-h-[44px] flex justify-center" />
        </div>

        {/* Toggle between Login / Sign Up */}
        <div className="text-center pt-2">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 cursor-pointer"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>

      </div>
    </div>
  );
}
