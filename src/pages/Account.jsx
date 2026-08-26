import React, { useState, useEffect } from 'react';
import { ArrowLeft, User, Mail, School, Check, Book, Loader2, LogOut } from 'lucide-react';

export default function Account({ onBack, onLogout }) {
  const [profile, setProfile] = useState({ name: '', email: '', avatar: '' });
  const [classes, setClasses] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchProfileAndClasses = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const [profileRes, classesRes] = await Promise.all([
        fetch(`${apiUrl}/api/users/me`),
        fetch(`${apiUrl}/api/classes`)
      ]);

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);
      }
      if (classesRes.ok) {
        const classesData = await classesRes.json();
        setClasses(classesData);
      }
    } catch (err) {
      console.error('Error fetching account data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileAndClasses();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg('');
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const res = await fetch(`${apiUrl}/api/users/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name,
          email: profile.email
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        setSuccessMsg('Profile updated successfully!');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to update profile');
      }
    } catch (err) {
      console.error('Error updating profile:', err);
      alert('Network error updating profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    );
  }

  // Calculate stats
  const totalProjects = classes.reduce((sum, cls) => sum + (cls.projects?.length || 0), 0);

  return (
    <div className="pt-6 sm:pt-24 pb-24 px-4 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Back Navigation */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-surface-500 hover:text-surface-900 transition-colors -mb-2 group"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">Back</span>
      </button>

      {/* Profile Header Card */}
      <div className="relative overflow-hidden bg-white rounded-3xl border border-surface-200 shadow-sm p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-br from-brand-400/10 to-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className={`h-24 w-24 rounded-full bg-gradient-to-br ${
            profile.role === 'teacher' 
              ? 'from-indigo-100 to-violet-200 text-indigo-700' 
              : 'from-brand-100 to-indigo-200 text-brand-700'
          } font-bold text-3xl border-4 border-white shadow-md flex items-center justify-center shrink-0`}>
            {profile.avatar}
          </div>

          <div className="text-center sm:text-left space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-heading font-bold text-surface-900 tracking-tight">
                {profile.name}
              </h1>
              {profile.role === 'teacher' ? (
                <span className="self-center sm:self-start text-[11px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Teacher Account
                </span>
              ) : (
                <span className="self-center sm:self-start text-[11px] font-bold text-brand-600 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {profile.role ? `${profile.role} Account` : 'Student Account'}
                </span>
              )}
            </div>
            <p className="text-surface-500">{profile.email}</p>
          </div>
        </div>

        {/* Prominent Header Logout Button */}
        <button
          onClick={onLogout}
          className="w-full sm:w-auto bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 hover:border-rose-300 px-5 py-2.5 rounded-2xl font-bold transition-all duration-200 active:scale-95 text-sm cursor-pointer z-10 flex items-center justify-center gap-2 shadow-sm hover:shadow"
        >
          <LogOut size={16} />
          <span>Log Out</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Stats and Info */}
        <div className="space-y-6 md:col-span-1">
          <div className="bg-white rounded-3xl border border-surface-200 shadow-sm p-6 space-y-6">
            <h2 className="text-lg font-heading font-bold text-surface-900 border-b border-surface-100 pb-3">
              Overview
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-50 p-4 rounded-2xl border border-surface-100 text-center">
                <p className={`text-2xl font-bold ${profile.role === 'teacher' ? 'text-indigo-600' : 'text-brand-600'}`}>
                  {classes.length}
                </p>
                <p className="text-xs text-surface-500 font-medium mt-1">
                  {profile.role === 'teacher' ? 'Classes Taught' : 'Classes Enrolled'}
                </p>
              </div>
              <div className="bg-surface-50 p-4 rounded-2xl border border-surface-100 text-center">
                <p className="text-2xl font-bold text-indigo-600">{totalProjects}</p>
                <p className="text-xs text-surface-500 font-medium mt-1">Total Projects</p>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 text-surface-600">
                <School size={18} className="text-surface-400" />
                <span className="text-sm font-medium">Greenwood High School</span>
              </div>
              <div className="flex items-center gap-3 text-surface-600">
                <Book size={18} className="text-surface-400" />
                <span className="text-sm font-medium">Academic Year 2026</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Settings & Edit Form */}
        <div className="space-y-6 md:col-span-2">
          <form onSubmit={handleSave} className="bg-white rounded-3xl border border-surface-200 shadow-sm p-6 sm:p-8 space-y-6">
            <h2 className="text-xl font-heading font-bold text-surface-900 border-b border-surface-100 pb-3">
              Profile Settings
            </h2>

            {successMsg && (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-3 rounded-xl border border-emerald-100 text-sm font-medium animate-in fade-in duration-200">
                <Check size={18} />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-surface-700">Display Name</label>
                <div className="relative">
                  <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input
                    type="text"
                    required
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="w-full bg-surface-50 border border-surface-200 rounded-xl py-3 pl-11 pr-4 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-surface-700">Email Address</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
                  <input
                    type="email"
                    required
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full bg-surface-50 border border-surface-200 rounded-xl py-3 pl-11 pr-4 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4">
              <button
                type="button"
                onClick={onLogout}
                className="border border-rose-200 text-rose-600 hover:bg-rose-50 px-6 py-2.5 rounded-xl font-medium transition-colors active:scale-95 text-sm cursor-pointer"
              >
                Sign Out
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="bg-brand-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-colors active:scale-95 text-sm cursor-pointer"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>

          {/* Enrolled/Taught Classes List */}
          <div className="bg-white rounded-3xl border border-surface-200 shadow-sm p-6 sm:p-8 space-y-6">
            <h2 className="text-xl font-heading font-bold text-surface-900 border-b border-surface-100 pb-3">
              {profile.role === 'teacher' ? 'Your Classes' : 'Your Enrolled Classes'}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {classes.map((cls) => (
                <div 
                  key={cls.id} 
                  className="p-4 bg-surface-50 border border-surface-200 rounded-2xl flex items-center gap-4 hover:shadow-sm transition-shadow"
                >
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${cls.color} flex items-center justify-center text-white shrink-0`}>
                    <Book size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-surface-900 text-sm">{cls.name}</h3>
                    <p className="text-xs text-surface-500">
                      {profile.role === 'teacher' && cls.teacher.trim().toLowerCase() === profile.name.trim().toLowerCase()
                        ? 'Taught by You'
                        : `Instructor: ${cls.teacher}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
