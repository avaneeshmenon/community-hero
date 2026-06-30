import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Report, AuthorityAction } from '../types';
import { sendNotification, evaluateAndAwardBadges } from './badgeService';

// Production real-world day-based thresholds (measured from when the report reached Verified, only while unresolved):
export const ESCALATION_THRESHOLDS = {
  STAGE_1: 7,  // 7 days
  STAGE_2: 14, // 14 days
  STAGE_3: 30, // 30 days
};

/**
 * Formats elapsed decimal hours unresolved into a human-friendly duration string.
 */
export function formatHoursUnresolved(hours: number): string {
  const minutes = hours * 60;
  if (minutes < 60) {
    return `${Math.max(1, Math.round(minutes))} minutes`;
  }
  const days = hours / 24;
  if (days >= 1) {
    return `${days.toFixed(1)} days`;
  }
  return `${hours.toFixed(1)} hours`;
}

/**
 * Checks if a report should be escalated to a higher stage based on its age and status.
 */
export function checkShouldEscalate(report: Report): { shouldEscalate: boolean; nextLevel: number; daysUnresolved: number; hoursUnresolvedStr: string } {
  // Only Verified / In Progress reports escalate
  if (report.status !== 'Verified' && report.status !== 'In Progress') {
    return { shouldEscalate: false, nextLevel: 0, daysUnresolved: 0, hoursUnresolvedStr: '' };
  }

  const actions = report.authorityActions || [];
  // Find highest stage currently generated
  const highestAction = actions.reduce((max, act) => act.stage > max ? act.stage : max, -1);

  if (highestAction >= 3) {
    return { shouldEscalate: false, nextLevel: 3, daysUnresolved: 0, hoursUnresolvedStr: '' };
  }

  // Use verifiedAt if present; fall back to createdAt
  const startTimestamp = report.verifiedAt || report.createdAt;
  if (!startTimestamp) {
    return { shouldEscalate: false, nextLevel: 0, daysUnresolved: 0, hoursUnresolvedStr: '' };
  }

  const startDate = typeof startTimestamp.toDate === 'function' ? startTimestamp.toDate() : new Date(startTimestamp as any);
  const now = new Date();
  const msDiff = now.getTime() - startDate.getTime();
  const hoursUnresolved = msDiff / (1000 * 60 * 60);
  const daysUnresolved = hoursUnresolved / 24;

  let targetLevel = 0;
  if (daysUnresolved >= ESCALATION_THRESHOLDS.STAGE_3) {
    targetLevel = 3;
  } else if (daysUnresolved >= ESCALATION_THRESHOLDS.STAGE_2) {
    targetLevel = 2;
  } else if (daysUnresolved >= ESCALATION_THRESHOLDS.STAGE_1) {
    targetLevel = 1;
  }

  const hoursUnresolvedStr = formatHoursUnresolved(hoursUnresolved);

  // We check if targetLevel is higher than the highest stage generated
  const productionShouldEscalate = targetLevel > highestAction;

  // For the deployed demo, DISABLE automatic time-based escalation firing on its own.
  // Demowise, this always returns shouldEscalate: false so reports never auto-escalate unexpectedly.
  // Escalation advances ONLY via the manual "Advance escalation (demo)" button.
  return { 
    shouldEscalate: false, 
    nextLevel: productionShouldEscalate ? targetLevel : highestAction, 
    daysUnresolved, 
    hoursUnresolvedStr 
  };
}

/**
 * Formats a letter body to ensure clean spacing and paragraphs.
 */
