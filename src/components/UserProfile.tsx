import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, orderBy, getDocs, limit, deleteDoc, runTransaction } from 'firebase/firestore';
import { db, logOut, handleFirestoreError, OperationType } from '../lib/firebase';
import { Report, UserDoc, getUserLevel } from '../types';
import { User } from 'firebase/auth';
import { 
  ArrowLeft, 
  Award, 
  Calendar, 
  CheckCircle2, 
  FileText, 
  MessageSquare, 
  ThumbsUp, 
  Mail, 
  ShieldCheck, 
  Clock,
  Sparkles,
  MapPin,
  HelpCircle,
  TrendingUp,
  Settings,
  Trash2,
  Lock
} from 'lucide-react';
import * as Lucide from 'lucide-react';
import { BADGES_CATALOG, BADGE_FAMILIES, evaluateAndAwardBadges } from '../lib/badgeService';

interface UserProfileProps {
  uid: string;
  currentUser: User | null;
  onClose: () => void;
  onSelectReport: (id: string) => void;
  allReports: Report[];
}

interface ActivityItem {
  id: string;
  type: 'report' | 'verification' | 'comment';
  title: string;
  subtitle: string;
  timestamp: any;
  reportId: string;
}

export function getUserLevelBadge(points: number): { name: string; style: string; iconStyle: string } {
  return getUserLevel(points);
}

const safeTimestampToDate = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000);
  }
  const parsed = Date.parse(String(timestamp));
  return isNaN(parsed) ? new Date() : new Date(parsed);
};

