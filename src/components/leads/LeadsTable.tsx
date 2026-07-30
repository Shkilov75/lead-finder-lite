'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '../ui/table';
import { TrashBinIcon } from '@/icons';
import { Lead, useLeads } from '@/context/LeadsContext';
import { formatLeadDate } from '@/lib/format';
import StatusPill from './StatusPill';

const COLUMNS = [
  'Company',
  'Contact',
  'Notes',
  'Research notes',
  'Added',
  'Status',
] as const;

/** Data columns plus the unlabelled actions column. */
const FULL_ROW_SPAN = COLUMNS.length + 1;

type LeadsTableProps = {
  leads: Lead[];
  /** Shown when the list is empty and loading has finished. */
  emptyMessage?: string;
};

export default function LeadsTable({
  leads,
  emptyMessage = 'No leads yet — add your first one to get started.',
}: LeadsTableProps) {
  const { isLoaded, advanceStatus, deleteLead } = useLeads();

  return (
    <div className="max-w-full overflow-x-auto">
      <Table>
        <TableHeader className="border-y border-gray-100 dark:border-gray-800">
          <TableRow>
            {COLUMNS.map((column) => (
              <TableCell
                key={column}
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {column}
              </TableCell>
            ))}
            <TableCell
              isHeader
              className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
            >
              <span className="sr-only">Actions</span>
            </TableCell>
          </TableRow>
        </TableHeader>

        <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
          {!isLoaded && (
            <TableRow>
              <TableCell
                colSpan={FULL_ROW_SPAN}
                className="px-5 py-8 text-gray-500 text-theme-sm dark:text-gray-400"
              >
                Loading leads…
              </TableCell>
            </TableRow>
          )}

          {isLoaded && leads.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={FULL_ROW_SPAN}
                className="px-5 py-8 text-gray-500 text-theme-sm dark:text-gray-400"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}

          {isLoaded &&
            leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="px-5 py-4 font-medium text-gray-800 text-theme-sm dark:text-white/90">
                  {lead.company}
                </TableCell>

                <TableCell className="px-5 py-4 text-start">
                  <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">
                    {lead.contact}
                  </span>
                  {lead.title && (
                    <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                      {lead.title}
                    </span>
                  )}
                </TableCell>

                <TableCell className="px-5 py-4 max-w-xs text-gray-500 text-theme-sm dark:text-gray-400">
                  {lead.notes || '—'}
                </TableCell>

                <TableCell className="px-5 py-4 max-w-xs text-gray-500 text-theme-sm dark:text-gray-400">
                  {lead.research || '—'}
                </TableCell>

                <TableCell className="px-5 py-4 whitespace-nowrap text-gray-500 text-theme-sm dark:text-gray-400">
                  {formatLeadDate(lead.createdAt)}
                </TableCell>

                <TableCell className="px-5 py-4">
                  <StatusPill
                    status={lead.status}
                    onAdvance={() => advanceStatus(lead.id)}
                  />
                </TableCell>

                <TableCell className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => deleteLead(lead.id)}
                    title={`Delete ${lead.company}`}
                    aria-label={`Delete ${lead.company}`}
                    className="text-gray-400 transition hover:text-error-500 focus:outline-hidden focus-visible:ring-3 focus-visible:ring-error-500/30 rounded-md"
                  >
                    <TrashBinIcon />
                  </button>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
