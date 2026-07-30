'use client';

import React from 'react';
import Badge from '../ui/badge/Badge';
import { LeadStatus, nextStatus } from '@/context/LeadsContext';

/** Pipeline stage → Badge colour. */
const STATUS_COLOR: Record<
  LeadStatus,
  'light' | 'info' | 'warning' | 'success'
> = {
  New: 'light',
  Contacted: 'info',
  Replied: 'warning',
  Closed: 'success',
};

type StatusPillProps = {
  status: LeadStatus;
  /** Omit to render a non-interactive pill. */
  onAdvance?: () => void;
};

export default function StatusPill({ status, onAdvance }: StatusPillProps) {
  const badge = (
    <Badge size="sm" color={STATUS_COLOR[status]}>
      {status}
    </Badge>
  );

  if (!onAdvance) return badge;

  return (
    <button
      type="button"
      onClick={onAdvance}
      title={`Click to move to ${nextStatus(status)}`}
      aria-label={`Status ${status}. Click to move to ${nextStatus(status)}`}
      className="rounded-full transition hover:opacity-80 focus:outline-hidden focus-visible:ring-3 focus-visible:ring-brand-500/30"
    >
      {badge}
    </button>
  );
}