export default function UserProfile({ uid, currentUser, onClose, onSelectReport, allReports }: UserProfileProps) {
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'activity' | 'badges'>('posts');
  const [badgeFilter, setBadgeFilter] = useState<string>('all');
  const [userReports, setUserReports] = useState<Report[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Deletion state variables
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const isOwnProfile = currentUser?.uid === uid;

  const handleDeleteAccount = async () => {
    if (!isOwnProfile || !uid) return;
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      console.log("[DeleteAccount] Starting account deletion process for user:", uid);

      // 1. Delete user's own reports (and their nested subcollections and top-level reportImages)
      const ownedReports = allReports.filter((r) => r.createdBy === uid);
      for (const r of ownedReports) {
        const reportId = r.id;
        if (!reportId) continue;

        // Delete nested subcollections
        const subcollections = ['comments', 'verifications', 'flags', 'images', 'afterImages'];
        for (const sub of subcollections) {
          const subColRef = collection(db, 'reports', reportId, sub);
          let subSnap;
          try {
            subSnap = await getDocs(subColRef);
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, `reports/${reportId}/${sub}`);
            return; // flow guard
          }
          for (const docSnap of subSnap.docs) {
            try {
              await deleteDoc(docSnap.ref);
            } catch (e) {
              handleFirestoreError(e, OperationType.DELETE, `reports/${reportId}/${sub}/${docSnap.id}`);
              return; // flow guard
            }
          }
        }

        // Delete top-level reportImages document
        try {
          await deleteDoc(doc(db, 'reportImages', reportId));
        } catch (e) {
          console.warn("[DeleteAccount] error deleting reportImages for", reportId, e);
        }

        // Delete the report document itself
        try {
          await deleteDoc(doc(db, 'reports', reportId));
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, `reports/${reportId}`);
          return; // flow guard
        }
        console.log("[DeleteAccount] deleted report & subcollections for:", reportId);
      }

      // 2. Remove the user's verifications from other reports (decrementing those counts and adjusting creator points)
      const otherReports = allReports.filter((r) => r.createdBy !== uid);
      for (const r of otherReports) {
        const reportId = r.id;
        if (!reportId) continue;

        const verificationRef = doc(db, 'reports', reportId, 'verifications', uid);
        const verificationSnapRef = collection(db, 'reports', reportId, 'verifications');
        let verificationSnap;
        try {
          verificationSnap = await getDocs(verificationSnapRef);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, `reports/${reportId}/verifications`);
          return; // flow guard
        }
        const userVerDoc = verificationSnap.docs.find(d => d.id === uid);

        if (userVerDoc) {
          console.log("[DeleteAccount] User had verified report:", reportId, "removing verification...");
          
          try {
            await runTransaction(db, async (transaction) => {
              const reportRef = doc(db, 'reports', reportId);
              const reportSnap = await transaction.get(reportRef);
              if (reportSnap.exists()) {
                const rData = reportSnap.data();
                const currentCount = rData.verificationCount || 0;
                const nextCount = Math.max(0, currentCount - 1);
                const oldStatus = rData.status || 'Reported';
                const oldFlags = rData.flagCount || 0;
                let newStatus = oldStatus;

                // Compute new status if verification count falls below 3
                if (nextCount < 3) {
                  if (oldStatus === 'Reported' || oldStatus === 'Verified' || oldStatus === 'Under Review') {
                    if (oldFlags >= 3) {
                      newStatus = 'Under Review';
                    } else {
                      newStatus = 'Reported';
                    }
                  }
                }

                // Symmetrical points adjustment for the report creator
                let reporterPointsChange = -2; // Verification withdrawn
                if (oldStatus === 'Verified' && newStatus !== 'Verified') {
                  reporterPointsChange -= 10; // Report no longer verified
                }

                transaction.delete(verificationRef);
                transaction.update(reportRef, {
                  verificationCount: nextCount,
                  status: newStatus,
                  underReview: newStatus === 'Under Review'
                });

                // Adjust reporter's impact points
                const creatorId = rData.createdBy;
                if (creatorId) {
                  const creatorRef = doc(db, 'users', creatorId);
                  const creatorSnap = await transaction.get(creatorRef);
                  if (creatorSnap.exists()) {
                    const currentPoints = creatorSnap.data().impactPoints || 0;
                    transaction.update(creatorRef, {
                      impactPoints: Math.max(0, currentPoints + reporterPointsChange)
                    });
                  }
                }
              }
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `reports/${reportId}/verifications-transaction`);
            return; // flow guard
          }
        }
      }

      // 3. Delete user's comments from other reports (decrementing commentCount)
      for (const r of otherReports) {
        const reportId = r.id;
        if (!reportId) continue;

        const commentsCol = collection(db, 'reports', reportId, 'comments');
        let commentsSnap;
        try {
          commentsSnap = await getDocs(commentsCol);
        } catch (e) {
          handleFirestoreError(e, OperationType.GET, `reports/${reportId}/comments`);
          return; // flow guard
        }
        let userCommentsCount = 0;

        for (const cDoc of commentsSnap.docs) {
          const cData = cDoc.data();
          if (cData.authorId === uid || cData.authorUid === uid) {
            try {
              await deleteDoc(cDoc.ref);
            } catch (e) {
              handleFirestoreError(e, OperationType.DELETE, `reports/${reportId}/comments/${cDoc.id}`);
              return; // flow guard
            }
            userCommentsCount++;
          }
        }

        if (userCommentsCount > 0) {
          console.log(`[DeleteAccount] Deleted ${userCommentsCount} comments on report: ${reportId}`);
          try {
            await runTransaction(db, async (transaction) => {
              const reportRef = doc(db, 'reports', reportId);
              const reportSnap = await transaction.get(reportRef);
              if (reportSnap.exists()) {
                const currentCommentCount = reportSnap.data().commentCount || 0;
                transaction.update(reportRef, {
                  commentCount: Math.max(0, currentCommentCount - userCommentsCount)
                });
              }
            });
          } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `reports/${reportId}/commentCount-transaction`);
            return; // flow guard
          }
        }
      }

      // 4. Delete user document users/{uid}
      try {
        await deleteDoc(doc(db, 'users', uid));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `users/${uid}`);
        return; // flow guard
      }
      console.log("[DeleteAccount] Deleted user document in users collection:", uid);

      // 5. Sign out
      await logOut();
      console.log("[DeleteAccount] Signed user out successfully");
      onClose();
    } catch (err: any) {
      console.error("[DeleteAccount] Error during account deletion:", err);
      setDeleteAccountError(err.message || String(err));
      setDeletingAccount(false);
    }
  };

  // 1. Fetch User Doc in Real-Time
  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const userRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setProfile(snapshot.data() as UserDoc);
        } else {
          // If no doc exists yet, generate fallback matching standard format
          setProfile({
            uid,
            displayName: 'Active Resident',
            photoURL: '',
            impactPoints: 0,
            reportsCount: 0,
            verificationsGiven: 0,
            joinedAt: { seconds: Date.now() / 1000, nanoseconds: 0 } as any
          });
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to user profile:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [uid]);

  // Recalculate own badges when user views their profile
  useEffect(() => {
    if (isOwnProfile && uid) {
      evaluateAndAwardBadges(uid).catch((err) => {
        console.warn('[UserProfile] Failed to run initial badge evaluation:', err);
      });
    }
  }, [uid, isOwnProfile]);

  // 2. Filter User's own Reports
  useEffect(() => {
    const owned = allReports.filter((r) => r.createdBy === uid);
    setUserReports(owned);
  }, [allReports, uid]);

  // 3. Compile Recent Activity Feed (Reports, Comments, Verifications)
  useEffect(() => {
    if (!uid) return;
    setLoadingActivity(true);

    const loadActivities = async () => {
      const compiled: ActivityItem[] = [];

      // 1) Add user's reports to activity list
      const ownedReports = allReports.filter((r) => r.createdBy === uid);
      ownedReports.forEach((r) => {
        compiled.push({
          id: `report-${r.id}`,
          type: 'report',
          title: 'Filed a new civic report',
          subtitle: r.title,
          timestamp: r.createdAt,
          reportId: r.id
        });
      });

      // 2) Load comments by user with fallback scan
      try {
        // Try collectionGroup first
        const commentsColGroup = collection(db, 'reports');
        // Because collectionGroup requires manual indices that might not be ready,
        // we can fetch user comments for the active reports in our state
        const commentPromises = ownedReports.map(async (r) => {
          // For owner's own reports, we might check comments
        });

        // Scan reports to gather comments left by this profile user (deep lookup)
        const scanPromises = allReports.map(async (r) => {
          const commentsColl = collection(db, 'reports', r.id, 'comments');
          // Fetch comments
          const snap = await getDocs(query(commentsColl, limit(20)));
          snap.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.authorId === uid || data.authorUid === uid) {
              compiled.push({
                id: `comment-${docSnap.id}`,
                type: 'comment',
                title: 'Commented on an issue',
                subtitle: `"${data.text.length > 60 ? data.text.substring(0, 60) + '...' : data.text}" on ${r.title}`,
                timestamp: data.createdAt,
                reportId: r.id
              });
            }
          });
        });

        await Promise.all(scanPromises.slice(0, 15)); // Limit scan for fast load
      } catch (err) {
        console.warn('Comments scan minor warning:', err);
      }

      // 3) Load verifications by user with fallback scan
      try {
        const verifyPromises = allReports.map(async (r) => {
          const vRef = doc(db, 'reports', r.id, 'verifications', uid);
          const vSnap = await getDocs(query(collection(db, 'reports', r.id, 'verifications'), limit(10)));
          vSnap.forEach((vDoc) => {
            if (vDoc.id === uid) {
              const data = vDoc.data();
              compiled.push({
                id: `verify-${r.id}-${uid}`,
                type: 'verification',
                title: 'Verified and upvoted a report',
                subtitle: r.title,
                timestamp: data.verifiedAt || r.createdAt,
                reportId: r.id
              });
            }
          });
        });

        await Promise.all(verifyPromises.slice(0, 20));
      } catch (err) {
        console.warn('Verifications scan minor warning:', err);
      }

      // Sort combined activity newest first
      compiled.sort((a, b) => {
        const timeA = safeTimestampToDate(a.timestamp).getTime();
        const timeB = safeTimestampToDate(b.timestamp).getTime();
        return timeB - timeA;
      });

      // Deduplicate by ID
      const seen = new Set<string>();
      const uniq = compiled.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

      setRecentActivity(uniq.slice(0, 15)); // Limit to most recent 15 activities
      setLoadingActivity(false);
    };

    loadActivities();
  }, [uid, allReports]);

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
        <p className="font-sans text-[11px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">
          Fetching Resident Profile...
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-3xs max-w-xl mx-auto">
        <HelpCircle className="h-8 w-8 text-slate-350 mx-auto" />
        <h3 className="mt-4 font-sans text-xs font-bold text-slate-900 uppercase">Profile Not Found</h3>
        <p className="mt-2 font-sans text-[11px] text-slate-450 leading-relaxed">
          The requested resident profile cannot be retrieved or is unlisted.
        </p>
        <button
          onClick={onClose}
          className="mt-6 inline-flex items-center space-x-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 font-sans text-xs font-bold shadow-sm transition-all"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Feed</span>
        </button>
      </div>
    );
  }

  const badgeInfo = getUserLevel(profile.impactPoints || 0);
  const resolvedCount = userReports.filter((r) => r.status === 'Resolved').length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* Back to feed ribbon */}
      <div className="flex items-center justify-between relative">
        <button
          onClick={onClose}
          className="inline-flex items-center space-x-2 text-slate-500 hover:text-indigo-600 transition-colors text-xs font-bold cursor-pointer bg-white px-3.5 py-1.8 rounded-xl border border-slate-150 shadow-3xs"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Feed</span>
        </button>

        {isOwnProfile && (
          <div className="relative">
            <button
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              className="inline-flex items-center space-x-1.5 text-slate-500 hover:text-indigo-600 transition-colors text-xs font-bold cursor-pointer bg-white px-3.5 py-1.8 rounded-xl border border-slate-150 shadow-3xs"
            >
              <Settings className="h-4 w-4 text-slate-450" />
              <span>Settings</span>
            </button>

            {showSettingsMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-150 rounded-xl shadow-md py-1.5 z-50">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(true);
                    setShowSettingsMenu(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center space-x-2"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete my account</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Account Deletion Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-150 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="bg-rose-50 p-2.5 rounded-full border border-rose-100">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="font-sans text-base font-black tracking-tight text-slate-900">
                Delete Account?
              </h3>
            </div>

            <p className="font-sans text-xs text-slate-650 leading-relaxed">
              This permanently deletes your account, your reports, comments, and verifications. This cannot be undone.
            </p>

            {deleteAccountError && (
              <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-150 font-medium">
                {deleteAccountError}
              </p>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                disabled={deletingAccount}
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteAccountError(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={deletingAccount}
                onClick={handleDeleteAccount}
                className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-xs transition-all disabled:opacity-50 inline-flex items-center space-x-2"
              >
                {deletingAccount ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete permanently</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Header Hero Card */}
      <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-3xs relative overflow-hidden">
        
        {/* Subtle decorative vector background element */}
        <div className="absolute right-0 top-0 h-48 w-48 bg-gradient-to-bl from-indigo-50/40 via-transparent to-transparent rounded-full -translate-y-8 translate-x-8 pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          
          <div className="flex items-center space-x-4.5">
            {/* User Avatar */}
            {profile.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                className="h-20 w-20 rounded-full border-2 border-slate-150 object-cover shrink-0 shadow-sm img_no_referrer"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-indigo-100 text-indigo-700 border-2 border-indigo-200 font-extrabold text-2xl flex items-center justify-center shrink-0 uppercase shadow-xs">
                {profile.displayName ? profile.displayName[0] : 'U'}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-sans text-xl font-black text-slate-900 tracking-tight leading-none">
                  {profile.displayName}
                </h1>
                
                {/* Level Badge Badge */}
                <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.8 rounded-full text-[10px] uppercase tracking-wider shadow-2xs select-none ${badgeInfo.style}`}>
                  <ShieldCheck className={`h-3.5 w-3.5 ${badgeInfo.iconStyle}`} />
                  <span>{badgeInfo.name}</span>
                </span>
              </div>

              {/* Email displaying (Strictly OWNER checks) */}
              {isOwnProfile && profile.email && (
                <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-sans">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-medium bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md text-[11px]">{profile.email}</span>
                  <span className="text-[9.5px] font-bold text-indigo-600 bg-indigo-50/50 px-1.5 py-0.2 rounded uppercase scale-90">Your private contact</span>
                </div>
              )}

              {/* Joined Date */}
              <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-sans">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>Resident since: {safeTimestampToDate(profile.joinedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
            </div>
          </div>

          {/* Impact points container */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4.5 text-center shrink-0 min-w-[140px] shadow-3xs">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
              Impact Score
            </span>
            <div className="flex items-center justify-center space-x-1.5">
              <Award className="h-5.5 w-5.5 text-amber-500 shrink-0" />
              <span className="font-mono text-2xl font-black text-slate-850 leading-none">
                {profile.impactPoints || 0}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1 font-sans">
              Points earned
            </span>
          </div>

        </div>

        {/* Counts statistics row */}
        <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-3 gap-4.5 text-center">
          <div className="space-y-1">
            <span className="block font-mono text-lg font-black text-slate-850">
              {profile.reportsCount || userReports.length}
            </span>
            <span className="block font-sans text-[10px] font-bold text-slate-450 uppercase tracking-wider flex items-center justify-center space-x-1">
              <FileText className="h-3.5 w-3.5 text-indigo-500" />
              <span>Reports Filed</span>
            </span>
          </div>

          <div className="space-y-1 border-x border-slate-100">
            <span className="block font-mono text-lg font-black text-slate-850">
              {profile.verificationsGiven || 0}
            </span>
            <span className="block font-sans text-[10px] font-bold text-slate-450 uppercase tracking-wider flex items-center justify-center space-x-1">
              <ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />
              <span>Votes Given</span>
            </span>
          </div>

          <div className="space-y-1">
            <span className="block font-mono text-lg font-black text-slate-850">
              {resolvedCount}
            </span>
            <span className="block font-sans text-[10px] font-bold text-slate-450 uppercase tracking-wider flex items-center justify-center space-x-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-purple-500" />
              <span>Issues Solved</span>
            </span>
          </div>
        </div>

      </div>

      {/* Tabs navigation panel */}
      <div className="border-b border-slate-200 flex space-x-6">
        <button
          onClick={() => setActiveTab('posts')}
          className={`pb-3 font-sans text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === 'posts'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Posts ({userReports.length})
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`pb-3 font-sans text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === 'activity'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Recent Activity
        </button>
        <button
          onClick={() => setActiveTab('badges')}
          className={`pb-3 font-sans text-xs font-bold uppercase tracking-wider cursor-pointer border-b-2 transition-all flex items-center space-x-1.5 ${
            activeTab === 'badges'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Award className="h-4 w-4" />
          <span>Achievements ({Object.keys(profile?.earnedBadges || {}).length})</span>
        </button>
      </div>

      {/* Active Tab Panel render */}
      <div>
        
        {activeTab === 'posts' ? (
          
          userReports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center p-6 shadow-3xs">
              <FileText className="h-8 w-8 text-slate-300 mx-auto" />
              <h3 className="mt-3.5 font-sans text-xs font-bold text-slate-900 uppercase">
                No reports submitted yet
              </h3>
              <p className="mt-1.5 max-w-sm font-sans text-[11px] text-slate-450 leading-relaxed mx-auto">
                All community issue reports posted by this resident will list here.
              </p>
            </div>
          ) : (
            <div className="grid gap-4.5">
              {userReports.map((report) => (
                <div 
                  key={report.id} 
                  onClick={() => onSelectReport(report.id)}
                  className="bg-white border border-slate-150 p-4 rounded-xl hover:shadow-xs hover:border-indigo-200 transition-all cursor-pointer flex justify-between gap-4 items-center group"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center text-[9px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                        {report.department}
                      </span>
                      {report.subcategory && (
                        <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-100">
                          {report.subcategory}
                        </span>
                      )}
                      <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                        report.status === 'Resolved' 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : report.status === 'In Progress' 
                          ? 'bg-indigo-50 text-indigo-700' 
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {report.status}
                      </span>
                    </div>

                    <h3 className="font-sans text-xs sm:text-sm font-black text-slate-850 group-hover:text-indigo-600 transition-colors truncate">
                      {report.title}
                    </h3>

                    <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 font-sans">
                      <MapPin className="h-3 w-3 text-slate-350 shrink-0" />
                      <span className="truncate">{report.locationText}</span>
                    </div>
                  </div>

                  {/* Tiny Thumbnail */}
                  {report.photoUrl && report.photoUrl !== 'placeholder' && (
                    <img
                      src={report.photoUrl}
                      alt={report.title}
                      className="h-12 w-12 rounded-lg object-cover border border-slate-150 shrink-0 img_no_referrer"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
              ))}
            </div>
          )

        ) : activeTab === 'activity' ? (
          
          /* Recent Activity list */
          loadingActivity ? (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"></div>
              <p className="mt-2 text-[11px] text-slate-400">Reconstructing activities...</p>
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center p-6 shadow-3xs">
              <Clock className="h-8 w-8 text-slate-300 mx-auto" />
              <h3 className="mt-3.5 font-sans text-xs font-bold text-slate-900 uppercase">
                No recent activity recorded
              </h3>
              <p className="mt-1.5 max-w-sm font-sans text-[11px] text-slate-450 leading-relaxed mx-auto">
                Filing reports, verification votes, and comment discussions will populate this live timeline!
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-3xs space-y-6">
              <div className="flow-root">
                <ul role="list" className="-mb-8">
                  {recentActivity.map((act, actIdx) => {
                    const activityIcon = () => {
                      if (act.type === 'report') return <FileText className="h-4 w-4 text-indigo-600" />;
                      if (act.type === 'comment') return <MessageSquare className="h-4 w-4 text-purple-600" />;
                      return <ThumbsUp className="h-4 w-4 text-emerald-600" />;
                    };

                    const bgIconColor = () => {
                      if (act.type === 'report') return 'bg-indigo-50 border-indigo-100';
                      if (act.type === 'comment') return 'bg-purple-50 border-purple-100';
                      return 'bg-emerald-50 border-emerald-100';
                    };

                    return (
                      <li key={act.id}>
                        <div className="relative pb-8">
                          {actIdx !== recentActivity.length - 1 ? (
                            <span className="absolute left-4.5 top-4.5 -ml-px h-full w-0.5 bg-slate-100" aria-hidden="true" />
                          ) : null}
                          <div className="relative flex space-x-3.5">
                            <div>
                              <span className={`h-9 w-9 flex items-center justify-center rounded-full border shadow-3xs ${bgIconColor()}`}>
                                {activityIcon()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0 pt-1.5">
                              <div className="flex items-center justify-between space-x-4">
                                <div className="text-xs">
                                  <span className="font-sans font-bold text-slate-850">
                                    {act.type === 'report' ? 'Submitted a hazard report' : act.type === 'comment' ? 'Commented' : 'Upvoted and verified'}
                                  </span>{' '}
                                  <span className="text-slate-400">on</span>{' '}
                                  <button
                                    onClick={() => onSelectReport(act.reportId)}
                                    className="font-sans font-extrabold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer transition-colors text-left"
                                  >
                                    {act.subtitle}
                                  </button>
                                </div>
                                <div className="text-right text-[10px] whitespace-nowrap text-slate-400 font-sans">
                                  {safeTimestampToDate(act.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )

        ) : (
          /* Achievements tab panel content */
          <div className="space-y-6">
            {/* 1. Progress banner */}
            <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5 shadow-3xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-sans text-xs font-black text-slate-800 uppercase tracking-tight">
                    Civic Achievements Progress
                  </h4>
                  <p className="font-sans text-[11px] text-slate-500 mt-0.5 leading-normal">
                    Complete civic activities to unlock official resident badges and grow your reputation!
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-xl font-black text-slate-850">
                    {Object.keys(profile.earnedBadges || {}).length}
                  </span>
                  <span className="font-sans text-slate-400 text-[11px] font-bold"> / {BADGES_CATALOG.length} Earned</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4 w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full rounded-full transition-all duration-500 animate-pulse"
                  style={{ width: `${Math.max(2, Math.min(100, Math.round((Object.keys(profile.earnedBadges || {}).length / BADGES_CATALOG.length) * 100)))}%` }}
                />
              </div>
            </div>

            {/* 2. Category selection pills */}
            <div className="flex flex-wrap gap-1.8 items-center bg-white p-2 rounded-xl border border-slate-150">
              <button
                onClick={() => setBadgeFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-sans text-[10px] font-bold uppercase tracking-tight transition-colors cursor-pointer ${
                  badgeFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-3xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                All Families
              </button>
              {Object.entries(BADGE_FAMILIES).map(([famId, fam]) => (
                <button
                  key={famId}
                  onClick={() => setBadgeFilter(famId)}
                  className={`px-3 py-1.5 rounded-lg font-sans text-[10px] font-bold uppercase tracking-tight transition-all border cursor-pointer ${
                    badgeFilter === famId
                      ? `${fam.bg} ${fam.text} ${fam.border} font-black shadow-3xs`
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {fam.label}
                </button>
              ))}
            </div>

            {/* 3. Badge Grid list */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {BADGES_CATALOG
                .filter(b => badgeFilter === 'all' || b.family === badgeFilter)
                .map((badge) => {
                  const isEarned = profile.earnedBadges && !!profile.earnedBadges[badge.id];
                  const earnedAtVal = isEarned ? profile.earnedBadges[badge.id] : null;
                  const familyInfo = BADGE_FAMILIES[badge.family] || BADGE_FAMILIES.reporting;

                  // Render dynamic icon component safely
                  const IconComp = (Lucide as any)[badge.icon] || Lucide.Award;

                  return (
                    <div 
                      key={badge.id}
                      className={`rounded-xl border p-4 flex items-start space-x-3.5 transition-all shadow-3xs ${
                        isEarned 
                          ? 'bg-white border-slate-150 hover:shadow-xs' 
                          : 'bg-slate-50/50 border-slate-200/60 opacity-60'
                      }`}
                    >
                      {/* Medallion icon */}
                      <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 shadow-3xs border ${
                        isEarned 
                          ? `${badge.colorClass || familyInfo.bg} ${familyInfo.border}` 
                          : 'bg-slate-100 border-slate-200 text-slate-350'
                      }`}>
                        {isEarned ? (
                          <IconComp className="h-5.5 w-5.5" />
                        ) : (
                          <Lock className="h-4.5 w-4.5 text-slate-400" />
                        )}
                      </div>

                      {/* Badge Metadata */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className={`font-sans text-xs font-extrabold truncate ${isEarned ? 'text-slate-950' : 'text-slate-400'}`}>
                            {badge.name}
                          </h5>
                          {isEarned && (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[8.5px] font-black text-emerald-700 uppercase tracking-tight border border-emerald-100 select-none">
                              Unlocked
                            </span>
                          )}
                        </div>

                        <p className={`font-sans text-[11.5px] leading-relaxed ${isEarned ? 'text-slate-600' : 'text-slate-400 font-medium'}`}>
                          {isEarned ? badge.description : badge.criteriaDescription}
                        </p>

                        <div className="pt-1.5 flex flex-wrap items-center gap-1.5 font-sans text-[8.5px] font-black uppercase">
                          <span className={`px-1.5 py-0.2 rounded border ${familyInfo.bg} ${familyInfo.text} ${familyInfo.border}`}>
                            {familyInfo.label}
                          </span>
                          {isEarned && earnedAtVal && (
                            <span className="text-slate-400 font-mono font-medium normal-case">
                              unlocked {safeTimestampToDate(earnedAtVal).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
