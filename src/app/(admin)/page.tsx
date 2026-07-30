'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import LeadStats from '@/components/leads/LeadStats';
import LeadsTable from '@/components/leads/LeadsTable';
import { useLeads } from '@/context/LeadsContext';

const RECENT_LIMIT = 5;

export default function DashboardPage() {
  const { leads } = useLeads();

  const recentLeads = useMemo(
    () =>
      [...leads]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, RECENT_LIMIT),
    [leads],
  );

  return (
    <div>
      <PageBreadcrumb pageTitle="Dashboard" />

      <LeadStats />

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Recent leads
          </h3>
          <Link
            href="/crm"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 transition hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300"
          >
            Go to CRM
          </Link>
        </div>

        <LeadsTable
          leads={recentLeads}
          emptyMessage="No leads yet — head to the CRM page to add your first one."
        />
      </div>
    </div>
  );
}
