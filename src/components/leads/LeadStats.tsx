'use client';

import React from 'react';
import { LEAD_STATUSES, useLeads } from '@/context/LeadsContext';
import StatusPill from './StatusPill';

function StatCard({
  label,
  value,
}: {
  label: React.ReactNode;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex items-center h-6">{label}</div>
      <h4 className="mt-3 font-bold text-gray-800 text-title-sm dark:text-white/90">
        {value}
      </h4>
    </div>
  );
}

export default function LeadStats() {
  const { leads, counts } = useLeads();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-5">
      <StatCard
        label={
          <span className="text-gray-500 text-theme-sm dark:text-gray-400">
            Total leads
          </span>
        }
        value={leads.length}
      />
      {LEAD_STATUSES.map((status) => (
        <StatCard
          key={status}
          label={<StatusPill status={status} />}
          value={counts[status]}
        />
      ))}
    </div>
  );
}
