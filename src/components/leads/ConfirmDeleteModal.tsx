'use client';

import React from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import { Lead } from '@/context/LeadsContext';

type ConfirmDeleteModalProps = {
  /**
   * The row awaiting confirmation, or `null` when nothing is pending. Holding
   * the lead itself rather than a boolean is what lets the copy name the row —
   * the trash icons sit one next to the other down the table, and "Delete this
   * lead?" would not tell you which one you actually hit.
   */
  lead: Lead | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * The confirm step in front of `deleteLead`.
 *
 * Deleting is the one action here with no way back: status advances wrap
 * `Closed → New`, and an edit can be retyped, but a deleted lead is gone from
 * the database and the row's research notes with it.
 *
 * `window.confirm` would have been shorter, but it is unstyled, ignores dark
 * mode, and blocks the whole tab — including the optimistic update this app
 * relies on. Composing `Modal` keeps it consistent with `LeadFormModal`.
 */
export default function ConfirmDeleteModal({
  lead,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  return (
    <Modal
      isOpen={lead !== null}
      onClose={onCancel}
      className="max-w-[480px] m-4 sm:m-0"
    >
      {/*
        `alertdialog` rather than `dialog`: this interrupts the user to confirm
        a consequence, which is what screen readers announce differently.
      */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-heading"
        aria-describedby="confirm-delete-body"
        className="p-6 sm:p-8"
      >
        <h4
          id="confirm-delete-heading"
          className="mb-1 text-xl font-semibold text-gray-800 dark:text-white/90"
        >
          Delete lead?
        </h4>
        <p
          id="confirm-delete-body"
          className="mb-6 text-gray-500 text-theme-sm dark:text-gray-400"
        >
          <span className="font-medium text-gray-800 dark:text-white/90">
            {lead?.company}
          </span>{' '}
          ({lead?.contact}) will be removed, along with its research notes. This
          cannot be undone.
        </p>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Delete lead
          </Button>
        </div>
      </div>
    </Modal>
  );
}
