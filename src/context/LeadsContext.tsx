'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

/**
 * The pipeline, in order. Statuses advance left to right and wrap back to the
 * start, so a mis-click can always be corrected by clicking around again.
 */
export const LEAD_STATUSES = ['New', 'Contacted', 'Replied', 'Closed'] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type Lead = {
  id: string;
  company: string;
  contact: string;
  title: string;
  /** One-line note about the lead. */
  notes: string;
  /** Free-form research pasted in by hand — no scraping or enrichment. */
  research: string;
  status: LeadStatus;
  /** ISO date string (yyyy-mm-dd) for when the lead was added. */
  createdAt: string;
};

export type LeadDraft = Omit<Lead, 'id' | 'status' | 'createdAt'>;

const STORAGE_KEY = 'lead-finder-lite:leads';

const SEED_LEADS: Lead[] = [
  {
    id: 'seed-acme',
    company: 'Acme Corp',
    contact: 'Jane Rivera',
    title: 'VP of Sales',
    notes: 'Met at SaaStr, interested in Q3 rollout',
    research: 'Series B, ~120 employees, uses HubSpot today',
    status: 'Contacted',
    createdAt: '2026-07-20',
  },
  {
    id: 'seed-northwind',
    company: 'Northwind Traders',
    contact: 'Sam Okafor',
    title: 'Head of Ops',
    notes: 'Cold outreach via LinkedIn',
    research: '',
    status: 'New',
    createdAt: '2026-07-24',
  },
  {
    id: 'seed-globex',
    company: 'Globex',
    contact: 'Priya Nair',
    title: 'Director of Growth',
    notes: 'Replied asking for pricing',
    research: 'Recently raised Series A, hiring 3 SDRs',
    status: 'Replied',
    createdAt: '2026-07-15',
  },
];

export function nextStatus(status: LeadStatus): LeadStatus {
  const index = LEAD_STATUSES.indexOf(status);
  return LEAD_STATUSES[(index + 1) % LEAD_STATUSES.length];
}

function isLead(value: unknown): value is Lead {
  if (typeof value !== 'object' || value === null) return false;
  const lead = value as Record<string, unknown>;
  return (
    typeof lead.id === 'string' &&
    typeof lead.company === 'string' &&
    typeof lead.contact === 'string' &&
    typeof lead.title === 'string' &&
    typeof lead.notes === 'string' &&
    typeof lead.research === 'string' &&
    typeof lead.createdAt === 'string' &&
    LEAD_STATUSES.includes(lead.status as LeadStatus)
  );
}

/**
 * Why this is a tagged union rather than `Lead[] | null`: "nothing saved yet"
 * and "saved, but the rows no longer validate" both used to collapse to an
 * empty array. The seed fallback then couldn't fire, and the persist effect
 * overwrote the stored value with `[]` — deleting every saved lead. Adding a
 * required field to `Lead` and `isLead` was enough to trigger it, which is the
 * first thing the README tells a contributor to do.
 *
 * A legitimately empty list still has to stay empty: deleting your last lead
 * and reloading must not re-seed the examples. Only `missing` seeds.
 */
type StoredLeads =
  | { kind: 'missing' }
  | { kind: 'unreadable'; raw: string }
  | { kind: 'ok'; leads: Lead[]; dropped: number; raw: string };

function readStoredLeads(): StoredLeads {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { kind: 'missing' };
  }
  if (!raw) return { kind: 'missing' };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { kind: 'unreadable', raw };
    const leads = parsed.filter(isLead);
    return { kind: 'ok', leads, dropped: parsed.length - leads.length, raw };
  } catch {
    return { kind: 'unreadable', raw };
  }
}

/**
 * Copies the previous stored value aside before anything overwrites it, so a
 * shape change or hand-edit is recoverable instead of silently destructive.
 */
function backupRawLeads(raw: string, reason: string) {
  const key = `${STORAGE_KEY}:backup`;
  try {
    window.localStorage.setItem(key, raw);
    console.warn(
      `[lead-finder-lite] ${reason}. Previous value copied to "${key}".`,
    );
  } catch {
    console.warn(
      `[lead-finder-lite] ${reason}, and the backup could not be written. Previous value: ${raw}`,
    );
  }
}

function resolveInitialLeads(stored: StoredLeads): Lead[] {
  switch (stored.kind) {
    case 'missing':
      return SEED_LEADS;
    case 'unreadable':
      backupRawLeads(stored.raw, 'Stored leads could not be parsed');
      return SEED_LEADS;
    case 'ok':
      if (stored.dropped > 0) {
        backupRawLeads(
          stored.raw,
          `${stored.dropped} stored lead(s) did not match the current shape and were dropped`,
        );
      }
      return stored.leads;
  }
}

type LeadsContextType = {
  leads: Lead[];
  /** False until localStorage has been read on the client. */
  isLoaded: boolean;
  counts: Record<LeadStatus, number>;
  addLead: (draft: LeadDraft) => void;
  advanceStatus: (id: string) => void;
  deleteLead: (id: string) => void;
};

const LeadsContext = createContext<LeadsContextType | undefined>(undefined);

export const LeadsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Starts empty so the server-rendered markup matches the first client render;
  // the real list arrives from localStorage in the effect below.
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // localStorage can only be read on the client. Doing it in a lazy useState
    // initializer instead would make the first client render disagree with the
    // server-rendered HTML and trip a hydration error, so the read has to
    // happen here — the one case react-hooks/set-state-in-effect can't model.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeads(resolveInitialLeads(readStoredLeads()));
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
    } catch {
      // Storage can be full or blocked (private mode) — the app still works
      // for this session, it just won't survive a reload.
    }
  }, [leads, isLoaded]);

  const addLead = useCallback((draft: LeadDraft) => {
    const lead: Lead = {
      ...draft,
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `lead-${Date.now()}`,
      status: 'New',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    // Newest first so a freshly added lead is visible without scrolling.
    setLeads((prev) => [lead, ...prev]);
  }, []);

  const advanceStatus = useCallback((id: string) => {
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === id ? { ...lead, status: nextStatus(lead.status) } : lead,
      ),
    );
  }, []);

  const deleteLead = useCallback((id: string) => {
    setLeads((prev) => prev.filter((lead) => lead.id !== id));
  }, []);

  const counts = useMemo(() => {
    const initial = Object.fromEntries(
      LEAD_STATUSES.map((status) => [status, 0]),
    ) as Record<LeadStatus, number>;
    return leads.reduce((acc, lead) => {
      acc[lead.status] += 1;
      return acc;
    }, initial);
  }, [leads]);

  const value = useMemo(
    () => ({ leads, isLoaded, counts, addLead, advanceStatus, deleteLead }),
    [leads, isLoaded, counts, addLead, advanceStatus, deleteLead],
  );

  return (
    <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>
  );
};

export const useLeads = () => {
  const context = useContext(LeadsContext);
  if (!context) {
    throw new Error('useLeads must be used within a LeadsProvider');
  }
  return context;
};
