import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, CheckCircle2, Clock, AlertCircle, Sparkles, MessageSquarePlus, ArrowLeft, ChevronDown, ChevronRight, Upload, FileText, Download, Link2 } from 'lucide-react';
import { getGoogleCredentials } from '../utils/googleDriveConfig';

export default function Milestones({ classData, projectData, onBack }) {
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiText, setAiText] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  
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
      }
    } catch (err) {
      console.error('Error fetching milestones:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectData?.id]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  const handleOpenDrivePicker = (milestoneId) => {
    if (!creds.clientId || !creds.appId || !creds.developerKey) {
      alert('Google Drive integration is not configured. Please define VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_APP_ID, and VITE_GOOGLE_API_KEY in your .env file.');
      return;
    }
    setSubmittingMilestoneId(milestoneId);
    setIsPickerActive(true);
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
            await fetchMilestones();
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
  }, [isPickerActive, submittingMilestoneId, projectData?.id, fetchMilestones]);

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
                      <div className="flex-1" />
                      <div className="h-7 w-7 rounded-full bg-surface-100 flex items-center justify-center text-surface-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                        <ChevronDown size={18} className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-surface-900 mb-1 leading-tight">{ms.title}</h3>
                    <p className="text-surface-600 text-sm mb-4 leading-relaxed">{ms.details}</p>
                    
                    <div className={`flex items-center gap-2 ${isLeft ? 'sm:justify-end' : ''}`}>
                      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center text-[10px] font-bold text-brand-700 shadow-sm border border-brand-50">
                        {ms.assignee.charAt(0)}
                      </div>
                      <span className="text-xs font-semibold text-surface-600">{ms.assignee}</span>
                      
                      {ms.submission && (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded ml-2">
                          <CheckCircle2 size={12} />
                          Submitted
                        </span>
                      )}
                    </div>

                    {/* Expandable Submission Area */}
                    <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-5' : 'grid-rows-[0fr] opacity-0 mt-0'} pt-0`}>
                      <div className="overflow-hidden">
                        <div className={`pt-5 border-t border-surface-200/60 ${isLeft ? 'sm:text-right' : 'sm:text-left'} text-left`}>
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
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDrivePicker(ms.id);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm text-surface-700 bg-white border border-surface-200 shadow-sm hover:bg-surface-50 hover:border-surface-300 transition-all active:scale-[0.98]"
                              >
                                <Upload size={16} className="text-surface-500" />
                                Re-submit File
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-4 bg-brand-50/30 rounded-xl p-4 border border-brand-100 border-dashed">
                              <div className={`flex flex-col items-center justify-center text-center ${isLeft ? 'sm:items-end sm:text-right' : 'sm:items-start sm:text-left'}`}>
                                <div className="h-10 w-10 bg-white shadow-sm border border-surface-200 rounded-full flex items-center justify-center text-surface-400 mb-2">
                                  <FileText size={18} />
                                </div>
                                <h4 className="text-surface-900 font-semibold text-sm mb-1">No submission yet</h4>
                                <p className="text-surface-500 text-xs max-w-[200px]">Upload your work here so your team can review it.</p>
                              </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDrivePicker(ms.id);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-500/20 transition-all active:scale-[0.98] focus:ring-2 focus:ring-brand-500/50 focus:outline-none"
                              >
                                <Upload size={16} />
                                Submit Your Work
                              </button>
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
