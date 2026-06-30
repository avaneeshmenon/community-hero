import { Timestamp } from 'firebase/firestore';

export type Department = 'Roads' | 'Water' | 'Electricity' | 'Waste' | 'Safety' | 'Animals' | 'Environment' | 'Public Facilities';

export type IssueSeverity = 'Low' | 'Medium' | 'High';
export type IssueStatus = 'Reported' | 'Verified' | 'In Progress' | 'Resolved' | 'Under Review';

export const DEPARTMENT_SUBCATEGORIES: Record<Department, string[]> = {
  Roads: ['Pothole', 'Road Damage', 'Traffic Signal', 'Obstruction'],
  Water: ['Leakage', 'Supply Issue', 'Drainage', 'Flooding'],
  Electricity: ['Streetlight', 'Exposed Wire', 'Transformer'],
  Waste: ['Garbage', 'Construction Waste', 'Hazardous Waste'],
  Safety: ['Open Manhole', 'Unsafe Structure', 'Fire Hazard'],
  Animals: ['Injured Animal', 'Animal Rescue', 'Dead Animal'],
  Environment: ['Pollution', 'Tree Issue', 'Water Pollution'],
  'Public Facilities': ['Park', 'Bus Stop', 'Toilet', 'Accessibility']
};

export interface EstimatedImpact {
  risks: string[];
}

export interface Report {
  id: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  title: string;
  description: string;
  department: Department;
  subcategory: string;
  severity: IssueSeverity;
  status: IssueStatus;
  locationText: string;
  locality: string; // e.g. 'Bavdhan', 'Kothrud', 'Aundh', 'Baner', 'Other'
  city?: string;
  lat: number | null;
  lng: number | null;
  hasGps?: boolean;
  locationEdited?: boolean;
  photoUrl: string | null;
  mediaUrls?: string[];
  verificationCount: number;
  commentCount?: number;
  imageCount?: number;
  aiTagged?: boolean;
  hasImage?: boolean;
  priorityScore?: number;
  priorityReason?: string;
  estimatedImpact?: EstimatedImpact;
  isValidCivicIssue?: boolean;
  validityReason?: string;
  confidence?: number;
  afterImageSubmitted?: boolean;
  aiVerification?: {
    resolved: boolean;
    confidence: number;
    reason: string;
    submittedBy: string;
    submittedByName: string;
    submittedAt: any;
  } | null;
  authorityActions?: AuthorityAction[];
  underReview?: boolean;
  verifiedAt?: Timestamp | null;
}

export interface AuthorityAction {
  stage: number; // 0-3
  authorityName: string;
  subject: string;
  body: string;
  referenceId: string;
  generatedAt: string;
  daysUnresolved: number;
  dispatchStatus?: 'Drafted' | 'Dispatched'; // stage 0 only
}

export interface Verification {
  id: string;
  verifiedBy: string;
  verifiedByName: string;
  verifiedAt: Timestamp;
}

export interface Comment {
  id: string;
  reportId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl?: string;
  authorImpactPoints?: number;
  text: string;
  createdAt: Timestamp;
  replies?: Reply[];
}

export interface Reply {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl?: string;
  authorImpactPoints?: number;
  text: string;
  createdAt: Timestamp;
}

export interface UserDoc {
  uid: string;
  displayName: string;
  photoURL: string;
  email?: string;
  impactPoints: number;
  reportsCount: number;
  verificationsGiven: number;
  joinedAt: Timestamp;
  earnedBadges?: Record<string, any>;
}

export interface LevelInfo {
  name: string;
  minPoints: number;
  maxPoints: number;
  style: string;
  iconStyle: string;
}

export function getUserLevel(points: number): LevelInfo {
  if (points >= 800) {
    return {
      name: 'Community Hero',
      minPoints: 800,
      maxPoints: 1200, // virtual max for display/percentage math
      style: 'bg-rose-50 border border-rose-200 text-rose-700 font-black animate-pulse',
      iconStyle: 'text-rose-500'
    };
  }
  if (points >= 450) {
    return {
      name: 'Civic Champion',
      minPoints: 450,
      maxPoints: 799,
      style: 'bg-amber-50 border border-amber-200 text-amber-700 font-extrabold',
      iconStyle: 'text-amber-500'
    };
  }
  if (points >= 250) {
    return {
      name: 'Community Guardian',
      minPoints: 250,
      maxPoints: 449,
      style: 'bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold',
      iconStyle: 'text-indigo-500'
    };
  }
  if (points >= 100) {
    return {
      name: 'Volunteer',
      minPoints: 100,
      maxPoints: 249,
      style: 'bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold',
      iconStyle: 'text-emerald-500'
    };
  }
  return {
    name: 'Citizen',
    minPoints: 0,
    maxPoints: 99,
    style: 'bg-slate-100 border border-slate-200 text-slate-700 font-medium',
    iconStyle: 'text-slate-400'
  };
}

