import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  writeBatch, 
  getDocs,
  where,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User as FirebaseUser } from 'firebase/auth';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Sparkles, 
  Award, 
  FileText, 
  AlertTriangle, 
  ShieldAlert, 
  MessageSquare, 
  CheckCircle2, 
  Mail,
  X,
  Trash2
} from 'lucide-react';

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  createdAt: any;
  read: boolean;
  reportId?: string;
  badgeId?: string;
}

interface NotificationBellProps {
  user: FirebaseUser | null;
  onSelectReport?: (reportId: string) => void;
}

export default function NotificationBell({ user, onSelectReport }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Real-time synchronization for user notifications
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const itemsCol = collection(db, 'notifications', user.uid, 'items');
    const q = query(itemsCol, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: NotificationItem[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as NotificationItem);
      });
      setNotifications(items);
    }, (error) => {
      console.warn('[NotificationBell] Subscribing to notifications deferred:', error);
    });

    return () => unsubscribe();
  }, [user]);

  // Click outside listener to close the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mark single notification as read
  const handleItemClick = async (notif: NotificationItem) => {
    if (!user) return;
    setIsOpen(false);

    try {
      const docRef = doc(db, 'notifications', user.uid, 'items', notif.id);
      await updateDoc(docRef, { read: true });

      // If notification points to a specific report, let's invoke callback
      if (notif.reportId && onSelectReport) {
        onSelectReport(notif.reportId);
      }
    } catch (err) {
      console.error('[NotificationBell] Failed to mark read:', err);
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    if (!user || unreadCount === 0) return;

    try {
      const batch = writeBatch(db);
      notifications.forEach((notif) => {
        if (!notif.read) {
          const docRef = doc(db, 'notifications', user.uid, 'items', notif.id);
          batch.update(docRef, { read: true });
        }
      });
      await batch.commit();
    } catch (err) {
      console.error('[NotificationBell] Failed to mark all read:', err);
    }
  };

  // Dismiss/delete single notification
  const handleDeleteItem = async (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      const docRef = doc(db, 'notifications', user.uid, 'items', notifId);
      await deleteDoc(docRef);
    } catch (err) {
      console.error('[NotificationBell] Failed to delete notification:', err);
    }
  };

  // Clear all notifications
  const handleClearAll = async () => {
    if (!user || notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((notif) => {
        const docRef = doc(db, 'notifications', user.uid, 'items', notif.id);
        batch.delete(docRef);
      });
      await batch.commit();
    } catch (err) {
      console.error('[NotificationBell] Failed to clear all notifications:', err);
    }
  };

  // Helper to format date
  const formatNotifDate = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    const diffMs = new Date().getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDays}d ago`;
  };

  // Helper to select icon and colors
  const getNotifVisuals = (type: string) => {
    switch (type) {
      case 'badge':
        return {
          icon: <Award className="h-4 w-4 text-fuchsia-600" />,
          bgColor: 'bg-fuchsia-50 border border-fuchsia-100',
        };
      case 'tier':
        return {
          icon: <Sparkles className="h-4 w-4 text-indigo-600 animate-pulse" />,
          bgColor: 'bg-indigo-50 border border-indigo-100',
        };
      case 'resolve':
        return {
          icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
          bgColor: 'bg-emerald-50 border border-emerald-100',
        };
      case 'complaint':
        return {
          icon: <FileText className="h-4 w-4 text-amber-600" />,
          bgColor: 'bg-amber-50 border border-amber-100',
        };
      case 'escalate':
        return {
          icon: <AlertTriangle className="h-4 w-4 text-orange-600 animate-bounce" />,
          bgColor: 'bg-orange-50 border border-orange-100',
        };
      case 'verify':
        return {
          icon: <Check className="h-4 w-4 text-blue-600" />,
          bgColor: 'bg-blue-50 border border-blue-100',
        };
      case 'comment':
        return {
          icon: <MessageSquare className="h-4 w-4 text-pink-600" />,
          bgColor: 'bg-pink-50 border border-pink-100',
        };
      case 'flag':
      case 'review':
        return {
          icon: <ShieldAlert className="h-4 w-4 text-red-600" />,
          bgColor: 'bg-red-50 border border-red-100',
        };
      default:
        return {
          icon: <Mail className="h-4 w-4 text-slate-600" />,
          bgColor: 'bg-slate-50 border border-slate-100',
        };
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-1.5 rounded-full hover:bg-slate-100 cursor-pointer transition-colors ${
          isOpen ? 'bg-slate-100 text-slate-800' : 'text-slate-500'
        }`}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 border border-white text-white font-sans text-[8px] font-black flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Floating Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-2xl z-50 overflow-hidden transform origin-top-right transition-all duration-200">
          
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/50 border-b border-slate-150">
            <span className="font-sans text-xs font-black text-slate-800 uppercase tracking-tight">
              Community Broadcasts
            </span>
            <div className="flex items-center space-x-2.5">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center space-x-0.5 text-slate-500 hover:text-indigo-600 transition-colors font-sans text-[10px] font-black uppercase cursor-pointer"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Read All</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center space-x-0.5 text-slate-400 hover:text-rose-600 transition-colors font-sans text-[10px] font-black uppercase cursor-pointer"
                  title="Delete all notifications"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          {/* List Content */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center mb-2.5">
                  <Bell className="h-5 w-5 text-slate-300" />
                </div>
                <p className="font-sans text-xs text-slate-500 font-bold">No notifications yet</p>
                <p className="font-sans text-[10px] text-slate-400 mt-0.5">We'll alert you about status changes or badges!</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const visuals = getNotifVisuals(notif.type);
                return (
                  <div
                    key={notif.id}
                    className={`w-full px-4 py-3 flex items-start justify-between space-x-3 transition-colors group relative ${
                      notif.read ? 'hover:bg-slate-50/50 bg-white' : 'bg-indigo-50/10 hover:bg-indigo-50/20 border-l-3 border-indigo-500'
                    }`}
                  >
                    {/* Clickable Area */}
                    <div
                      onClick={() => handleItemClick(notif)}
                      className="flex-1 flex items-start space-x-3 cursor-pointer min-w-0"
                    >
                      {/* Visual Badge Icon */}
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${visuals.bgColor}`}>
                        {visuals.icon}
                      </div>

                      {/* Message Details */}
                      <div className="flex-1 min-w-0">
                        <p className={`font-sans text-[11px] leading-tight text-slate-800 ${notif.read ? 'font-medium' : 'font-bold'}`}>
                          {notif.message}
                        </p>
                        <span className="font-mono text-[9px] text-slate-400 mt-1 block">
                          {formatNotifDate(notif.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Right action area (Dismiss / delete buttons) */}
                    <div className="flex items-center space-x-2 shrink-0 self-center">
                      {!notif.read && (
                        <div className="h-1.5 w-1.5 rounded-full bg-indigo-600 shrink-0" />
                      )}
                      <button
                        onClick={(e) => handleDeleteItem(e, notif.id)}
                        className="p-1 rounded-md text-slate-350 hover:text-rose-500 hover:bg-rose-50 cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
                        title="Dismiss notification"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
