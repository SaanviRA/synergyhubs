import React, { useState, useEffect, useCallback } from 'react';
import { User, ShieldCheck, PenTool, MessageSquare, Plus, Activity, ArrowLeft, MailPlus, X, Trash2, UserMinus } from 'lucide-react';

export default function Team({ classData, projectData, onBack, onNavigate, onUpdateProject }) {
  const [showLogModal, setShowLogModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  
  const [logText, setLogText] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [newRole, setNewRole] = useState('');
  const [updateText, setUpdateText] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);

  const [team, setTeam] = useState([]);
  const [pastLogs, setPastLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTeamAndLogs = useCallback(async () => {
    if (!projectData?.id) return;
    try {
      const teamRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/team`);
      const logsRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/logs`);
      if (teamRes.ok && logsRes.ok) {
        const teamData = await teamRes.json();
        const logsData = await logsRes.json();
        setTeam(teamData);
        setPastLogs(logsData);
      }
    } catch (err) {
      console.error('Error fetching team or logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectData?.id]);

  useEffect(() => {
    fetchTeamAndLogs();
  }, [fetchTeamAndLogs]);

  const handleLogWork = async () => {
    if (!logText.trim()) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: logText.trim() })
      });
      if (res.ok) {
        await fetchTeamAndLogs();
        setLogText('');
        setShowLogModal(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostUpdate = async () => {
    if (!updateText.trim()) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/team/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: updateText.trim() })
      });
      if (res.ok) {
        await fetchTeamAndLogs();
        setUpdateText('');
        setShowUpdateModal(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLog = async (logId) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/logs/${logId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchTeamAndLogs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleInvite = async () => {
    if (inviteEmail.trim()) {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/team/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: inviteEmail.trim() })
        });
        if (res.ok) {
          await fetchTeamAndLogs();
          setInviteEmail('');
          setShowInviteModal(false);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const openRoleModal = (userId) => {
    setEditingUserId(userId);
    setNewRole('');
    setShowRoleModal(true);
  };

  const handleAddRole = async () => {
    if (newRole.trim() && editingUserId) {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/team/role`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: editingUserId, role: newRole.trim() })
        });
        if (res.ok) {
          await fetchTeamAndLogs();
          setNewRole('');
          setShowRoleModal(false);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleRemoveRole = async (userId, roleToRemove) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/team/role`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: roleToRemove })
      });
      if (res.ok) {
        await fetchTeamAndLogs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveMember = async (member) => {
    if (!window.confirm(`Remove ${member.name} from this project's team?`)) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/team/${member.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await fetchTeamAndLogs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="pt-6 sm:pt-24 pb-32 px-4 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Back Navigation */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-surface-500 hover:text-surface-900 transition-colors group"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">Back to Projects</span>
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-heading font-bold text-surface-900 tracking-tight">Team Hub</h1>
          <p className="text-surface-600 mt-1">{projectData ? projectData.name : 'Roles and Contributions'}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowInviteModal(true)}
            className="flex-1 sm:flex-none bg-surface-100 text-surface-700 px-4 py-2 flex items-center justify-center gap-2 rounded-xl font-medium border border-surface-200 hover:bg-surface-200 transition-colors active:scale-95"
          >
            <MailPlus size={18} />
            <span className="hidden sm:inline">Invite Member</span>
          </button>
          <button 
            onClick={() => setShowUpdateModal(true)}
            className="flex-1 sm:flex-none bg-surface-100 text-surface-700 px-4 py-2 flex items-center justify-center gap-2 rounded-xl font-medium border border-surface-200 hover:bg-surface-200 transition-colors active:scale-95"
          >
            <MessageSquare size={18} />
            <span className="hidden sm:inline">Post Update</span>
          </button>
        </div>
      </div>

      {/* Role Assignments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {team.map((member) => (
          <div key={member.id} className={`glass rounded-2xl p-5 border-t-4 flex flex-col ${member.isMe ? 'border-brand-500' : 'border-surface-200'}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 font-semibold border-2 border-white shadow-sm flex items-center justify-center shrink-0">
                {member.avatar}
              </div>
              <div className="flex items-center gap-1">
                {member.isOwner && (
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-full uppercase tracking-wider">
                    Owner
                  </span>
                )}
                {member.isMe && (
                  <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded-full uppercase tracking-wider">
                    You
                  </span>
                )}
                {!member.isOwner && !member.isMe && (
                  <button
                    onClick={() => handleRemoveMember(member)}
                    className="p-1.5 text-surface-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Remove from team"
                  >
                    <UserMinus size={16} />
                  </button>
                )}
              </div>
            </div>
            
            <h3 className="font-bold text-surface-900 text-lg mb-2">{member.name}</h3>
            
            <div className="flex flex-wrap gap-2 mb-4 flex-1">
              {member.roles.map((r, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5 bg-brand-50 border border-brand-100/50 text-brand-700 px-2.5 py-1 rounded-lg text-xs font-medium">
                  <ShieldCheck size={12} />
                  {r}
                  <button 
                    onClick={() => handleRemoveRole(member.id, r)} 
                    className="hover:text-rose-500 transition-colors ml-1 p-0.5 rounded-full hover:bg-brand-100/50"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <button 
                onClick={() => openRoleModal(member.id)} 
                className="inline-flex items-center gap-1 border border-dashed border-surface-300 text-surface-500 px-2.5 py-1 rounded-lg text-xs font-medium hover:bg-surface-50 transition-colors"
                title="Add a role"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            
            <div className="pt-3 border-t border-surface-100">
              <p className="text-xs text-surface-500 mb-1 flex items-center gap-1">
                <Activity size={12} />
                Latest update:
              </p>
              <p className="text-sm text-surface-700 line-clamp-2">{member.activeLog}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Peer Evaluation / Personal Log */}
      <div className="glass rounded-2xl overflow-hidden mt-8">
        <div className="bg-surface-50/50 p-5 sm:p-6 border-b border-surface-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-100 text-brand-700 rounded-lg shrink-0">
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 className="text-xl font-heading font-bold text-surface-900">Your Evaluation Log</h2>
              <p className="text-sm text-surface-500">Private log of your contributions for the teacher view.</p>
            </div>
          </div>
          <button 
            onClick={() => setShowLogModal(true)}
            className="bg-brand-600 text-white px-4 py-2 flex items-center justify-center gap-2 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-colors active:scale-95 text-sm shrink-0"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Log Comment</span>
            <span className="sm:hidden">Log</span>
          </button>
        </div>
        
        <div className="p-5 sm:p-6 space-y-4">
          {pastLogs.map((log, i) => (
            <div key={i} className="flex gap-4 group">
              <div className="text-sm font-medium text-surface-400 w-16 pt-1 shrink-0">{log.date}</div>
              <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 pr-12 flex-1 text-surface-800 text-sm hover:shadow-sm transition-shadow relative">
                {log.text}
                <button
                  onClick={() => handleDeleteLog(log.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-surface-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete log"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Modal overlay */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-surface-100 flex justify-between items-center">
              <h2 className="text-xl font-heading font-bold text-surface-900">Invite Member</h2>
              <button onClick={() => setShowInviteModal(false)} className="text-surface-400 hover:text-surface-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-surface-700 mb-2">Email Address</label>
              <input 
                type="email"
                autoFocus
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                placeholder="name@school.edu"
                className="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 mb-6"
              />
              <button 
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || !inviteEmail.includes('@')}
                className="w-full bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-colors active:scale-95"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Role Modal overlay */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-surface-100 flex justify-between items-center">
              <h2 className="text-xl font-heading font-bold text-surface-900">Assign Role</h2>
              <button onClick={() => setShowRoleModal(false)} className="text-surface-400 hover:text-surface-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-surface-700 mb-2">Role Title</label>
              <input 
                type="text"
                autoFocus
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRole()}
                placeholder="e.g. Graphic Designer"
                className="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 mb-6"
              />
              <button 
                onClick={handleAddRole}
                disabled={!newRole.trim()}
                className="w-full bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 transition-colors active:scale-95"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Work Modal overlay */}
      {showLogModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-surface-100 flex justify-between items-center">
              <h2 className="text-xl font-heading font-bold text-surface-900">Record Contribution</h2>
              <button onClick={() => setShowLogModal(false)} className="text-surface-400 hover:text-surface-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-surface-700 mb-2">What did you complete today?</label>
              <textarea 
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                placeholder="e.g. Finished slides 1-5 and added the sources..."
                className="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 min-h-[120px] resize-none mb-4"
              />
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 rounded-xl font-medium text-surface-600 hover:bg-surface-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleLogWork}
                  disabled={!logText.trim()}
                  className="bg-brand-600 text-white px-6 py-2 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95"
                >
                  Save to Log
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post Status Update Modal overlay */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-6 border-b border-surface-100 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-brand-50 text-brand-600 rounded-lg">
                  <MessageSquare size={18} />
                </div>
                <h2 className="text-xl font-heading font-bold text-surface-900">Post Status Update</h2>
              </div>
              <button onClick={() => setShowUpdateModal(false)} className="text-surface-400 hover:text-surface-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-surface-700 mb-2">
                What are you working on right now? (Visible to everyone on the team)
              </label>
              <textarea 
                value={updateText}
                onChange={(e) => setUpdateText(e.target.value)}
                placeholder="e.g. Drafting the layout for presentation slides..."
                className="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 min-h-[120px] resize-none mb-4"
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setShowUpdateModal(false)}
                  className="px-4 py-2 rounded-xl font-medium text-surface-600 hover:bg-surface-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handlePostUpdate}
                  disabled={!updateText.trim()}
                  className="bg-brand-600 text-white px-6 py-2 rounded-xl font-medium shadow-md shadow-brand-500/20 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95"
                >
                  Post Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
