'use client';

import React, { useState } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import Label from '../form/Label';
import Input from '../form/input/InputField';
import TextArea from '../form/input/TextArea';
import { LeadDraft } from '@/context/LeadsContext';

type LeadFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: LeadDraft) => void;
  /** Drives the heading and the submit label. Defaults to adding. */
  mode?: 'add' | 'edit';
  /** Starting values in edit mode. */
  initialDraft?: LeadDraft;
};

export const EMPTY_DRAFT: LeadDraft = {
  company: '',
  contact: '',
  title: '',
  notes: '',
  research: '',
};

/**
 * Mirrors the `StringConstraints` on `LeadCreate` in `backend/app/schemas.py`.
 * Enforcing them here is what stops the form from cheerfully accepting a long
 * paste, closing, and only then getting a 422 back with the text gone.
 */
const MAX_LENGTH: Record<keyof LeadDraft, number> = {
  company: 200,
  contact: 200,
  title: 200,
  notes: 500,
  research: 5000,
};

const COPY = {
  add: {
    heading: 'Add lead',
    blurb:
      'Company and contact are required. Everything else can be filled in later.',
    submit: 'Save lead',
  },
  edit: {
    heading: 'Edit lead',
    blurb: 'Update any field. Company and contact still have to be filled in.',
    submit: 'Save changes',
  },
} as const;

/**
 * One form for both adding and editing.
 *
 * The fields are fully controlled. They used to be a mix — text inputs on
 * `defaultValue`, the textarea on `value` — which worked only because the modal
 * always opened blank; prefilling for an edit needs `value` throughout.
 *
 * `useState(initialDraft)` only initialises once per mount, and `Modal` unmounts
 * its children rather than this component — so callers must pass a `key` that
 * changes on **every open**, not just when the target lead changes. Keying on
 * the lead id alone leaves stale text in the fields when the same row is edited
 * twice in a row, and saving then writes the first edit back over the second.
 */
export default function LeadFormModal({
  isOpen,
  onClose,
  onSave,
  mode = 'add',
  initialDraft = EMPTY_DRAFT,
}: LeadFormModalProps) {
  const [draft, setDraft] = useState<LeadDraft>(initialDraft);
  const [showErrors, setShowErrors] = useState(false);
  const copy = COPY[mode];

  const reset = () => {
    setDraft(initialDraft);
    setShowErrors(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const set = (field: keyof LeadDraft) => (value: string) =>
    setDraft((prev) => ({ ...prev, [field]: value }));

  const missingCompany = draft.company.trim() === '';
  const missingContact = draft.contact.trim() === '';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    // The API enforces this too — this half is only here so the message appears
    // instantly, without a round trip.
    if (missingCompany || missingContact) {
      setShowErrors(true);
      return;
    }

    onSave({
      company: draft.company.trim(),
      contact: draft.contact.trim(),
      title: draft.title.trim(),
      notes: draft.notes.trim(),
      research: draft.research.trim(),
    });
    reset();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      className="max-w-[600px] m-4 sm:m-0"
    >
      <form onSubmit={handleSubmit} className="p-6 sm:p-8">
        <h4 className="mb-1 text-xl font-semibold text-gray-800 dark:text-white/90">
          {copy.heading}
        </h4>
        <p className="mb-6 text-gray-500 text-theme-sm dark:text-gray-400">
          {copy.blurb}
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="company">Company name</Label>
            <Input
              id="company"
              placeholder="Acme Corp"
              maxLength={MAX_LENGTH.company}
              value={draft.company}
              onChange={(e) => set('company')(e.target.value)}
              error={showErrors && missingCompany}
              hint={
                showErrors && missingCompany ? 'Company name is required' : ''
              }
            />
          </div>

          <div>
            <Label htmlFor="contact">Contact name</Label>
            <Input
              id="contact"
              placeholder="Jane Rivera"
              maxLength={MAX_LENGTH.contact}
              value={draft.contact}
              onChange={(e) => set('contact')(e.target.value)}
              error={showErrors && missingContact}
              hint={
                showErrors && missingContact ? 'Contact name is required' : ''
              }
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="VP of Sales"
              maxLength={MAX_LENGTH.title}
              value={draft.title}
              onChange={(e) => set('title')(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              placeholder="Met at SaaStr, interested in Q3 rollout"
              maxLength={MAX_LENGTH.notes}
              value={draft.notes}
              onChange={(e) => set('notes')(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="research">Research notes</Label>
            <TextArea
              id="research"
              rows={4}
              placeholder="Paste whatever you found — funding, headcount, tools they use…"
              maxLength={MAX_LENGTH.research}
              value={draft.research}
              onChange={set('research')}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            {copy.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
