import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, CheckCircle2, Clock, AlertCircle, Sparkles, MessageSquarePlus, ArrowLeft, ChevronDown, ChevronRight, Upload, FileText, Download, Link2 } from 'lucide-react';
import { getGoogleCredentials } from '../utils/googleDriveConfig';

export default function Milestones({ classData, projectData, onBack, onNavigate, onUpdateProject }) {
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiText, setAiText] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showManualSubmitModal, setShowManualSubmitModal] = useState(false);
  const [manualFileName, setManualFileName] = useState('');
  const [manualFileUrl, setManualFileUrl] = useState('');
  const [targetMilestoneId, setTargetMilestoneId] = useState(null);
  
  const [milestones, setMilestones] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [creds] = useState(getGoogleCredentials());
  const [isPickerActive, setIsPickerActive] = useState(false);
  const [submittingMilestoneId, setSubmittingMilestoneId] = useState(null);
  const pickerNodeRef = useRef(null);

  const fetchMilestones = useCallback(async () => {
    if (!projectData?.id) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/milestones`);
      if (res.ok) {
        const data = await res.json();
        setMilestones(data);
        const completed = data.filter(m => m.status === 'completed').length;
        if (data.length > 0 && onUpdateProject) {
          onUpdateProject({ progress: Math.round((completed / data.length) * 100) });
        }
      }
    } catch (err) {
      console.error('Error fetching milestones:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectData?.id, onUpdateProject]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  const handleUpdateStatus = async (milestoneId, newStatus, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        const data = await res.json();
        setMilestones(prev => prev.map(m => m.id === milestoneId ? { ...m, status: newStatus } : m));
        if (data.progress !== undefined && onUpdateProject) {
          onUpdateProject({ progress: data.progress });
        }
      }
    } catch (err) {
      console.error('Error updating milestone status:', err);
    }
  };

  const handleOpenDrivePicker = (milestoneId) => {
    if (!creds.clientId || !creds.appId || !creds.developerKey) {
      // Fallback to manual submission dialog if Drive credentials are not set
      setTargetMilestoneId(milestoneId);
      setShowManualSubmitModal(true);
      return;
    }
    setSubmittingMilestoneId(milestoneId);
    setIsPickerActive(true);
  };

  const handleManualSubmit = async () => {
    if (!manualFileName.trim() || !targetMilestoneId) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/milestones/${targetMilestoneId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          fileName: manualFileName.trim(),
          fileUrl: manualFileUrl.trim() || '#'
        })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchMilestones();
        if (data.progress !== undefined && onUpdateProject) {
          onUpdateProject({ progress: data.progress });
        }
        setShowManualSubmitModal(false);
        setManualFileName('');
        setManualFileUrl('');
        setTargetMilestoneId(null);
      }
    } catch (err) {
      console.error('Error submitting file:', err);
    }
  };

  useEffect(() => {
    if (!isPickerActive) return;
    const node = pickerNodeRef.current;
    if (!node) return;

    // Auto-trigger open when the element mounts (deferred to avoid synchronous render issues)
    const openTimer = setTimeout(() => {
      if (node && typeof node.open === 'function') {
        node.open();
      }
    }, 0);

    const handlePicked = async (event) => {
      const selectedDocs = event.detail.docs;
      if (selectedDocs && selectedDocs.length > 0 && submittingMilestoneId) {
        try {
          const doc = selectedDocs[0];
          const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/projects/${projectData.id}/milestones/${submittingMilestoneId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              fileName: doc.name,
              fileUrl: doc.url
            })
          });
          if (res.ok) {
            const data = await res.json();
            await fetchMilestones();
            if (data.progress !== undefined && onUpdateProject) {
              onUpdateProject({ progress: data.progress });
            }
          }
        } catch (err) {
          console.error('Error submitting picked document:', err);
        }
      }
      setIsPickerActive(false);
      setSubmittingMilestoneId(null);
    };

    const handleCanceled = () => {
      setIsPickerActive(false);
      setSubmittingMilestoneId(null);
    };

    node.addEventListener('picker:picked', handlePicked);
    node.addEventListener('picker:canceled', handleCanceled);

    return () => {
      clearTimeout(openTimer);
      node.removeEventListener('picker:picked', handlePicked);
      node.removeEventListener('picker:canceled', handleCanceled);
    };
  }, [isPickerActive, submittingMilestoneId, projectData?.id, fetchMilestones, onUpdateProject]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="text-emerald-500 bg-white rounded-full" size={28} />;
      case 'in-progress': return <Clock className="text-brand-500 bg-white rounded-full" size={28} />;
      case 'delayed': return <AlertCircle className="text-rose-500 bg-white rounded-full" size={28} />;
      default: return <div className="w-7 h-7 rounded-full border-2 border-surface-300 bg-surface-50" />;
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="pt-6 sm:pt-24 pb-32 px-4 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Back Navigation */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-surface-500 hover:text-surface-900 transition-colors mb-6 group"
      >
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="font-medium">Back to Projects</span>
      </button>

      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-heading font-bold text-surface-900 tracking-tight">Timeline</h1>
          <p className="text-surface-600 mt-1">{projectData ? projectData.name : 'Manage project micro-milestones'}</p>
        </div>
        <button 
          onClick={() => setShowAiPrompt(!showAiPrompt)}
          className="bg-brand-100 text-brand-700 px-4 py-2 flex items-center gap-2 rounded-xl font-medium hover:bg-brand-200 transition-colors active:scale-95"
        >
          <Sparkles size={18} className="text-brand-600" />
          <span className="hidden sm:inline">AI Assistant</span>
        </button>
      </div>

      {showAiPrompt && (
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-2xl p-6 shadow-xl shadow-brand-500/20 mb-8 animate-in zoom-in-95 duration-200 text-white">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/20 rounded-xl glass shrink-0">
              <Sparkles size={24} className="text-white" />
            </div>
            <div className="flex-1 space-y-3">
              <h3 className="font-heading font-bold text-xl">Generate a Timeline</h3>
              <p className="text-brand-100 text-sm">Paste your rubric or assignment prompt here, and I'll generate a list of micro-milestones for your team.</p>
              <div className="relative">
                <textarea 
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="e.g. 10 page research paper about the Cold War with a presentation component..."
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-3 text-white placeholder-brand-300/60 focus:outline-none focus:ring-2 focus:ring-white/50 min-h-[100px] resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={() => setShowAiPrompt(false)}
                  className="px-4 py-2 rounded-xl font-medium text-brand-100 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button className="bg-white text-brand-900 px-6 py-2 rounded-xl font-medium hover:bg-surface-50 transition-colors shadow-sm active:scale-95">
                  Generate Milestones
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative mt-8 ml-3 sm:ml-0">
        {/* Vertical Line */}
        <div className="absolute left-[13px] sm:left-1/2 top-4 bottom-4 w-0.5 bg-surface-200 -translate-x-1/2 sm:translate-x-0" />

        <div className="space-y-6 lg:space-y-8">
          {milestones.map((ms, index) => {
            const isLeft = index % 2 === 0;
            const isExpanded = expandedId === ms.id;
            
            return (
              <div key={ms.id} className={`relative flex items-start sm:items-center justify-between sm:justify-start w-full ${isLeft ? 'sm:flex-row-reverse' : ''}`}>
                {/* Timeline Node */}
                <div className="absolute left-0 sm:left-1/2 -translate-x-1/2 mt-5 sm:mt-0 flex items-center justify-center w-8 h-8 z-10">
                  <div className="bg-surface-50 rounded-full p-0.5 shadow-sm">
                    {getStatusIcon(ms.status)}
                  </div>
                </div>

                {/* Content Card */}
                <div className={`w-full pl-10 sm:pl-0 sm:w-[calc(50%-2rem)] ${isLeft ? 'sm:text-right sm:pr-8' : 'sm:pl-8 sm:ml-auto'}`}>
                  <div 
                    onClick={() => toggleExpand(ms.id)}
                    className={`glass rounded-2xl p-5 hover:shadow-md transition-all duration-300 cursor-pointer border ${isExpanded ? 'border-brand-300 ring-2 ring-brand-100 ring-offset-2' : 'border-surface-200 hover:border-surface-300'} group bg-white/70 backdrop-blur-md`}
                  >
                    <div className={`flex items-center gap-2 mb-2 ${isLeft ? 'sm:flex-row-reverse' : ''}`}>
                      <span className="text-sm font-semibold text-brand-600 px-2.5 py-1 bg-brand-50 rounded-lg">{ms.date}</span>
                      <span className="text-xs font-medium text-surface-500 bg-surface-100 px-2 py-0.5 rounded-md">Team Milestone</span>
                      <div className="flex-1" />
                      <div className="h-7 w-7 rounded-full bg-surface-100 flex items-center justify-center text-surface-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                        <ChevronDown size={18} className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-surface-900 mb-1 leading-tight">{ms.title}</h3>
                    <p className="text-surface-600 text-sm mb-4 leading-relaxed">{ms.details}</p>
                    
                    {ms.submission && (
                      <div className={`flex items-center gap-2 ${isLeft ? 'sm:justify-end' : ''}`}>
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                          <CheckCircle2 size={12} />
                          Submitted
                        </span>
                      </div>
                    )}

                    {/* Expandable Submission Area */}
                    <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-5' : 'grid-rows-[0fr] opacity-0 mt-0'} pt-0`}>
                      <div className="overflow-hidden">
                        <div className={`pt-5 border-t border-surface-200/60 ${isLeft ? 'sm:text-right' : 'sm:text-left'} text-left`}>
                          
                          {/* Quick Status Toggles for Team */}
                          <div className="mb-4 pb-4 border-b border-surface-200/60 flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <p className="text-xs font-bold text-surface-600 uppercase tracking-wider">Milestone Status</p>
                              <p className="text-[11px] text-surface-400">Shared progress across entire team</p>
                            </div>
                            <div className="flex items-center gap-1.5 bg-surface-100 p-1 rounded-xl">
                              <button
                                onClick={(e) => handleUpdateStatus(ms.id, 'pending', e)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                  ms.status === 'pending'
                                    ? 'bg-white text-surface-900 shadow-sm font-semibold'
                                    : 'text-surface-600 hover:text-surface-900'
                                }`}
                              >
                                Pending
                              </button>
                              <button
                                onClick={(e) => handleUpdateStatus(ms.id, 'in-progress', e)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                  ms.status === 'in-progress'
                                    ? 'bg-brand-500 text-white shadow-sm font-semibold'
                                    : 'text-surface-600 hover:text-surface-900'
                                }`}
                              >
                                In Progress
                              </button>
                              <button
                                onClick={(e) => handleUpdateStatus(ms.id, 'completed', e)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                  ms.status === 'completed'
                                    ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                                    : 'text-surface-600 hover:text-surface-900'
                                }`}
                              >
                                Completed ✓
                              </button>
                            </div>
                          </div>

                          {ms.submission ? (
                            <div className="space-y-4">
                              <div>
                                <p className="text-xs font-bold text-surface-500 uppercase tracking-wider mb-2.5 flex items-center gap-2 before:content-[''] before:w-1 before:h-3 before:bg-brand-400 before:rounded-full">
                                  Submitted Workspace
                                </p>
                                <div 
                                  onClick={(e) => {
                                    if (ms.submission.fileUrl) {
                                      e.stopPropagation();
                                      window.open(ms.submission.fileUrl, '_blank', 'noopener,noreferrer');
                                    }
                                  }}
                                  className={`flex items-center gap-3 p-3.5 bg-surface-50/80 rounded-xl border border-surface-200 hover:border-brand-200 hover:bg-brand-50/50 transition-colors group/file ${isLeft ? 'sm:flex-row-reverse' : ''} ${ms.submission.fileUrl ? 'cursor-pointer' : ''}`}
                                >
                                  <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center text-brand-600 shrink-0 shadow-sm border border-surface-200 group-hover/file:border-brand-200 group-hover/file:bg-brand-50">
                                    <FileText size={20} className="group-hover/file:scale-110 transition-transform" />
                                  </div>
                                  <div className={`flex-1 overflow-hidden ${isLeft ? 'sm:text-right' : ''}`}>
                                    <p className="font-semibold text-surface-900 text-sm truncate">{ms.submission.fileName}</p>
                                    <p className="text-xs text-surface-500 font-medium">{ms.submission.submittedAt}</p>
                                  </div>
                                  {ms.submission.fileUrl ? (
                                    <a
                                      href={ms.submission.fileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="h-8 w-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-brand-600 hover:bg-white shadow-sm transition-all focus:outline-none shrink-0"
                                    >
                                      <Download size={16} />
                                    </a>
                                  ) : (
                                    <button 
                                      className="h-8 w-8 rounded-lg flex items-center justify-center text-surface-400 hover:text-brand-600 hover:bg-white shadow-sm transition-all focus:outline-none shrink-0" 
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Download size={16} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDrivePicker(ms.id);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-semibold text-xs text-surface-700 bg-white border border-surface-200 shadow-sm hover:bg-surface-50 transition-all cursor-pointer active:scale-98"
                                >
                                  <Upload size={14} className="text-surface-500" />
                                  Re-submit File
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTargetMilestoneId(ms.id);
                                    setShowManualSubmitModal(true);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-semibold text-xs text-brand-700 bg-brand-50 border border-brand-200 hover:bg-brand-100 transition-all cursor-pointer active:scale-98"
                                >
                                  <Link2 size={14} />
                                  Attach Link / Doc
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4 bg-brand-50/30 rounded-xl p-4 border border-brand-100 border-dashed">
                              <div className={`flex flex-col items-center justify-center text-center ${isLeft ? 'sm:items-end sm:text-right' : 'sm:items-start sm:text-left'}`}>
                                <div className="h-10 w-10 bg-white shadow-sm border border-surface-200 rounded-full flex items-center justify-center text-surface-400 mb-2">
                                  <FileText size={18} />
                                </div>
                                <h4 className="text-surface-900 font-semibold text-sm mb-1">No submission yet</h4>
                                <p className="text-surface-500 text-xs max-w-[200px]">Upload work or submit doc link for the entire group.</p>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDrivePicker(ms.id);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl font-semibold text-xs text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-500/20 transition-all cursor-pointer"
                                >
                                  <Upload size={14} />
                                  Google Drive
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTargetMilestoneId(ms.id);
                                    setShowManualSubmitModal(true);
                                  }}
                                  className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl font-semibold text-xs text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 shadow-sm transition-all cursor-pointer"
                                >
                                  <Link2 size={14} />
                                  Attach Link / Doc
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual Submit Modal */}
      {showManualSubmitModal && (
        <div className="fixed inset-0 bg-surface-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-heading font-bold text-lg text-surface-900">Submit Milestone Work</h3>
              <button 
                onClick={() => setShowManualSubmitModal(false)}
                className="text-surface-400 hover:text-surface-600 text-sm p-1 rounded-lg"
              >
                ✕
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-surface-700 mb-1">Document / Submission Name</label>
              <input 
                type="text" 
                value={manualFileName}
                onChange={(e) => setManualFileName(e.target.value)}
                placeholder="e.g. Cold_War_Perspectives_Paper.pdf"
                className="w-full bg-surface-50 border border-surface-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-surface-700 mb-1">Resource Link / URL (Optional)</label>
              <input 
                type="url" 
                value={manualFileUrl}
                onChange={(e) => setManualFileUrl(e.target.value)}
                placeholder="https://docs.google.com/document/..."
                className="w-full bg-surface-50 border border-surface-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button 
                onClick={() => setShowManualSubmitModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-surface-600 hover:bg-surface-100 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handleManualSubmit}
                disabled={!manualFileName.trim()}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 cursor-pointer shadow-sm shadow-brand-500/20"
              >
                Submit Work
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Integration Elements */}
      {isPickerActive && creds.clientId && creds.appId && creds.developerKey && (
        <drive-picker
          ref={pickerNodeRef}
          client-id={creds.clientId}
          app-id={creds.appId}
          developer-key={creds.developerKey}
        >
          <drive-picker-docs-view
            owned-by-me="true"
            mime-types="application/pdf,image/png,image/jpeg,application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation"
          />
        </drive-picker>
      )}
    </div>
  );
}
