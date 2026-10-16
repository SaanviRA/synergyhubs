import React from 'react';
import { GraduationCap, Presentation } from 'lucide-react';
import LegalLinks from '../components/LegalLinks';

export default function RoleSelection({ onSelectRole }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface-100 px-4 py-12 relative overflow-hidden">
      
      {/* Decorative gradient glowing orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-400/10 rounded-full blur-3xl animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse pointer-events-none" />

      {/* Main Glass Card container */}
      <div className="w-full max-w-2xl bg-white/80 backdrop-blur-xl border border-surface-200 shadow-2xl rounded-3xl p-8 sm:p-12 space-y-8 relative z-10 animate-in fade-in zoom-in-95 duration-500 text-center">
        
        {/* Branding header */}
        <div className="space-y-3">
          <h1 className="text-4xl font-heading font-black tracking-tight bg-gradient-to-r from-brand-600 via-indigo-600 to-indigo-700 bg-clip-text text-transparent">
            Welcome to SynergyHubs
          </h1>
          <p className="text-base text-surface-600 max-w-lg mx-auto">
            SynergyHubs helps students and teachers run class group projects in one place: organize classes,
            build project teams, track milestones and submissions, share resources and workspaces, and post
            progress updates.
          </p>
          <p className="text-base text-surface-500 max-w-md mx-auto font-medium">
            To get started, please select your primary role. This helps us customize your collaboration dashboard.
          </p>
        </div>

        {/* Roles Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
          
          {/* Student Card */}
          <button
            onClick={() => onSelectRole('student')}
            className="group relative flex flex-col items-center justify-center bg-white hover:bg-gradient-to-b hover:from-white hover:to-brand-50/20 border border-surface-200 hover:border-brand-400 rounded-3xl p-8 transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 cursor-pointer active:scale-98 text-center"
          >
            {/* Blue glowing bubble around icon */}
            <div className="h-16 w-16 rounded-2xl bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-all duration-300 flex items-center justify-center mb-5 shadow-sm group-hover:shadow-md group-hover:scale-110">
              <GraduationCap size={32} className="transition-transform group-hover:rotate-6 duration-300" />
            </div>
            
            <h2 className="text-xl font-bold text-surface-900 group-hover:text-brand-700 transition-colors">
              I am a Student
            </h2>
            <p className="text-sm text-surface-500 mt-2 line-clamp-3 leading-relaxed">
              Join class workspaces, coordinate with project teammates, submit milestones, and document logs.
            </p>
            
            <div className="mt-6 flex items-center gap-1 text-xs font-bold text-brand-600 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
              <span>Continue</span>
              <span>→</span>
            </div>
          </button>

          {/* Teacher Card */}
          <button
            onClick={() => onSelectRole('teacher')}
            className="group relative flex flex-col items-center justify-center bg-white hover:bg-gradient-to-b hover:from-white hover:to-indigo-50/20 border border-surface-200 hover:border-indigo-400 rounded-3xl p-8 transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 cursor-pointer active:scale-98 text-center"
          >
            {/* Indigo glowing bubble around icon */}
            <div className="h-16 w-16 rounded-2xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 flex items-center justify-center mb-5 shadow-sm group-hover:shadow-md group-hover:scale-110">
              <Presentation size={32} className="transition-transform group-hover:rotate-6 duration-300" />
            </div>
            
            <h2 className="text-xl font-bold text-surface-900 group-hover:text-indigo-700 transition-colors">
              I am a Teacher
            </h2>
            <p className="text-sm text-surface-500 mt-2 line-clamp-3 leading-relaxed">
              Manage student classes, view active projects, evaluate group logs, and guide student progress.
            </p>
            
            <div className="mt-6 flex items-center gap-1 text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300">
              <span>Continue</span>
              <span>→</span>
            </div>
          </button>

        </div>

        {/* Footer info */}
        <div className="space-y-3">
          <p className="text-xs text-surface-400 font-medium">
            Already have an account? Your chosen role will be verified when you sign in.
          </p>
          <p className="text-xs text-surface-500 max-w-lg mx-auto leading-relaxed">
            You can sign in with Google, which shares your name, email and profile picture with SynergyHubs. Google
            Drive is used only to attach files you choose; SynergyHubs cannot see the rest of your Drive.
          </p>
          <LegalLinks />
        </div>

      </div>
    </div>
  );
}
