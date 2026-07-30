'use client';

import React, { useState } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import Label from '../form/Label';
import Input from '../form/input/InputField';
import TextArea from '../form/input/TextArea';
import { LeadDraft } from '@/context/LeadsContext';

type AddLeadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: LeadDraft) => void;
};

const EMPTY_DRAFT: LeadDraft = {
  company: '',
  contact: '',
  title: '',
  notes: '',
  research: '',
};

export default function AddLeadModal({
  isOpen,
  onClose,
  onSave,
}: AddLeadModalProps) {
  const [draft, setDraft] = useState<LeadDraft>(EMPTY_DRAFT);
  const [showErrors, setShowErrors] = useState(false);

  // Modal unmounts its children when closed, so the inputs remount blank on the
  // next open; this only has to reset the state that lives out here.
  const reset = () => {
    setDraft(EMPTY_DRAFT);
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
          Add lead
        </h4>
        <p className="mb-6 text-gray-500 text-theme-sm dark:text-gray-400">
          Company and contact are required. Everything else can be filled in
          later.
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="company">Company name</Label>
            <Input
              id="company"
              placeholder="Acme Corp"
              defaultValue={draft.company}
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
              defaultValue={draft.contact}
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
              defaultValue={draft.title}
              onChange={(e) => set('title')(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              placeholder="Met at SaaStr, interested in Q3 rollout"
              defaultValue={draft.notes}
              onChange={(e) => set('notes')(e.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="research">Research notes</Label>
            <TextArea
              id="research"
              rows={4}
              placeholder="Paste whatever you found — funding, headcount, tools they use…"
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
            Save lead
          </Button>
        </div>
      </form>
    </Modal>
  );
}
