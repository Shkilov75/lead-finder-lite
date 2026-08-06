'use client';

import React from 'react';
import { AlertIcon } from '@/icons';
import { useLeads } from '@/context/LeadsContext';

/**
 * Surfaces whatever the last API call failed with.
 *
 * Mutations are optimistic: the table updates on click and the request follows.
 * When one fails the change is rolled back, and without this banner that rollback
 * would look like the click simply not registering.
 */
export default function LeadsErrorBanner() {
  const { error, refresh, dismissError } = useLeads();

  if (!error) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 p-4 mb-6 border rounded-2xl border-error-500/30 bg-error-50 dark:border-error-500/30 dark:bg-error-500/10"
    >
      <span className="text-error-500 shrink-0">
        <AlertIcon className="size-5" />
      </span>

      <div className="flex-1 min-w-[12rem]">
        <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
          Something went wrong
        </p>
        <p className="mt-0.5 text-gray-600 text-theme-sm dark:text-gray-300">
          {error}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void refresh()}
          className="px-3 py-2 font-medium text-white rounded-lg bg-error-500 text-theme-sm transition hover:bg-error-600 focus:outline-hidden focus-visible:ring-3 focus-visible:ring-error-500/30"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={dismissError}
          className="px-3 py-2 font-medium text-gray-600 rounded-lg text-theme-sm transition hover:bg-error-500/10 dark:text-gray-300 focus:outline-hidden focus-visible:ring-3 focus-visible:ring-error-500/30"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
