import React, { useState } from 'react';
import { 
  User, 
  LogOut, 
  ShieldCheck, 
  LogIn, 
  Sparkles, 
  X, 
  Mail, 
  FileText, 
  Calendar, 
  Clock, 
  ThumbsUp, 
  Search, 
  Plus, 
  Award 
} from 'lucide-react';
import { useId as useIdReact } from 'react';
import { signInWithGoogle, logOut } from '../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { Report, UserDoc, getUserLevel } from '../types';
import NotificationBell from './NotificationBell';

interface HeaderProps {
  user: FirebaseUser | null;
  loading: boolean;
  currentUserDoc: UserDoc | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortTab: 'Hot' | 'New' | 'Urgent' | 'Under Review';
  setSortTab: (tab: 'Hot' | 'New' | 'Urgent' | 'Under Review') => void;
  onPlusReportClick?: () => void;
  reports?: Report[];
  onUserClick?: (uid: string) => void;
  onImpactPillClick?: () => void;
  currentView?: 'feed' | 'dashboard';
  onViewChange?: (view: 'feed' | 'dashboard') => void;
  onSelectReport?: (reportId: string) => void;
}

export default function Header({ 
  user, 
  loading, 
  currentUserDoc, 
  searchQuery, 
  setSearchQuery, 
  sortTab, 
  setSortTab, 
  onPlusReportClick,
  reports = [],
  onUserClick,
  onImpactPillClick,
  currentView = 'feed',
  onViewChange,
  onSelectReport
}: HeaderProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const headerId = useIdReact();

  // Authentication Flow Handlers
  const handleSignIn = async () => {
    setSigningIn(true);
    setErrorMsg(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google Sign-in failed in Header:', err);
      setErrorMsg(err.message || 'Verification of Google flow failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logOut();
      setDrawerOpen(false);
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  // Filter real-time reports submitted by the current user
  const myReports = user ? reports.filter(r => r.createdBy === user.uid) : [];
  const resolvedCount = myReports.filter(r => r.status === 'Resolved').length;
  const activeCount = myReports.length - resolvedCount;

  const tabs: ('Hot' | 'New' | 'Urgent' | 'Under Review')[] = ['Hot', 'New', 'Urgent', 'Under Review'];

  return (
    <header id={headerId} className="sticky top-0 z-40 w-full h-[46px] border-b border-slate-200 bg-white shadow-3xs flex items-center">
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        
        {/* ======================================= */}
        {/* LEFT BRAND ZONE                         */}
        {/* ======================================= */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <button 
            onClick={() => onViewChange?.('feed')} 
            className="flex items-center space-x-2 text-left cursor-pointer hover:opacity-90 transition-opacity"
            title="Go to Stream Feed"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <ShieldCheck className="h-4.5 w-4.5" />
            </div>
            <span className="hidden sm:inline font-sans text-xs font-black tracking-tight text-slate-850 uppercase">
              Community Hero
            </span>
          </button>

          {user && (
            <div className="flex items-center border-l border-slate-200 pl-3.5 space-x-2">
              <button
                onClick={() => onViewChange?.('feed')}
                className={`px-3 py-1 rounded-full font-sans text-[11px] font-bold transition-all cursor-pointer ${
                  currentView === 'feed'
                    ? 'bg-indigo-50 text-indigo-700 font-extrabold shadow-3xs'
                    : 'text-slate-500 hover:text-slate-850 hover:bg-slate-50'
                }`}
              >
                Feed
              </button>
              <button
                onClick={() => onViewChange?.('dashboard')}
                className={`px-3 py-1 rounded-full font-sans text-[11px] font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                  currentView === 'dashboard'
                    ? 'bg-indigo-50 text-indigo-700 font-extrabold shadow-3xs'
                    : 'text-slate-500 hover:text-slate-850 hover:bg-slate-50'
                }`}
              >
                <Sparkles className="h-3 w-3 text-indigo-500 animate-pulse" />
                <span>Dashboard</span>
              </button>
            </div>
          )}
        </div>

        {/* ======================================= */}
        {/* CENTER FILTER/SEARCH PLAYS              */}
        {/* ======================================= */}
        <div className="flex-1 max-w-xl mx-4 flex items-center space-x-2 sm:space-x-3.5">
          {user && (
            <>
              {currentView === 'feed' ? (
                <>
                  {/* Pill-shaped search input */}
                  <div className="relative flex-1 hidden md:block">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Query hazards or locations..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-7 rounded-full border border-slate-200 bg-slate-50/50 pl-8 pr-3 font-sans text-[11px] text-slate-800 focus:bg-white focus:border-indigo-500 outline-hidden transition-colors"
                    />
                  </div>

                  {/* Four Sort Tabs */}
                  <div className="flex items-center bg-slate-50 border border-slate-100 p-0.5 rounded-full h-7">
                    {tabs.map(tab => (
                      <button
                        key={tab}
                        onClick={() => setSortTab(tab)}
                        className={`px-3 h-full rounded-full font-sans text-[10px] font-bold tracking-tight transition-colors cursor-pointer ${
                          sortTab === tab
                            ? 'bg-indigo-50 text-indigo-700 font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="hidden sm:flex items-center space-x-1.5 text-slate-500 font-sans text-[10.5px]">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />
                  <span className="font-bold text-slate-700">Civic Intelligence Briefing Room</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ======================================= */}
        {/* RIGHT METRICS & REPORT INVOKER BUTTON   */}
        {/* ======================================= */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          {errorMsg && (
            <span className="hidden lg:inline text-red-500 text-[10px] font-medium max-w-xs truncate">
              {errorMsg}
            </span>
          )}

          {loading ? (
            <div className="h-6 w-16 animate-pulse rounded bg-slate-50"></div>
          ) : user ? (
            <div className="flex items-center space-x-2.5">
              
              {/* Impact Points Pill (Amber bg with award icon) */}
              <button
                onClick={onImpactPillClick}
                title="My Impact Level & Explainer"
                className="inline-flex items-center space-x-1 bg-amber-50 border border-amber-100 text-amber-800 hover:scale-105 active:scale-95 transition-transform text-[10px] font-bold px-2.5 py-0.8 rounded-full h-7 cursor-pointer"
              >
                <Award className="h-3.5 w-3.5 animate-bounce text-amber-600" />
                <span className="font-mono">Impact {currentUserDoc?.impactPoints || 0} • {getUserLevel(currentUserDoc?.impactPoints || 0).name}</span>
              </button>

              {/* Notification Bell Dropdown */}
              <NotificationBell user={user} onSelectReport={onSelectReport} />

              {/* Profile area: Avatar + Name */}
              <button
                id="header-profile-menu-trigger"
                onClick={() => setDrawerOpen(true)}
                className="flex items-center space-x-2 bg-slate-50 border border-slate-200 hover:border-indigo-500 hover:bg-slate-100 rounded-full h-7 px-2 py-0.5 cursor-pointer transition-all duration-200 group"
                title="View Profile and Actions"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Me'}
                    referrerPolicy="no-referrer"
                    className="h-5 w-5 rounded-full object-cover img_no_referrer"
                  />
                ) : (
                  <div className="h-5 w-5 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold text-[9px] capitalize">
                    {user.displayName ? user.displayName[0] : 'U'}
                  </div>
                )}
                <span className="hidden md:inline font-sans text-[10.5px] font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">
                  {user.displayName || 'Citizen'}
                </span>
              </button>

            </div>
          ) : (
            <button
              onClick={handleSignIn}
              disabled={signingIn}
              className="inline-flex items-center space-x-1 rounded-full bg-indigo-600 text-white px-3.5 py-1 text-[11px] font-bold shadow-xs hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{signingIn ? 'Checking...' : 'Sign In'}</span>
            </button>
          )}
        </div>

      </div>

      {/* ======================================= */}
      {/* DRAWER POPUP OVERLAY                    */}
      {/* ======================================= */}
      {drawerOpen && user && (
        <>
          <div 
            id="drawer-backshadow"
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />

          <div 
            id="drawer-menu shadow"
            className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl border-l border-slate-105 animate-slide-in"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-gray-150 px-5 py-4 bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-4.5 w-4.5 text-indigo-600" />
                <h3 className="font-sans text-xs font-black text-slate-800 uppercase tracking-tight">Citizen Identity</h3>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Body content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              
              {/* Profile card details */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4 space-y-4">
                <div className="flex items-center space-x-3">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'Civic user'}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 font-bold text-sm">
                      {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'C'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h4 className="font-sans text-xs font-bold text-slate-900 truncate">
                      {user.displayName || 'Civic Participant'}
                    </h4>
                    <span className="mt-0.5 inline-flex items-center space-x-1 font-sans text-[10px] text-slate-400 max-w-[180px] sm:max-w-xs">
                      <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                      <span className="truncate">{user.email || 'Anonymous email'}</span>
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200/50 pt-2.5 flex items-center justify-between font-sans text-[10px]">
                  <span className="font-bold text-slate-400 uppercase tracking-widest">RANK LEVEL</span>
                  <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 border border-emerald-100">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Verified Contributor</span>
                  </span>
                </div>

                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    onUserClick?.(user.uid);
                  }}
                  className="w-full mt-2 flex items-center justify-center space-x-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 font-sans text-xs font-bold transition-all cursor-pointer shadow-3xs"
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span>View Full Profile</span>
                </button>
              </div>

              {/* Live metrics widgets */}
              <div className="space-y-2">
                <h5 className="font-sans text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-0.5">
                  Contributions dashboard
                </h5>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-slate-100 bg-white p-3 text-center shadow-3xs">
                    <span className="block font-sans text-base font-extrabold text-slate-900">{myReports.length}</span>
                    <span className="block font-sans text-[8.5px] text-slate-400 font-bold leading-none mt-1">Filed</span>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-3 text-center shadow-3xs">
                    <span className="block font-sans text-base font-extrabold text-emerald-600">{resolvedCount}</span>
                    <span className="block font-sans text-[8.5px] text-emerald-500 font-bold leading-none mt-1">Resolved</span>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-3 text-center shadow-3xs">
                    <span className="block font-sans text-base font-extrabold text-amber-600">{activeCount}</span>
                    <span className="block font-sans text-[8.5px] text-amber-500 font-bold leading-none mt-1">Pending</span>
                  </div>
                </div>
              </div>

              {/* Personal Report list history */}
              <div className="space-y-3">
                <h5 className="font-sans text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-0.5">
                  My Alerts history ({myReports.length})
                </h5>

                {myReports.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center bg-slate-50/50">
                    <FileText className="mx-auto h-5 w-5 text-slate-350" />
                    <p className="mt-2 font-sans text-[11px] font-bold text-slate-600">No hazards reported</p>
                    <p className="mt-1 font-sans text-[10px] text-slate-400 leading-normal">
                      Report locally noticed concerns to initiate citizen updates on the map.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {myReports.map((report) => (
                      <div 
                        key={report.id} 
                        className="rounded-xl border border-slate-100 bg-slate-50/30 p-3 hover:border-indigo-200 transition-colors duration-200"
                      >
                        <div className="flex items-center justify-between">
                          <span className="inline-flex rounded-full bg-white border px-2 py-0.5 font-sans text-[8px] font-bold text-slate-500 uppercase tracking-wider">
                            {report.department || 'General'}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[8.5px] font-bold uppercase ${
                            report.status === 'Resolved' ? 'bg-teal-50 text-teal-800 border-teal-100' :
                            report.status === 'In Progress' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                            report.status === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                            'bg-gray-100 text-gray-700 border-gray-200'
                          }`}>
                            ● {report.status}
                          </span>
                        </div>
                        <h6 className="mt-1.5 font-sans text-[11px] font-bold text-slate-800 truncate">
                          {report.title}
                        </h6>
                        
                        <div className="mt-2 pt-2 border-t border-slate-200/50 flex items-center justify-between font-sans text-[9px] text-slate-400">
                          <span className="flex items-center">
                            <Clock className="mr-1 h-3 w-3 text-slate-400 shrink-0" />
                            {report.createdAt ? formatDate(report.createdAt) : 'Pending'}
                          </span>
                          <span className="flex items-center font-bold text-slate-650">
                            <ThumbsUp className="mr-1 h-3 w-3 text-indigo-500" />
                            {report.verificationCount || 0} votes
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Logout Footer row */}
            <div className="border-t border-slate-100 p-4 bg-slate-50">
              <button
                onClick={handleSignOut}
                className="flex w-full items-center justify-center space-x-1.5 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 px-4 py-2.5 font-sans text-xs font-bold transition-all cursor-pointer shadow-3xs"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Disconnect Resident Account</span>
              </button>
            </div>

          </div>
        </>
      )}
    </header>
  );
}

const formatDate = (timestamp: any) => {
  if (!timestamp) return 'Just now';
  const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};
