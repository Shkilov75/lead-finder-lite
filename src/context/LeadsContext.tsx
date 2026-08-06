'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, leadsApi, type LeadPatch } from '@/lib/api';

/**
 * The pipeline, in order. Statuses advance left to right and wrap back to the
 * start, so a mis-click can always be corrected by clicking around again.
 *
 * The server holds the same order twice over — as `LEAD_STATUSES` in
 * `backend/app/db.py` (which also becomes the table's CHECK constraint) and as
 * `NEXT_STATUS` in `backend/app/repository.py`. Advancing is a server decision;
 * `nextStatus` below only predicts it, for the optimistic update and the badge's
 * tooltip.
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

export function nextStatus(status: LeadStatus): LeadStatus {
  const index = LEAD_STATUSES.indexOf(status);
  return LEAD_STATUSES[(index + 1) % LEAD_STATUSES.length];
}

/**
 * Prefix for the placeholder row an optimistic `addLead` shows while the POST is
 * still in flight. The server has never heard of that id, so the other mutations
 * refuse to act on it rather than sending a request that can only 404.
 */
const TEMP_PREFIX = 'temp-';

function tempId(): string {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : String(Date.now());
  return `${TEMP_PREFIX}${suffix}`;
}

function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX);
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

type LeadsContextType = {
  leads: Lead[];
  /** False until the first load from the API has settled, succeed or fail. */
  isLoaded: boolean;
  counts: Record<LeadStatus, number>;
  /** Last failure, for the banner. Null when everything is fine. */
  error: string | null;
  /** Resolves false if the save failed, so the form can hand the draft back. */
  addLead: (draft: LeadDraft) => Promise<boolean>;
  updateLead: (id: string, patch: LeadPatch) => Promise<boolean>;
  advanceStatus: (id: string) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  /** Re-reads the list from the API — what the banner's Retry button calls. */
  refresh: () => Promise<void>;
  dismissError: () => void;
};

const LeadsContext = createContext<LeadsContextType | undefined>(undefined);