export function formatComplaintBody(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // Fix missing space after punctuation if followed by a letter/digit
  cleaned = cleaned.replace(/(\b[a-zA-Z0-9]{2,})\.([A-Z])/g, '$1. $2');
  cleaned = cleaned.replace(/(\b[a-zA-Z0-9]{2,}),([A-Za-z])/g, '$1, $2');
  cleaned = cleaned.replace(/(\b[a-zA-Z0-9]{2,})!([A-Za-z])/g, '$1! $2');
  cleaned = cleaned.replace(/(\b[a-zA-Z0-9]{2,})\?([A-Z])/g, '$1? $2');

  cleaned = cleaned.replace(/([a-zA-Z0-9]+)On behalf of/g, '$1\nOn behalf of');
  cleaned = cleaned.replace(/(Dear\s+)?(Sir\/Madam|Sir|Madam|To\s+Whom\s+It\s+May\s+Concern),\s*([a-zA-Z0-9])/gi, '$1$2,\n\n$3');
  cleaned = cleaned.replace(/([^\n])\s*(Sincerely|Regards|Yours\s+faithfully|Yours\s+sincerely|Yours\s+truly),/gi, '$1\n\n$2,');
  cleaned = cleaned.replace(/(Sincerely|Regards|Yours\s+faithfully|Yours\s+sincerely|Yours\s+truly),\s*([a-zA-Z0-9])/gi, '$1,\n\n$2');

  if (!cleaned.includes('\n\n')) {
    if (cleaned.includes('\n')) {
      cleaned = cleaned.replace(/\n/g, '\n\n');
    } else {
      const sentences = cleaned.split(/(?<=[.!?])\s+/);
      if (sentences.length > 3) {
        let paragraphs: string[] = [];
        let currentPara: string[] = [];
        for (let i = 0; i < sentences.length; i++) {
          currentPara.push(sentences[i]);
          const nextSentence = sentences[i + 1] || '';
          const isTransition = /^(Therefore|We|Please|Furthermore|Additionally|However|Thank\s+you|Sincerely)/i.test(nextSentence);
          if (currentPara.length >= 3 || isTransition || i === sentences.length - 1) {
            paragraphs.push(currentPara.join(' '));
            currentPara = [];
          }
        }
        cleaned = paragraphs.join('\n\n');
      }
    }
  }

  cleaned = cleaned.replace(/(Sincerely|Regards|Yours\s+faithfully|Yours\s+sincerely|Yours\s+truly),\n([^\n]+)/gi, '$1,\n\n$2');
  cleaned = cleaned.replace(/\n*On behalf of/gi, '\nOn behalf of');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Generates an escalation trail step (Stage 0 to 3) for a report.
 */
export async function generateEscalationTrailStep(report: Report, stage: number, userId: string): Promise<AuthorityAction> {
  const actions = report.authorityActions || [];
  
  // Guard if this stage already exists
  const existingAction = actions.find(a => a.stage === stage);
  if (existingAction) {
    return existingAction;
  }

  // Calculate days unresolved
  const startTimestamp = report.verifiedAt || report.createdAt;
  let calculatedDays = 0;
  if (startTimestamp) {
    const startDate = typeof startTimestamp.toDate === 'function' ? startTimestamp.toDate() : new Date(startTimestamp as any);
    const msDiff = new Date().getTime() - startDate.getTime();
    calculatedDays = Number((msDiff / (1000 * 60 * 60 * 24)).toFixed(1));
  }

  // Grab previous actions reference ID if any (to keep the trail unified)
  const prevAction = actions.find(a => a.stage === 0);
  let referenceId = prevAction?.referenceId || '';
  if (!referenceId) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    referenceId = `CH-${datePart}-${randomPart}`;
  }

  const response = await fetch('/api/generate-escalation-trail', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      stage,
      title: report.title,
      description: report.description,
      department: report.department || 'General',
      subcategory: report.subcategory || 'Other',
      severity: report.severity || 'Medium',
      priorityScore: report.priorityScore || 50,
      locality: report.locality || 'Local Ward',
      daysUnresolved: calculatedDays,
      previousActions: actions
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Server failed to generate stage ${stage} escalation step.`);
  }

  const result = await response.json();
  const formattedBody = formatComplaintBody(result.body);

  const newAction: AuthorityAction = {
    stage,
    authorityName: result.authorityName,
    subject: result.subject,
    body: formattedBody,
    referenceId,
    generatedAt: new Date().toISOString(),
    daysUnresolved: calculatedDays
  };

  if (stage === 0) {
    newAction.dispatchStatus = 'Drafted';
  }

  // Persist update in Firestore
  const reportRef = doc(db, 'reports', report.id);
  const updatedActions = [...actions];
  const existingIdx = updatedActions.findIndex(a => a.stage === stage);
  if (existingIdx !== -1) {
    updatedActions[existingIdx] = newAction;
  } else {
    updatedActions.push(newAction);
  }
  updatedActions.sort((a, b) => a.stage - b.stage);

  await updateDoc(reportRef, {
    authorityActions: updatedActions
  });

  if (report.createdBy) {
    if (stage === 0) {
      sendNotification(
        report.createdBy,
        'complaint',
        `A formal complaint draft was generated for your report: "${report.title || ''}".`,
        report.id
      ).catch(() => {});
    } else if (stage > 0) {
      sendNotification(
        report.createdBy,
        'escalate',
        `Your report "${report.title || ''}" has been escalated to Stage ${stage} (${newAction.authorityName || 'Authority'}).`,
        report.id
      ).catch(() => {});
    }
    evaluateAndAwardBadges(report.createdBy).catch(() => {});
  }

  return newAction;
}

/**
 * Marks Stage 0 as Dispatched.
 */
export async function markStage0Dispatched(reportId: string, currentActions: AuthorityAction[]): Promise<AuthorityAction[]> {
  const updatedActions = currentActions.map(action => {
    if (action.stage === 0) {
      return {
        ...action,
        dispatchStatus: 'Dispatched' as const,
        dispatchedAt: new Date().toISOString()
      };
    }
    return action;
  });

  const reportRef = doc(db, 'reports', reportId);
  await updateDoc(reportRef, {
    authorityActions: updatedActions
  });

  return updatedActions;
}
