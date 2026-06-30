import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  writeBatch, 
  serverTimestamp, 
  Timestamp 
} from 'firebase/firestore';
import { db } from './firebase';
import { getUserLevel } from '../types';

export interface Badge {
  id: string;
  name: string;
  description: string;
  criteriaDescription: string;
  family: 
    | 'reporting' 
    | 'resolution' 
    | 'department' 
    | 'verification' 
    | 'escalation' 
    | 'engagement' 
    | 'streak' 
    | 'locality' 
    | 'tier' 
    | 'quality' 
    | 'special' 
    | 'meta';
  icon: string; // Lucide icon name
  colorClass: string; // Styling class for medallion
  criteria: (stats: UserStats) => boolean;
}

export interface UserStats {
  reportsCount: number;
  resolvedCount: number;
  verificationsGiven: number;
  verificationsReceived: number;
  commentsGiven: number;
  commentsReceived: number;
  escalationsCount: number;
  afterPhotosCount: number;
  distinctLocalities: number;
  impactPoints: number;
  streakDays: number;
  badgeCount: number;
  currentTier: string;
  dept_Roads: number;
  dept_Water: number;
  dept_Electricity: number;
  dept_Waste: number;
  dept_Safety: number;
  dept_Animals: number;
  dept_Environment: number;
  dept_Public_Facilities: number;
}