export const LeadsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Starts empty so the server-rendered markup matches the first client render;
  // the real list arrives from the API in the effect below.
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors `leads` for the mutation handlers. Each one needs the row exactly as
  // it was before its optimistic edit, so it can put that row back if the request
  // fails — and reading it from here keeps the `setLeads` updaters pure, which
  // capturing it inside an updater would not.
  const leadsRef = useRef<Lead[]>([]);
  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  /**
   * In-flight mutations, per row.
   *
   * Two clicks on the same status badge start two requests, and they can answer
   * out of order — applying whichever lands last would leave the table a step
   * behind the database. So each request takes a sequence number and only the
   * newest one for that row is allowed to touch it.
   *
   * `baseline` is the row as it stood before the first request of the burst,
   * which is what a failure has to restore: the row currently on screen already
   * carries the optimistic edits being rolled back.
   */
  const rowRequests = useRef(
    new Map<string, { latest: number; inFlight: number; baseline: Lead }>(),
  );

  const beginRowRequest = useCallback((id: string, current: Lead): number => {
    const entry = rowRequests.current.get(id);
    if (!entry) {
      rowRequests.current.set(id, { latest: 1, inFlight: 1, baseline: current });
      return 1;
    }
    entry.latest += 1;
    entry.inFlight += 1;
    return entry.latest;
  }, []);

  const endRowRequest = useCallback(
    (id: string, seq: number): { isLatest: boolean; baseline: Lead } | null => {
      const entry = rowRequests.current.get(id);
      if (!entry) return null;

      const result = { isLatest: seq === entry.latest, baseline: entry.baseline };
      entry.inFlight -= 1;
      // The baseline has to outlive the stragglers, so it is only dropped once
      // every request for the row has settled.
      if (entry.inFlight <= 0) rowRequests.current.delete(id);
      return result;
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const fetched = await leadsApi.list();
      setLeads(fetched);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause, 'Could not load leads.'));
    } finally {
      // Set even on failure: leaving this false would strand the table on
      // "Loading leads…" forever with no way to say what went wrong.
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    // The API can only be called from the client. Doing it in a lazy useState
    // initializer instead would be both impossible (it is async) and wrong, so
    // the read has to happen here — the one case the lint rule can't model.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const addLead = useCallback(async (draft: LeadDraft) => {
    const placeholder: Lead = {
      ...draft,
      id: tempId(),
      status: 'New',
      createdAt: new Date().toISOString().slice(0, 10),
    };

    // Newest first so a freshly added lead is visible without scrolling.
    setLeads((prev) => [placeholder, ...prev]);

    try {
      const saved = await leadsApi.create(draft);
      // Swap the placeholder for the server's row — same position, real id.
      setLeads((prev) =>
        prev.map((lead) => (lead.id === placeholder.id ? saved : lead)),
      );
      setError(null);
      return true;
    } catch (cause) {
      setLeads((prev) => prev.filter((lead) => lead.id !== placeholder.id));
      setError(messageFor(cause, 'Could not save the lead.'));
      return false;
    }
  }, []);

  const updateLead = useCallback(
    async (id: string, patch: LeadPatch) => {
      if (isTempId(id)) {
        setError('That lead is still being saved. Try again in a moment.');
        return false;
      }

      const current = leadsRef.current.find((lead) => lead.id === id);
      if (!current) return false;

      const seq = beginRowRequest(id, current);
      setLeads((prev) =>
        prev.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)),
      );

      try {
        const saved = await leadsApi.update(id, patch);
        if (endRowRequest(id, seq)?.isLatest) {
          setLeads((prev) => prev.map((lead) => (lead.id === id ? saved : lead)));
          setError(null);
        }
        return true;
      } catch (cause) {
        const settled = endRowRequest(id, seq);
        if (settled?.isLatest) {
          // Only the fields this patch touched go back. Restoring the whole row
          // would also undo a status advance that succeeded in the meantime.
          const reverted = Object.fromEntries(
            Object.keys(patch).map((field) => [
              field,
              settled.baseline[field as keyof Lead],
            ]),
          ) as Partial<Lead>;
          setLeads((prev) =>
            prev.map((lead) => (lead.id === id ? { ...lead, ...reverted } : lead)),
          );
        }
        setError(messageFor(cause, 'Could not save the changes.'));
        return false;
      }
    },
    [beginRowRequest, endRowRequest],
  );

  const advanceStatus = useCallback(
    async (id: string) => {
      if (isTempId(id)) {
        setError('That lead is still being saved. Try again in a moment.');
        return;
      }

      const current = leadsRef.current.find((lead) => lead.id === id);
      if (!current) return;

      const seq = beginRowRequest(id, current);
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === id ? { ...lead, status: nextStatus(lead.status) } : lead,
        ),
      );

      try {
        const saved = await leadsApi.advance(id);
        if (endRowRequest(id, seq)?.isLatest) {
          setLeads((prev) => prev.map((lead) => (lead.id === id ? saved : lead)));
          setError(null);
        }
      } catch (cause) {
        const settled = endRowRequest(id, seq);
        if (settled?.isLatest) {
          setLeads((prev) =>
            prev.map((lead) =>
              lead.id === id
                ? { ...lead, status: settled.baseline.status }
                : lead,
            ),
          );
        }
        setError(messageFor(cause, 'Could not move the lead along.'));
      }
    },
    [beginRowRequest, endRowRequest],
  );

  const deleteLead = useCallback(async (id: string) => {
    if (isTempId(id)) {
      setError('That lead is still being saved. Try again in a moment.');
      return;
    }

    const index = leadsRef.current.findIndex((lead) => lead.id === id);
    if (index === -1) return;
    const removed = leadsRef.current[index];
    // The row that followed it. An id survives the list changing underneath us;
    // a numeric index captured now would put the row back in the wrong place.
    const anchorId = leadsRef.current[index + 1]?.id ?? null;

    setLeads((prev) => prev.filter((lead) => lead.id !== id));

    try {
      await leadsApi.remove(id);
      setError(null);
    } catch (cause) {
      // Back to where it was, not to the top — the row should reappear under
      // the cursor that tried to delete it.
      setLeads((prev) => {
        if (prev.some((lead) => lead.id === id)) return prev;
        const anchor = anchorId
          ? prev.findIndex((lead) => lead.id === anchorId)
          : -1;
        const at = anchor === -1 ? prev.length : anchor;
        return [...prev.slice(0, at), removed, ...prev.slice(at)];
      });
      setError(messageFor(cause, 'Could not delete the lead.'));
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

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
    () => ({
      leads,
      isLoaded,
      counts,
      error,
      addLead,
      updateLead,
      advanceStatus,
      deleteLead,
      refresh: load,
      dismissError,
    }),
    [
      leads,
      isLoaded,
      counts,
      error,
      addLead,
      updateLead,
      advanceStatus,
      deleteLead,
      load,
      dismissError,
    ],
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
