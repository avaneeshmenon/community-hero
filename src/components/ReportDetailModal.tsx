import React, { useState, useEffect } from 'react';
import { db, signInWithGoogle } from '../lib/firebase';
import { doc, getDoc, collection, query, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { X, Share2, MapPin, Sparkles, AlertTriangle, Loader2, Check, Lock, ChevronLeft, ChevronRight, ShieldAlert, Copy, Download, CheckSquare } from 'lucide-react';
import { Report, UserDoc, AuthorityAction } from '../types';
import { User } from 'firebase/auth';
import ReportCard from './ReportCard';
import { generateEscalationTrailStep, markStage0Dispatched, formatComplaintBody } from '../lib/escalationTrailService';

interface ReportDetailModalProps {
  reportId: string;
  onClose: () => void;
  user: User | null;
  currentUserDoc: UserDoc | null;
  onDeleted?: () => void;
  loadingUser?: boolean;
  onUserClick?: (uid: string) => void;
}

export default function ReportDetailModal({
  reportId,
  onClose,
  user,
  currentUserDoc,
  onDeleted,
  loadingUser = false,
  onUserClick
}: ReportDetailModalProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [images, setImages] = useState<{ id: string; data: string; order: number; label?: string }[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  // Complaint Actions and States
  const [copiedComplaint, setCopiedComplaint] = useState(false);
  const [markingDispatched, setMarkingDispatched] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalationError, setEscalationError] = useState<string | null>(null);
  const [expandedNoticeLevel, setExpandedNoticeLevel] = useState<number | null>(null);

  const handleManualEscalate = async () => {
    if (!report || escalating) return;

    // Escalation is allowed only for Verified or In Progress reports (stage < 3, which is highestStage < 3)
    if (report.status !== 'Verified' && report.status !== 'In Progress') {
      setEscalationError("Escalation is only allowed for Verified or In Progress reports.");
      return;
    }

    const actions = report.authorityActions || [];
    const highestStage = actions.reduce((max, act) => act.stage > max ? act.stage : max, -1);
    
    if (highestStage >= 3) {
      setEscalationError("Maximum escalation stage reached.");
      return;
    }

    const nextLevel = highestStage + 1;

    setEscalating(true);
    setEscalationError(null);
    try {
      const userId = user?.uid || 'manual-demo';
      const newAction = await generateEscalationTrailStep(report, nextLevel, userId);
      setReport(prev => {
        if (!prev) return null;
        const updatedActions = prev.authorityActions ? [...prev.authorityActions] : [];
        const existingIdx = updatedActions.findIndex(a => a.stage === nextLevel);
        if (existingIdx !== -1) {
          updatedActions[existingIdx] = newAction;
        } else {
          updatedActions.push(newAction);
        }
        updatedActions.sort((a, b) => a.stage - b.stage);
        return {
          ...prev,
          authorityActions: updatedActions
        };
      });
    } catch (err: any) {
      console.error("Failed to manually escalate report:", err);
      setEscalationError(err.message || String(err));
    } finally {
      setEscalating(false);
    }
  };

  const handleCopyComplaint = (action: AuthorityAction) => {
    if (!action) return;
    const formattedBody = formatComplaintBody(action.body);
    const fullText = `${action.authorityName}\n\n${action.subject}\n\n${formattedBody}`;
    navigator.clipboard.writeText(fullText).then(() => {
      setCopiedComplaint(true);
      setTimeout(() => setCopiedComplaint(false), 2000);
    });
  };

  const downloadTxtFile = (action: AuthorityAction) => {
    if (!action) return;
    const formattedBody = formatComplaintBody(action.body);
    const textContent = `
MUNICIPAL ACTION STAGE ${action.stage} REFERENCE ID: ${action.referenceId}
STATUS: ${action.stage === 0 ? (action.dispatchStatus || 'Drafted') : 'Escalated'}
DATE GENERATED: ${new Date(action.generatedAt).toLocaleString()}
================================================================
${action.authorityName}

${action.subject}

${formattedBody}

----------------------------------------------------------------
Disclaimer: This document is drafted automatically by the Citizen
Hazard civic intelligence system based on verified public reports.
================================================================
`;
    const element = document.createElement("a");
    const file = new Blob([textContent], {type: 'text/plain;charset=utf-8'});
    element.href = URL.createObjectURL(file);
    element.download = `Authority_Escalation_Stage_${action.stage}_${action.referenceId}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleMarkDispatched = async () => {
    if (!report?.id || !report.authorityActions) return;
    setMarkingDispatched(true);
    try {
      const updated = await markStage0Dispatched(report.id, report.authorityActions);
      setReport(prev => prev ? {
        ...prev,
        authorityActions: updated
      } : null);
    } catch (err) {
      console.error("Failed to mark as dispatched:", err);
    } finally {
      setMarkingDispatched(false);
    }
  };

  // Touch Swipe State
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = (isLightbox: boolean = false) => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    if (isLeftSwipe) {
      if (isLightbox) {
        handleLightboxNext();
      } else {
        handleNext();
      }
    }
    if (isRightSwipe) {
      if (isLightbox) {
        handleLightboxPrev();
      } else {
        handlePrev();
      }
    }
  };

  const handleNext = () => {
    if (images.length <= 1) return;
    setActiveImageIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrev = () => {
    if (images.length <= 1) return;
    setActiveImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleLightboxNext = () => {
    if (images.length <= 1) return;
    setLightboxIndex((prev) => (prev + 1) % images.length);
  };

  const handleLightboxPrev = () => {
    if (images.length <= 1) return;
    setLightboxIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  // 1. Fetch report details from Firestore with real-time updates
  useEffect(() => {
    if (!reportId) return;
    if (loadingUser) return; // Wait for authentication check
    if (!user) return; // Wait for user login

    setLoading(true);
    setErrorMsg(null);

    const docRef = doc(db, 'reports', reportId);
    const unsubscribe = onSnapshot(docRef, 
      (snapshot) => {
        if (snapshot.exists()) {
          setReport({
            id: snapshot.id,
            ...snapshot.data()
          } as Report);
        } else {
          setErrorMsg('This report could not be found or has been deleted.');
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching deep report in real-time:', err);
        setErrorMsg('Failed to load report from database.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [reportId, user, loadingUser]);

  // Scroll to Official Complaint panel if hash is #complaint
  useEffect(() => {
    if (report?.complaint && window.location.hash === '#complaint') {
      const timer = setTimeout(() => {
        const el = document.getElementById('official-complaint-panel');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [report]);

  // 2. Fetch all images lazily (subcollection & legacy fallbacks)
  useEffect(() => {
    if (!report) return;

    setLoadingImages(true);
    const imagesColl = collection(db, 'reports', report.id, 'images');
    const q = query(imagesColl, orderBy('order', 'asc'));

    getDocs(q)
      .then((snapshot) => {
        const loaded: { id: string; data: string; order: number; label?: string }[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          loaded.push({
            id: docSnap.id,
            data: d.data || '',
            order: d.order || 0
          });
        });

        // Query the new afterImages subcollection for multiple after proofs
        const afterColl = collection(db, 'reports', report.id, 'afterImages');
        const qAfter = query(afterColl, orderBy('order', 'asc'));

        getDocs(qAfter)
          .then((afterSnapshot) => {
            const afterLoaded: { id: string; data: string; order: number; label?: string }[] = [];
            afterSnapshot.forEach((docSnap) => {
              const d = docSnap.data();
              afterLoaded.push({
                id: docSnap.id,
                data: d.data || '',
                order: d.order || 0,
                label: `After Proof ${d.order + 1}`
              });
            });

            // Append each after proof
            afterLoaded.forEach((afterImg) => {
              loaded.push({
                id: afterImg.id,
                data: afterImg.data,
                order: 10000 + afterImg.order,
                label: afterImg.label
              });
            });

            // Fetch legacy if empty/fallback
            const docRef = doc(db, 'reportImages', report.id);
            getDoc(docRef)
              .then((snap) => {
                if (snap.exists()) {
                  const data = snap.data();
                  // If subcollection empty but legacy hasImage is true, add legacy before image
                  if (loaded.filter(x => x.order < 10000).length === 0 && data.imageData) {
                    loaded.push({
                      id: 'legacy-before',
                      data: data.imageData,
                      order: 0
                    });
                  }
                  // If after image exists, and we didn't load any from subcollection, append it as resolved proof
                  if (afterLoaded.length === 0 && data.afterImageData) {
                    loaded.push({
                      id: 'resolved-after-legacy',
                      data: data.afterImageData,
                      order: 9999,
                      label: 'Resolved Proof'
                    });
                  }
                }
                if (loaded.length === 0 && report.photoUrl && report.photoUrl !== 'placeholder') {
                  loaded.push({
                    id: 'fallback-photoUrl',
                    data: report.photoUrl,
                    order: 0
                  });
                }
                setImages(loaded);
              })
              .catch((err) => {
                console.warn('Error reading legacy reportImages doc:', err);
                if (loaded.length === 0 && report.photoUrl && report.photoUrl !== 'placeholder') {
                  loaded.push({
                    id: 'fallback-photoUrl',
                    data: report.photoUrl,
                    order: 0
                  });
                }
                setImages(loaded);
              });
          })
          .catch((err) => {
            console.warn('Error querying afterImages subcollection inside detail modal:', err);
            // Standard fallback to legacy doc
            const docRef = doc(db, 'reportImages', report.id);
            getDoc(docRef).then((snap) => {
              if (snap.exists()) {
                const data = snap.data();
                if (loaded.filter(x => x.order < 10000).length === 0 && data.imageData) {
                  loaded.push({ id: 'legacy-before', data: data.imageData, order: 0 });
                }
                if (data.afterImageData) {
                  loaded.push({ id: 'resolved-after-legacy', data: data.afterImageData, order: 9999, label: 'Resolved Proof' });
                }
              }
              if (loaded.length === 0 && report.photoUrl && report.photoUrl !== 'placeholder') {
                loaded.push({ id: 'fallback-photoUrl', data: report.photoUrl, order: 0 });
              }
              setImages(loaded);
            });
          });
      })
      .catch((err) => {
        console.error('Error fetching images subcollection:', err);
      })
      .finally(() => {
        setLoadingImages(false);
      });
  }, [report]);

  // Keyboard navigation listener for lightbox
  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleLightboxNext();
      if (e.key === 'ArrowLeft') handleLightboxPrev();
      if (e.key === 'Escape') setIsLightboxOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, images]);

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const origin = window.location.origin;
    const shareUrl = `${origin}/report/${reportId}`;
    
    const triggerCopied = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(shareUrl)
        .then(triggerCopied)
        .catch((err) => {
          console.error('Failed to copy share URL:', err);
          fallbackCopy(shareUrl, triggerCopied);
        });
    } else {
      fallbackCopy(shareUrl, triggerCopied);
    }
  };

  const fallbackCopy = (text: string, cb: () => void) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      cb();
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
  };

  if (loadingUser) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="rounded-2xl bg-white p-8 max-w-sm w-full text-center shadow-2xl flex flex-col items-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="mt-4 font-sans text-xs font-bold text-slate-500 uppercase tracking-wider">
            Verifying access...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="rounded-2xl bg-white p-6 max-w-sm w-full text-center shadow-2xl">
          <Lock className="h-8 w-8 text-indigo-600 mx-auto" />
          <h3 className="mt-3 font-sans text-sm font-black text-slate-950 uppercase">Access Required</h3>
          <p className="mt-2 font-sans text-xs text-slate-500 leading-relaxed">
            Please sign in with your Google account to view this public civic report.
          </p>
          <button
            onClick={() => signInWithGoogle().catch(err => console.error(err))}
            className="mt-5 w-full flex items-center justify-center space-x-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white py-2 font-sans text-xs font-bold transition-all cursor-pointer"
          >
            <span>Sign in with Google</span>
          </button>
          <button
            onClick={onClose}
            className="mt-2 w-full rounded-lg bg-slate-150 hover:bg-slate-200 text-slate-700 py-2 font-sans text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="rounded-2xl bg-white p-8 max-w-sm w-full text-center shadow-2xl flex flex-col items-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="mt-4 font-sans text-xs font-bold text-slate-500 uppercase tracking-wider">
            Loading issue details...
          </p>
        </div>
      </div>
    );
  }

  if (errorMsg || !report) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="rounded-2xl bg-white p-6 max-w-sm w-full text-center shadow-2xl">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <h3 className="mt-3 font-sans text-sm font-black text-slate-950 uppercase">Issue Not Found</h3>
          <p className="mt-2 font-sans text-xs text-slate-500 leading-relaxed">
            {errorMsg || 'The requested civic report is no longer available on public files.'}
          </p>
          <button
            onClick={onClose}
            className="mt-5 w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white py-2 font-sans text-xs font-bold transition-all cursor-pointer"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-50 border border-slate-100 shadow-2xl overflow-hidden my-4">
        
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-white sticky top-0 z-10 shadow-3xs">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center space-x-1.5 text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md uppercase tracking-wider select-none">
              <span>Civic Report</span>
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleShare}
              className={`inline-flex items-center space-x-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-200 shadow-3xs cursor-pointer ${
                copied 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="Copy link to clipboard"
            >
              <Share2 className={`h-3.5 w-3.5 ${copied ? 'text-emerald-600 animate-bounce' : ''}`} />
              <span>{copied ? 'Copied!' : 'Share Link'}</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Segment Body */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          
          {/* Swipeable Carousel Gallery */}
          {images.length > 0 && (
            <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-200 relative shadow-sm h-64 select-none group">
              {loadingImages ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                  <span className="text-[10px] mt-2 font-bold uppercase tracking-wider">Syncing photo proofs...</span>
                </div>
              ) : (
                <>
                  {/* Current Active Image */}
                  <div 
                    className="w-full h-full flex items-center justify-center cursor-pointer"
                    onClick={() => {
                      setLightboxIndex(activeImageIndex);
                      setIsLightboxOpen(true);
                    }}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={() => onTouchEnd(false)}
                  >
                    <img
                      src={images[activeImageIndex].data}
                      alt={`Hazard media proof ${activeImageIndex + 1}`}
                      className="w-full h-full object-contain img_no_referrer"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Header metadata pill */}
                  <span className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-xs text-[9px] font-black uppercase text-white px-2 py-1 rounded-md tracking-wider">
                    {images[activeImageIndex].label || `PROOF IMAGE ${activeImageIndex + 1} OF ${images.length}`}
                  </span>

                  {/* Navigation Arrows (Desktop overlay, hidden by default, visible on hover) */}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrev();
                        }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-all cursor-pointer opacity-0 group-hover:opacity-100 touch:opacity-100 z-10"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNext();
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-all cursor-pointer opacity-0 group-hover:opacity-100 touch:opacity-100 z-10"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </button>
                    </>
                  )}

                  {/* Dot Indicators */}
                  {images.length > 1 && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center space-x-1.5 z-10">
                      {images.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveImageIndex(idx);
                          }}
                          className={`h-2 w-2 rounded-full transition-all duration-200 cursor-pointer ${
                            idx === activeImageIndex ? 'bg-indigo-500 w-3' : 'bg-slate-400 hover:bg-white'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Swipeable Fullscreen Lightbox Modal */}
          {isLightboxOpen && images.length > 0 && (
            <div 
              className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md animate-fade-in"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={() => onTouchEnd(true)}
            >
              {/* Close Lightbox button */}
              <button
                onClick={() => setIsLightboxOpen(false)}
                className="absolute top-6 right-6 h-11 w-11 flex items-center justify-center rounded-full bg-slate-850 text-white hover:bg-slate-750 cursor-pointer z-[70] transition-transform hover:scale-105"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Lightbox center container */}
              <div className="relative w-full h-[80vh] flex items-center justify-center p-4">
                <img
                  src={images[lightboxIndex].data}
                  alt={`Proof full size ${lightboxIndex + 1}`}
                  className="max-w-full max-h-full object-contain select-none img_no_referrer"
                  referrerPolicy="no-referrer"
                />

                {/* Left/Right controls (desktop click targets) */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLightboxPrev();
                      }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center rounded-full bg-slate-900/60 text-white hover:bg-slate-900/80 transition-all cursor-pointer z-[70]"
                    >
                      <ChevronLeft className="h-7 w-7" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLightboxNext();
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center rounded-full bg-slate-900/60 text-white hover:bg-slate-900/80 transition-all cursor-pointer z-[70]"
                    >
                      <ChevronRight className="h-7 w-7" />
                    </button>
                  </>
                )}
              </div>

              {/* Header Label and counter inside lightbox */}
              <div className="text-center text-white mt-2 space-y-1 select-none">
                <p className="font-sans text-[11px] uppercase tracking-widest font-black text-indigo-400">
                  {images[lightboxIndex].label || `PROOF IMAGE ${lightboxIndex + 1} OF ${images.length}`}
                </p>
                <p className="font-sans text-xs text-slate-450">
                  Use arrow keys or swipe to navigate
                </p>
              </div>

              {/* Lightbox dot indicators */}
              {images.length > 1 && (
                <div className="flex items-center space-x-1.5 mt-4">
                  {images.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setLightboxIndex(idx)}
                      className={`h-2.5 w-2.5 rounded-full transition-all duration-200 cursor-pointer ${
                        idx === lightboxIndex ? 'bg-indigo-500 w-4' : 'bg-slate-600 hover:bg-white'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Authority Escalation Trail Panel */}
          {report && (report.status === 'Verified' || report.status === 'In Progress' || (report.authorityActions && report.authorityActions.length > 0)) && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-5 shadow-3xs antialiased text-left scroll-mt-6" id="official-complaint-panel">
              
              {/* Header */}
              <div className="flex items-center space-x-2 pb-2 border-b border-slate-200">
                <ShieldAlert className="h-5 w-5 text-indigo-600 shrink-0" />
                <h3 className="font-sans text-sm font-extrabold text-slate-800 uppercase tracking-tight">
                  Authority Escalation Trail
                </h3>
              </div>

              {/* Status and manual simulation controls */}
              {report.status !== 'Resolved' && (
                <div className="bg-white border border-slate-200/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Escalation Status</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                        {report.authorityActions && report.authorityActions.length > 0
                          ? `This issue is currently active in the escalation trail (Stage ${Math.max(...report.authorityActions.map(a => a.stage))}/3).`
                          : 'This verified issue is currently at its baseline level (Community Verified).'}
                      </p>
                    </div>
                    
                    {/* Badge */}
                    <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                      (() => {
                        const maxStage = report.authorityActions?.length ? Math.max(...report.authorityActions.map(a => a.stage)) : -1;
                        if (maxStage === 3) return 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse';
                        if (maxStage === 2) return 'bg-orange-50 border-orange-300 text-orange-700';
                        if (maxStage === 1) return 'bg-amber-50 border-amber-300 text-amber-700';
                        if (maxStage === 0) return 'bg-indigo-50 border-indigo-300 text-indigo-700';
                        return 'bg-emerald-50 border-emerald-300 text-emerald-800';
                      })()
                    }`}>
                      {(() => {
                        const maxStage = report.authorityActions?.length ? Math.max(...report.authorityActions.map(a => a.stage)) : -1;
                        if (maxStage === 3) return 'Stage 3: Final Escalation (Commissioner)';
                        if (maxStage === 2) return 'Stage 2: Second Escalation (DMC)';
                        if (maxStage === 1) return 'Stage 1: First Escalation (AMC)';
                        if (maxStage === 0) return 'Stage 0: Initial Complaint';
                        return 'Verified Baseline';
                      })()}
                    </span>
                  </div>

                  {/* Advance Escalation Simulation Button */}
                  <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-[10px] text-slate-400 font-medium space-y-1">
                      <p>Simulate a time delay and trigger immediate escalation to the next authority.</p>
                      <p className="text-indigo-600 font-semibold bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                        Production: auto-escalates after 7/14/30 days unresolved. Demo: advance manually.
                      </p>
                    </div>
                    {(() => {
                      const maxStage = report.authorityActions?.length ? Math.max(...report.authorityActions.map(a => a.stage)) : -1;
                      const isMaxReached = maxStage >= 3;
                      return (
                        <button
                          onClick={handleManualEscalate}
                          disabled={escalating || isMaxReached}
                          className="inline-flex items-center justify-center space-x-1.5 px-3 py-1.8 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-black shadow-3xs cursor-pointer active:scale-95 transition-all disabled:opacity-50 shrink-0"
                        >
                          {escalating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                          ) : (
                            <ShieldAlert className="h-3.5 w-3.5 text-current shrink-0" />
                          )}
                          <span>
                            {isMaxReached ? 'Maximum escalation reached' : `Advance Escalation to Stage ${maxStage + 1} (demo)`}
                          </span>
                        </button>
                      );
                    })()}
                  </div>

                  {escalationError && (
                    <p className="text-[10px] text-rose-600 font-semibold">{escalationError}</p>
                  )}
                </div>
              )}

              {/* Timeline of Authority Actions */}
              {report.authorityActions && report.authorityActions.length > 0 ? (
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Escalation Logs & Letters</h4>
                  
                  <div className="relative border-l border-slate-200 ml-3 pl-4 space-y-6 py-1">
                    {report.authorityActions.map((action, idx) => {
                      const isExpanded = expandedNoticeLevel === action.stage;
                      const actionDate = new Date(action.generatedAt);
                      
                      return (
                        <div key={idx} className="relative group">
                          {/* Circle marker */}
                          <span className={`absolute -left-[22.5px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border bg-white ${
                            action.stage === 3 
                              ? 'border-rose-400 text-rose-600' 
                              : action.stage === 2 
                              ? 'border-orange-400 text-orange-600' 
                              : action.stage === 1 
                              ? 'border-amber-400 text-amber-600'
                              : 'border-indigo-400 text-indigo-600'
                          }`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                          </span>

                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className={`text-[11px] font-bold ${
                                action.stage === 3 ? 'text-rose-700' : 
                                action.stage === 2 ? 'text-orange-700' : 
                                action.stage === 1 ? 'text-amber-700' : 'text-indigo-700'
                              }`}>
                                {action.stage === 0 ? 'STAGE 0: INITIAL COMPLAINT' : `STAGE ${action.stage}: ESCALATED`} to {action.authorityName}
                              </span>
                              <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-mono">
                                <span>Unresolved: {action.daysUnresolved} days</span>
                                <span>•</span>
                                <span>{actionDate.toLocaleDateString()}</span>
                              </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs space-y-3 text-xs">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <span className="font-extrabold text-slate-700 truncate max-w-[200px] sm:max-w-md">
                                  Subject: {action.subject}
                                </span>
                                <div className="flex items-center space-x-2 shrink-0">
                                  {action.stage === 0 && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-extrabold uppercase border ${
                                      action.dispatchStatus === 'Dispatched'
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : 'bg-amber-50 border-amber-200 text-amber-700'
                                    }`}>
                                      {action.dispatchStatus}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => setExpandedNoticeLevel(isExpanded ? null : action.stage)}
                                    className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 cursor-pointer transition-colors"
                                  >
                                    {isExpanded ? 'Collapse' : 'View Letter'}
                                  </button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="mt-2 pt-3 border-t border-slate-100 space-y-4">
                                  {/* Letter Body Mockup Sheet */}
                                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5 font-sans text-[11.5px] text-slate-700 whitespace-pre-wrap leading-relaxed select-text relative max-h-96 overflow-y-auto">
                                    <div className="text-right text-[9px] font-mono text-slate-400 mb-2 select-none">
                                      REF: {action.referenceId} | DATE: {actionDate.toLocaleDateString()}
                                    </div>
                                    <div className="font-bold mb-2">{action.authorityName}</div>
                                    <div className="font-black border-b border-slate-200 pb-1 mb-2">{action.subject}</div>
                                    <div>{action.body}</div>
                                  </div>

                                  {/* Actions: Copy & Download & Dispatch */}
                                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                    <div className="flex items-center space-x-2">
                                      <button
                                        onClick={() => handleCopyComplaint(action)}
                                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 cursor-pointer"
                                      >
                                        <Copy className="h-3 w-3 text-slate-500" />
                                        <span>Copy Letter</span>
                                      </button>
                                      <button
                                        onClick={() => downloadTxtFile(action)}
                                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 cursor-pointer"
                                      >
                                        <Download className="h-3 w-3 text-slate-500" />
                                        <span>Download</span>
                                      </button>
                                    </div>

                                    {action.stage === 0 && action.dispatchStatus !== 'Dispatched' && (
                                      <button
                                        onClick={handleMarkDispatched}
                                        disabled={markingDispatched}
                                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                                      >
                                        {markingDispatched ? (
                                          <Loader2 className="h-3 w-3 animate-spin text-white" />
                                        ) : (
                                          <CheckSquare className="h-3 w-3 text-emerald-400" />
                                        )}
                                        <span>Mark as Dispatched</span>
                                      </button>
                                    )}

                                    {action.stage === 0 && action.dispatchStatus === 'Dispatched' && (
                                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                        Dispatched on {action.dispatchedAt ? new Date(action.dispatchedAt).toLocaleDateString() : actionDate.toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-100/50 border border-slate-200/50 rounded-xl p-4 text-center select-none">
                  <p className="text-[11px] text-slate-400 font-medium">
                    No action steps have been created in this escalation trail yet. Verified reports automatically start at Stage 0 (Initial Complaint).
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Core Embedded Card displaying interactions thread seamlessly */}
          <div className="bg-white rounded-2xl shadow-3xs border border-slate-150 p-2 sm:p-1.5">
            <ReportCard
              report={report}
              user={user}
              currentUserDoc={currentUserDoc}
              onDeleted={() => {
                onDeleted?.();
                onClose();
              }}
              onUserClick={onUserClick}
            />
          </div>

        </div>
      </div>
      {copied && (
        <div className="fixed bottom-6 right-6 z-55 flex items-center space-x-2 bg-slate-900/90 text-white px-4 py-2.5 rounded-xl shadow-xl font-sans text-xs font-bold animate-pulse">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>Link copied to clipboard!</span>
        </div>
      )}
      {copiedComplaint && (
        <div className="fixed bottom-6 right-6 z-55 flex items-center space-x-2 bg-slate-900/90 text-white px-4 py-2.5 rounded-xl shadow-xl font-sans text-xs font-bold animate-pulse">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>Complaint letter copied to clipboard!</span>
        </div>
      )}
    </div>
  );
}