export const BADGE_FAMILIES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  reporting: { label: 'Reporting', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  resolution: { label: 'Resolution', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  department: { label: 'Department Specialist', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  verification: { label: 'Verification & Trust', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  escalation: { label: 'Escalation & Advocacy', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  engagement: { label: 'Engagement & Community', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  streak: { label: 'Consistency & Streaks', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  locality: { label: 'Locality Pioneer', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  tier: { label: 'Civic Tier', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  quality: { label: 'Report Quality', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  special: { label: 'Special Recognition', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  meta: { label: 'Completionist & Meta', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
};

export const BADGES_CATALOG: Badge[] = [
  // --- 1. REPORTING ---
  {
    id: 'rep_1',
    name: 'First Alert',
    description: 'Began your civic monitoring journey.',
    criteriaDescription: 'File your 1st hazard report.',
    family: 'reporting',
    icon: 'Eye',
    colorClass: 'bg-blue-500 text-white',
    criteria: (s) => s.reportsCount >= 1,
  },
  {
    id: 'rep_2',
    name: 'Community Eyes',
    description: 'Actively mapping street hazards.',
    criteriaDescription: 'File 5 hazard reports.',
    family: 'reporting',
    icon: 'Search',
    colorClass: 'bg-blue-500 text-white',
    criteria: (s) => s.reportsCount >= 5,
  },
  {
    id: 'rep_3',
    name: 'Vigilant Neighbor',
    description: 'Keeping a close look on local streets.',
    criteriaDescription: 'File 10 hazard reports.',
    family: 'reporting',
    icon: 'Shield',
    colorClass: 'bg-blue-500 text-white',
    criteria: (s) => s.reportsCount >= 10,
  },
  {
    id: 'rep_4',
    name: 'Local Sentinel',
    description: 'An essential reporter in the neighborhood.',
    criteriaDescription: 'File 25 hazard reports.',
    family: 'reporting',
    icon: 'Activity',
    colorClass: 'bg-blue-500 text-white',
    criteria: (s) => s.reportsCount >= 25,
  },
  {
    id: 'rep_5',
    name: 'Civic Watchdog',
    description: 'Outstanding coverage of urban issues.',
    criteriaDescription: 'File 50 hazard reports.',
    family: 'reporting',
    icon: 'Compass',
    colorClass: 'bg-blue-500 text-white',
    criteria: (s) => s.reportsCount >= 50,
  },
  {
    id: 'rep_6',
    name: 'Inspector General',
    description: 'A force to be reckoned with in community reporting.',
    criteriaDescription: 'File 100 hazard reports.',
    family: 'reporting',
    icon: 'Award',
    colorClass: 'bg-blue-500 text-white',
    criteria: (s) => s.reportsCount >= 100,
  },
  {
    id: 'rep_7',
    name: 'Hazard Mapper',
    description: 'Unlocking extensive visual data of your district.',
    criteriaDescription: 'File 150 hazard reports.',
    family: 'reporting',
    icon: 'Map',
    colorClass: 'bg-blue-500 text-white',
    criteria: (s) => s.reportsCount >= 150,
  },
  {
    id: 'rep_8',
    name: 'Legendary Reporter',
    description: 'One of the ultimate pillars of safety reporting.',
    criteriaDescription: 'File 250 hazard reports.',
    family: 'reporting',
    icon: 'Zap',
    colorClass: 'bg-blue-600 text-white animate-pulse',
    criteria: (s) => s.reportsCount >= 250,
  },

  // --- 2. RESOLUTION ---
  {
    id: 'res_1',
    name: 'First Remedy',
    description: 'Witnessed your first report get resolved!',
    criteriaDescription: 'Have 1 of your reports reach Resolved status.',
    family: 'resolution',
    icon: 'CheckCircle2',
    colorClass: 'bg-emerald-500 text-white',
    criteria: (s) => s.resolvedCount >= 1,
  },
  {
    id: 'res_2',
    name: 'Problem Solver',
    description: 'A catalyst for positive change.',
    criteriaDescription: 'Have 5 of your reports Resolved.',
    family: 'resolution',
    icon: 'CheckSquare',
    colorClass: 'bg-emerald-500 text-white',
    criteria: (s) => s.resolvedCount >= 5,
  },
  {
    id: 'res_3',
    name: 'Neighborhood Healer',
    description: 'Resolving issues block by block.',
    criteriaDescription: 'Have 10 of your reports Resolved.',
    family: 'resolution',
    icon: 'Heart',
    colorClass: 'bg-emerald-500 text-white',
    criteria: (s) => s.resolvedCount >= 10,
  },
  {
    id: 'res_4',
    name: 'Urban Fixer',
    description: 'Significant restoration contribution.',
    criteriaDescription: 'Have 25 of your reports Resolved.',
    family: 'resolution',
    icon: 'Wrench',
    colorClass: 'bg-emerald-500 text-white',
    criteria: (s) => s.resolvedCount >= 25,
  },
  {
    id: 'res_5',
    name: 'Restoration Champion',
    description: 'A highly active force in local healing.',
    criteriaDescription: 'Have 50 of your reports Resolved.',
    family: 'resolution',
    icon: 'Sparkles',
    colorClass: 'bg-emerald-500 text-white',
    criteria: (s) => s.resolvedCount >= 50,
  },
  {
    id: 'res_6',
    name: 'Resolution Maestro',
    description: 'Masterfully correcting urban disruptions.',
    criteriaDescription: 'Have 100 of your reports Resolved.',
    family: 'resolution',
    icon: 'Hammer',
    colorClass: 'bg-emerald-500 text-white',
    criteria: (s) => s.resolvedCount >= 100,
  },
  {
    id: 'res_7',
    name: 'Civic Catalyst',
    description: 'Drives rapid structural corrections across the city.',
    criteriaDescription: 'Have 150 of your reports Resolved.',
    family: 'resolution',
    icon: 'Zap',
    colorClass: 'bg-emerald-500 text-white',
    criteria: (s) => s.resolvedCount >= 150,
  },
  {
    id: 'res_8',
    name: 'Metropolitan Savior',
    description: 'Elite status in municipal improvements.',
    criteriaDescription: 'Have 250 of your reports Resolved.',
    family: 'resolution',
    icon: 'Award',
    colorClass: 'bg-emerald-600 text-white animate-pulse',
    criteria: (s) => s.resolvedCount >= 250,
  },

  // --- 3. DEPARTMENT SPECIALIST ---
  {
    id: 'dept_roads_1',
    name: 'Pothole Patrol',
    description: 'Keeps an eye on public paths and road structures.',
    criteriaDescription: 'Have 3 Roads & Infrastructure reports Resolved.',
    family: 'department',
    icon: 'Car',
    colorClass: 'bg-purple-500 text-white',
    criteria: (s) => s.dept_Roads >= 3,
  },
  {
    id: 'dept_roads_2',
    name: 'Highway Hero',
    description: 'Expert of transit safety and street maintenance.',
    criteriaDescription: 'Have 10 Roads & Infrastructure reports Resolved.',
    family: 'department',
    icon: 'TrendingUp',
    colorClass: 'bg-purple-600 text-white',
    criteria: (s) => s.dept_Roads >= 10,
  },
  {
    id: 'dept_water_1',
    name: 'Water Warden',
    description: 'Promoting swift resolution of pipe leaks and hydrants.',
    criteriaDescription: 'Have 3 Water & Utilities reports Resolved.',
    family: 'department',
    icon: 'Droplet',
    colorClass: 'bg-purple-500 text-white',
    criteria: (s) => s.dept_Water >= 3,
  },
  {
    id: 'dept_water_2',
    name: 'Aquifer Ally',
    description: 'Saves water resource flow and local infrastructure.',
    criteriaDescription: 'Have 10 Water & Utilities reports Resolved.',
    family: 'department',
    icon: 'Activity',
    colorClass: 'bg-purple-600 text-white',
    criteria: (s) => s.dept_Water >= 10,
  },
  {
    id: 'dept_elec_1',
    name: 'Grid Guard',
    description: 'Alerting power lines and streetlamp concerns.',
    criteriaDescription: 'Have 3 Electricity & Lights reports Resolved.',
    family: 'department',
    icon: 'Zap',
    colorClass: 'bg-purple-500 text-white',
    criteria: (s) => s.dept_Electricity >= 3,
  },
  {
    id: 'dept_elec_2',
    name: 'Power Practitioner',
    description: 'Kept the neighborhood illuminated and safe.',
    criteriaDescription: 'Have 10 Electricity & Lights reports Resolved.',
    family: 'department',
    icon: 'Lightbulb',
    colorClass: 'bg-purple-600 text-white',
    criteria: (s) => s.dept_Electricity >= 10,
  },
  {
    id: 'dept_waste_1',
    name: 'Litter Lifter',
    description: 'Advocating for prompt removal of waste piles.',
    criteriaDescription: 'Have 3 Waste & Sanitation reports Resolved.',
    family: 'department',
    icon: 'Trash2',
    colorClass: 'bg-purple-500 text-white',
    criteria: (s) => s.dept_Waste >= 3,
  },
  {
    id: 'dept_waste_2',
    name: 'Sanitation Sage',
    description: 'Champion of neat and healthy streets.',
    criteriaDescription: 'Have 10 Waste & Sanitation reports Resolved.',
    family: 'department',
    icon: 'Sparkles',
    colorClass: 'bg-purple-600 text-white',
    criteria: (s) => s.dept_Waste >= 10,
  },
  {
    id: 'dept_safety_1',
    name: 'Safe Haven',
    description: 'Flagging obstructions or public risks.',
    criteriaDescription: 'Have 3 Public Safety reports Resolved.',
    family: 'department',
    icon: 'Shield',
    colorClass: 'bg-purple-500 text-white',
    criteria: (s) => s.dept_Safety >= 3,
  },
  {
    id: 'dept_safety_2',
    name: 'Shield of the Streets',
    description: 'Active guardian against environmental dangers.',
    criteriaDescription: 'Have 10 Public Safety reports Resolved.',
    family: 'department',
    icon: 'ShieldCheck',
    colorClass: 'bg-purple-600 text-white',
    criteria: (s) => s.dept_Safety >= 10,
  },
  {
    id: 'dept_env_1',
    name: 'Eco Guardian',
    description: 'Helps protect the natural landscape of the town.',
    criteriaDescription: 'Have 3 Environment reports Resolved.',
    family: 'department',
    icon: 'Compass',
    colorClass: 'bg-purple-500 text-white',
    criteria: (s) => s.dept_Environment >= 3,
  },
  {
    id: 'dept_env_2',
    name: 'Nature\'s Shield',
    description: 'Dedicated to preserving green spaces.',
    criteriaDescription: 'Have 10 Environment reports Resolved.',
    family: 'department',
    icon: 'Heart',
    colorClass: 'bg-purple-600 text-white',
    criteria: (s) => s.dept_Environment >= 10,
  },

  // --- 4. VERIFICATION & TRUST ---
  {
    id: 'ver_given_1',
    name: 'Fact Checker',
    description: 'Vetted community reports on the ground.',
    criteriaDescription: 'Verify 5 reports filed by other users.',
    family: 'verification',
    icon: 'CheckSquare',
    colorClass: 'bg-amber-500 text-white',
    criteria: (s) => s.verificationsGiven >= 5,
  },
  {
    id: 'ver_given_2',
    name: 'Trust Officer',
    description: 'Essential validator of local reports.',
    criteriaDescription: 'Verify 25 reports filed by other users.',
    family: 'verification',
    icon: 'ShieldCheck',
    colorClass: 'bg-amber-500 text-white',
    criteria: (s) => s.verificationsGiven >= 25,
  },
  {
    id: 'ver_given_3',
    name: 'Oracle of Truth',
    description: 'Ensuring absolute truth in civic data.',
    criteriaDescription: 'Verify 100 reports filed by other users.',
    family: 'verification',
    icon: 'Award',
    colorClass: 'bg-amber-600 text-white animate-pulse',
    criteria: (s) => s.verificationsGiven >= 100,
  },
  {
    id: 'ver_rec_1',
    name: 'Credible Reporter',
    description: 'Your reports are widely supported by others.',
    criteriaDescription: 'Receive 10 verifications on your reports.',
    family: 'verification',
    icon: 'Users',
    colorClass: 'bg-amber-500 text-white',
    criteria: (s) => s.verificationsReceived >= 10,
  },
  {
    id: 'ver_rec_2',
    name: 'Beacon of Trust',
    description: 'Reliable and highly accurate observer.',
    criteriaDescription: 'Receive 50 verifications on your reports.',
    family: 'verification',
    icon: 'Sparkles',
    colorClass: 'bg-amber-500 text-white',
    criteria: (s) => s.verificationsReceived >= 50,
  },
  {
    id: 'ver_rec_3',
    name: 'Vouch Safe',
    description: 'A stellar community source whose reports are fully vetted.',
    criteriaDescription: 'Receive 200 verifications on your reports.',
    family: 'verification',
    icon: 'Shield',
    colorClass: 'bg-amber-600 text-white animate-pulse',
    criteria: (s) => s.verificationsReceived >= 200,
  },

  // --- 5. ESCALATION & ADVOCACY ---
  {
    id: 'esc_1',
    name: 'Whistleblower',
    description: 'Successfully highlighted critical municipal issues.',
    criteriaDescription: 'Have your 1st report escalated to officials.',
    family: 'escalation',
    icon: 'AlertTriangle',
    colorClass: 'bg-orange-500 text-white',
    criteria: (s) => s.escalationsCount >= 1,
  },
  {
    id: 'esc_2',
    name: 'System Squeezer',
    description: 'Holding authorities accountable for rapid fixes.',
    criteriaDescription: 'Have 5 reports escalated.',
    family: 'escalation',
    icon: 'Activity',
    colorClass: 'bg-orange-500 text-white',
    criteria: (s) => s.escalationsCount >= 5,
  },
  {
    id: 'esc_3',
    name: 'Citizen Advocate',
    description: 'Your voice is heard in government departments.',
    criteriaDescription: 'Have 10 reports escalated.',
    family: 'escalation',
    icon: 'MessageSquare',
    colorClass: 'bg-orange-500 text-white',
    criteria: (s) => s.escalationsCount >= 10,
  },
  {
    id: 'esc_4',
    name: 'Bureaucracy Buster',
    description: 'Bypassing silence to get rapid town actions.',
    criteriaDescription: 'Have 25 reports escalated.',
    family: 'escalation',
    icon: 'Wrench',
    colorClass: 'bg-orange-500 text-white',
    criteria: (s) => s.escalationsCount >= 25,
  },
  {
    id: 'esc_5',
    name: 'Squeaky Wheel',
    description: 'The master of calling for swift systemic correction.',
    criteriaDescription: 'Have 50 reports escalated.',
    family: 'escalation',
    icon: 'Award',
    colorClass: 'bg-orange-600 text-white animate-pulse',
    criteria: (s) => s.escalationsCount >= 50,
  },

  // --- 6. ENGAGEMENT & COMMUNITY ---
  {
    id: 'eng_given_1',
    name: 'Conversationalist',
    description: 'Contributing thoughts to community boards.',
    criteriaDescription: 'Post 5 comments or replies on reports.',
    family: 'engagement',
    icon: 'MessageSquare',
    colorClass: 'bg-pink-500 text-white',
    criteria: (s) => s.commentsGiven >= 5,
  },
  {
    id: 'eng_given_2',
    name: 'Town Hall Regular',
    description: 'Highly active in urban discussions.',
    criteriaDescription: 'Post 25 comments or replies.',
    family: 'engagement',
    icon: 'Users',
    colorClass: 'bg-pink-500 text-white',
    criteria: (s) => s.commentsGiven >= 25,
  },
  {
    id: 'eng_given_3',
    name: 'Civic Orator',
    description: 'Inspires deep focus with thoughtful feedback.',
    criteriaDescription: 'Post 100 comments or replies.',
    family: 'engagement',
    icon: 'Award',
    colorClass: 'bg-pink-600 text-white animate-pulse',
    criteria: (s) => s.commentsGiven >= 100,
  },
  {
    id: 'eng_rec_1',
    name: 'Community Spark',
    description: 'Your reports attract discussion and interest.',
    criteriaDescription: 'Receive 10 comments on your reports.',
    family: 'engagement',
    icon: 'Flame',
    colorClass: 'bg-pink-500 text-white',
    criteria: (s) => s.commentsReceived >= 10,
  },
  {
    id: 'eng_rec_2',
    name: 'Public Forum',
    description: 'Generates great community involvement and buzz.',
    criteriaDescription: 'Receive 50 comments on your reports.',
    family: 'engagement',
    icon: 'MessageSquare',
    colorClass: 'bg-pink-500 text-white',
    criteria: (s) => s.commentsReceived >= 50,
  },
  {
    id: 'eng_rec_3',
    name: 'Town Talk',
    description: 'Creating landmark issues that center community attention.',
    criteriaDescription: 'Receive 200 comments on your reports.',
    family: 'engagement',
    icon: 'Shield',
    colorClass: 'bg-pink-600 text-white animate-pulse',
    criteria: (s) => s.commentsReceived >= 200,
  },

  // --- 7. CONSISTENCY & STREAKS ---
  {
    id: 'str_1',
    name: 'Active Resident',
    description: 'Consistently looking out for public issues.',
    criteriaDescription: 'Maintain a 3-day action streak.',
    family: 'streak',
    icon: 'Flame',
    colorClass: 'bg-amber-500 text-white',
    criteria: (s) => s.streakDays >= 3,
  },
  {
    id: 'str_2',
    name: 'Weekly Warrior',
    description: 'A full week of active community service.',
    criteriaDescription: 'Maintain a 7-day action streak.',
    family: 'streak',
    icon: 'Award',
    colorClass: 'bg-amber-500 text-white',
    criteria: (s) => s.streakDays >= 7,
  },
  {
    id: 'str_3',
    name: 'Fortress of Habit',
    description: 'Sublime reliability in keeping streets safe.',
    criteriaDescription: 'Maintain a 14-day action streak.',
    family: 'streak',
    icon: 'ShieldCheck',
    colorClass: 'bg-amber-500 text-white',
    criteria: (s) => s.streakDays >= 14,
  },
  {
    id: 'str_4',
    name: 'Monthly Titan',
    description: 'An unstoppable, day-by-day protector.',
    criteriaDescription: 'Maintain a 30-day action streak.',
    family: 'streak',
    icon: 'Zap',
    colorClass: 'bg-amber-600 text-white animate-pulse',
    criteria: (s) => s.streakDays >= 30,
  },
  {
    id: 'str_5',
    name: 'Civic Devotee',
    description: 'The absolute legendary streak champion of the region.',
    criteriaDescription: 'Maintain a 90-day action streak.',
    family: 'streak',
    icon: 'Sparkles',
    colorClass: 'bg-amber-600 text-white animate-pulse',
    criteria: (s) => s.streakDays >= 90,
  },

  // --- 8. LOCALITY PIONEER ---
  {
    id: 'loc_1',
    name: 'Local Scout',
    description: 'Broadening your reporting boundaries.',
    criteriaDescription: 'Report hazards in 2 different localities.',
    family: 'locality',
    icon: 'MapPin',
    colorClass: 'bg-teal-500 text-white',
    criteria: (s) => s.distinctLocalities >= 2,
  },
  {
    id: 'loc_2',
    name: 'District Wanderer',
    description: 'Recognized in multiple key quadrants.',
    criteriaDescription: 'Report hazards in 5 different localities.',
    family: 'locality',
    icon: 'Compass',
    colorClass: 'bg-teal-500 text-white',
    criteria: (s) => s.distinctLocalities >= 5,
  },
  {
    id: 'loc_3',
    name: 'Regional Ranger',
    description: 'Extensive knowledge of regional streets.',
    criteriaDescription: 'Report hazards in 10 different localities.',
    family: 'locality',
    icon: 'Map',
    colorClass: 'bg-teal-500 text-white',
    criteria: (s) => s.distinctLocalities >= 10,
  },
  {
    id: 'loc_4',
    name: 'City Explorer',
    description: 'Your reports span across the major city lines.',
    criteriaDescription: 'Report hazards in 20 different localities.',
    family: 'locality',
    icon: 'Award',
    colorClass: 'bg-teal-600 text-white animate-pulse',
    criteria: (s) => s.distinctLocalities >= 20,
  },
  {
    id: 'loc_5',
    name: 'Metropolitan Nomad',
    description: 'A global watchdog navigating every street sector.',
    criteriaDescription: 'Report hazards in 50 different localities.',
    family: 'locality',
    icon: 'Zap',
    colorClass: 'bg-teal-600 text-white animate-pulse',
    criteria: (s) => s.distinctLocalities >= 50,
  },

  // --- 9. TIER ---
  {
    id: 'tier_1',
    name: 'Humble Citizen',
    description: 'Registered as an active member of our city.',
    criteriaDescription: 'Achieve Citizen Tier (>= 0 Impact Points).',
    family: 'tier',
    icon: 'User',
    colorClass: 'bg-indigo-500 text-white',
    criteria: (s) => s.impactPoints >= 0,
  },
  {
    id: 'tier_2',
    name: 'Proud Volunteer',
    description: 'Active, selfless contributor to urban fixes.',
    criteriaDescription: 'Achieve Volunteer Tier (>= 100 Impact Points).',
    family: 'tier',
    icon: 'Award',
    colorClass: 'bg-indigo-500 text-white',
    criteria: (s) => s.impactPoints >= 100,
  },
  {
    id: 'tier_3',
    name: 'Community Guardian',
    description: 'Guardian level of civic devotion.',
    criteriaDescription: 'Achieve Community Guardian Tier (>= 250 Impact Points).',
    family: 'tier',
    icon: 'Shield',
    colorClass: 'bg-indigo-600 text-white',
    criteria: (s) => s.impactPoints >= 250,
  },
  {
    id: 'tier_4',
    name: 'Civic Champion',
    description: 'Outstanding champion honored by residents.',
    criteriaDescription: 'Achieve Civic Champion Tier (>= 450 Impact Points).',
    family: 'tier',
    icon: 'Sparkles',
    colorClass: 'bg-indigo-600 text-white animate-pulse',
    criteria: (s) => s.impactPoints >= 450,
  },
  {
    id: 'tier_5',
    name: 'True Hero',
    description: 'The highest tier, revered by all local departments.',
    criteriaDescription: 'Achieve Community Hero Tier (>= 800 Impact Points).',
    family: 'tier',
    icon: 'Award',
    colorClass: 'bg-rose-600 text-white animate-bounce',
    criteria: (s) => s.impactPoints >= 800,
  },

  // --- 10. REPORT QUALITY ---
  {
    id: 'qual_1',
    name: 'Visual Evidence',
    description: 'Providing photo evidence for rapid vetting.',
    criteriaDescription: 'Submit 3 reports with photos.',
    family: 'quality',
    icon: 'Image',
    colorClass: 'bg-violet-500 text-white',
    criteria: (s) => s.afterPhotosCount >= 3,
  },
  {
    id: 'qual_2',
    name: 'AI Verified',
    description: 'Passing computer-vision validation metrics.',
    criteriaDescription: 'Submit 5 reports with photos (AI verified).',
    family: 'quality',
    icon: 'CheckCircle2',
    colorClass: 'bg-violet-500 text-white',
    criteria: (s) => s.afterPhotosCount >= 5,
  },
  {
    id: 'qual_3',
    name: 'Eye Witness',
    description: 'Detailed photographic evidence champion.',
    criteriaDescription: 'Submit 10 reports with photos.',
    family: 'quality',
    icon: 'Eye',
    colorClass: 'bg-violet-600 text-white',
    criteria: (s) => s.afterPhotosCount >= 10,
  },
  {
    id: 'qual_4',
    name: 'Visual Documenter',
    description: 'Creating comprehensive graphical archives of hazards.',
    criteriaDescription: 'Submit 25 reports with photos.',
    family: 'quality',
    icon: 'Sparkles',
    colorClass: 'bg-violet-600 text-white',
    criteria: (s) => s.afterPhotosCount >= 25,
  },
  {
    id: 'qual_5',
    name: 'Before & After',
    description: 'Providing visual records of successful resolutions.',
    criteriaDescription: 'Have 5 of your reports Resolved with verified photos.',
    family: 'quality',
    icon: 'Camera',
    colorClass: 'bg-violet-600 text-white animate-pulse',
    criteria: (s) => s.afterPhotosCount >= 5, // Approximate check using afterPhotosCount
  },

  // --- 11. SPECIAL RECOGNITION ---
  {
    id: 'spec_1',
    name: 'First Responder',
    description: 'Unlocking deep impact on safety.',
    criteriaDescription: 'Earn 500+ impact points.',
    family: 'special',
    icon: 'Flame',
    colorClass: 'bg-rose-500 text-white',
    criteria: (s) => s.impactPoints >= 500,
  },
  {
    id: 'spec_2',
    name: 'Elite Inspector',
    description: 'Exceptional, dedicated eyes on the town.',
    criteriaDescription: 'Earn 1000+ impact points.',
    family: 'special',
    icon: 'Award',
    colorClass: 'bg-rose-500 text-white animate-pulse',
    criteria: (s) => s.impactPoints >= 1000,
  },
  {
    id: 'spec_3',
    name: 'Pillar of Society',
    description: 'Your continuous efforts keep thousands safe.',
    criteriaDescription: 'Earn 1500+ impact points.',
    family: 'special',
    icon: 'Shield',
    colorClass: 'bg-rose-600 text-white animate-bounce',
    criteria: (s) => s.impactPoints >= 1500,
  },

  // --- 12. COMPLETIONIST & META ---
  {
    id: 'meta_1',
    name: 'Achievement Collector',
    description: 'A dedicated collector of recognitions.',
    criteriaDescription: 'Earn 5 different badges.',
    family: 'meta',
    icon: 'CheckSquare',
    colorClass: 'bg-slate-600 text-white',
    criteria: (s) => s.badgeCount >= 5,
  },
  {
    id: 'meta_2',
    name: 'Badge Enthusiast',
    description: 'Amassing quite the medallion rack.',
    criteriaDescription: 'Earn 15 different badges.',
    family: 'meta',
    icon: 'Award',
    colorClass: 'bg-slate-600 text-white',
    criteria: (s) => s.badgeCount >= 15,
  },
  {
    id: 'meta_3',
    name: 'Master Achiever',
    description: 'Nearly unstoppable in civic honors.',
    criteriaDescription: 'Earn 30 different badges.',
    family: 'meta',
    icon: 'Sparkles',
    colorClass: 'bg-slate-700 text-white animate-pulse',
    criteria: (s) => s.badgeCount >= 30,
  },
  {
    id: 'meta_4',
    name: 'Omnipresent Hero',
    description: 'A legendary master of the entire community catalog.',
    criteriaDescription: 'Earn 50 different badges.',
    family: 'meta',
    icon: 'Zap',
    colorClass: 'bg-slate-800 text-white animate-bounce',
    criteria: (s) => s.badgeCount >= 50,
  }
];

/**
 * Recalculates user statistics, matches against unearned badges,
 * awards them, and sends real-time notifications.
 * Wrapper try/catch blocks prevent this from failing the primary action.
 */
export async function evaluateAndAwardBadges(uid: string): Promise<void> {
  if (!uid) return;

  try {
    // 1. Fetch User Document
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    const currentEarnedMap = (userData.earnedBadges || {}) as Record<string, any>;
    const currentEarnedIds = Object.keys(currentEarnedMap);

    // 2. Fetch User's Reports
    const reportsQuery = query(collection(db, 'reports'), where('createdBy', '==', uid));
    const reportsSnap = await getDocs(reportsQuery);
    
    const reports = reportsSnap.docs.map(d => d.data());

    // 3. Compute Stats
    const reportsCount = reports.length;
    const resolvedCount = reports.filter(r => r.status === 'Resolved').length;
    
    // Quality photos (reports with images)
    const afterPhotosCount = reports.filter(r => r.hasImage || r.imageCount > 0 || r.afterImageSubmitted).length;
    
    // Escalation count
    const escalationsCount = reports.filter(r => (r.escalationLevel && r.escalationLevel > 0) || r.escalatedAt).length;
    
    // Distinct localities
    const uniqueLocalities = new Set<string>();
    reports.forEach(r => {
      if (r.locality) {
        uniqueLocalities.add(r.locality.trim());
      }
    });
    const distinctLocalities = uniqueLocalities.size;

    // Verifications Received and Comments Received
    let verificationsReceived = 0;
    let commentsReceived = 0;
    reports.forEach(r => {
      verificationsReceived += (r.verificationCount || 0);
      commentsReceived += (r.commentCount || 0);
    });

    // Extract simple numbers from user doc
    const verificationsGiven = userData.verificationsGiven || 0;
    const commentsGiven = userData.commentsGivenCount || 0;
    const impactPoints = userData.impactPoints || 0;
    const streakDays = userData.streakDays || 1;
    const currentTier = getUserLevel(impactPoints).name;
    const badgeCount = currentEarnedIds.length;

    // Department Specific Resolved Counts
    let dept_Roads = 0;
    let dept_Water = 0;
    let dept_Electricity = 0;
    let dept_Waste = 0;
    let dept_Safety = 0;
    let dept_Animals = 0;
    let dept_Environment = 0;
    let dept_Public_Facilities = 0;

    reports.filter(r => r.status === 'Resolved').forEach(r => {
      const dept = r.department;
      if (dept === 'Roads') dept_Roads++;
      else if (dept === 'Water') dept_Water++;
      else if (dept === 'Electricity') dept_Electricity++;
      else if (dept === 'Waste') dept_Waste++;
      else if (dept === 'Safety') dept_Safety++;
      else if (dept === 'Animals') dept_Animals++;
      else if (dept === 'Environment') dept_Environment++;
      else if (dept === 'Public Facilities') dept_Public_Facilities++;
    });

    const stats: UserStats = {
      reportsCount,
      resolvedCount,
      verificationsGiven,
      verificationsReceived,
      commentsGiven,
      commentsReceived,
      escalationsCount,
      afterPhotosCount,
      distinctLocalities,
      impactPoints,
      streakDays,
      badgeCount,
      currentTier,
      dept_Roads,
      dept_Water,
      dept_Electricity,
      dept_Waste,
      dept_Safety,
      dept_Animals,
      dept_Environment,
      dept_Public_Facilities
    };

    // 4. Check Catalog for newly qualified badges
    const newlyEarnedBadgesMap: Record<string, any> = {};
    const unlockedBadges: Badge[] = [];

    BADGES_CATALOG.forEach(badge => {
      // If not already earned, check criteria
      if (!currentEarnedMap[badge.id]) {
        if (badge.criteria(stats)) {
          newlyEarnedBadgesMap[badge.id] = Timestamp.now();
          unlockedBadges.push(badge);
        }
      }
    });

    // 5. Check if Tier changed to generate notification
    const lastTier = userData.previousTier || 'Citizen';
    const tierChanged = currentTier !== lastTier;

    // 6. Save new badges and notifications in a fast atomic batch
    if (unlockedBadges.length > 0 || tierChanged) {
      const batch = writeBatch(db);

      // Award badges on users/{uid}
      if (unlockedBadges.length > 0) {
        batch.update(userRef, {
          earnedBadges: {
            ...currentEarnedMap,
            ...newlyEarnedBadgesMap
          }
        });

        // Write "badge" notification for each unlocked
        unlockedBadges.forEach(b => {
          const notifId = doc(collection(db, 'notifications', uid, 'items')).id;
          const notifRef = doc(db, 'notifications', uid, 'items', notifId);
          batch.set(notifRef, {
            id: notifId,
            type: 'badge',
            message: `Achievement unlocked: ${b.name}!`,
            createdAt: serverTimestamp(),
            read: false,
            badgeId: b.id
          });
        });
      }

      // Write "tier" notification if tier changed
      if (tierChanged) {
        batch.update(userRef, {
          previousTier: currentTier
        });

        const notifId = doc(collection(db, 'notifications', uid, 'items')).id;
        const notifRef = doc(db, 'notifications', uid, 'items', notifId);
        batch.set(notifRef, {
          id: notifId,
          type: 'tier',
          message: `You're now a ${currentTier}!`,
          createdAt: serverTimestamp(),
          read: false
        });
      }

      await batch.commit();
      console.log(`[BadgeService] Successfully awarded ${unlockedBadges.length} badges and checked tier change.`);
    }

  } catch (err) {
    // Fail silently & quietly log as per rules
    console.warn('[BadgeService] Evaluation skipped or deferred:', err);
  }
}

/**
 * Appends a custom general notification safely to notifications/{uid}/items.
 * Failures do not block the caller.
 */
export async function sendNotification(
  uid: string, 
  type: string, 
  message: string, 
  reportId?: string
): Promise<void> {
  if (!uid) return;
  try {
    const batch = writeBatch(db);
    const notifCol = collection(db, 'notifications', uid, 'items');
    const notifId = doc(notifCol).id;
    const notifRef = doc(db, 'notifications', uid, 'items', notifId);

    batch.set(notifRef, {
      id: notifId,
      type,
      message,
      createdAt: serverTimestamp(),
      read: false,
      ...(reportId ? { reportId } : {})
    });

    await batch.commit();
  } catch (err) {
    console.warn('[NotificationService] Failed to send notification (deferred):', err);
  }
}
