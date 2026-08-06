'use client';

import React, { useState } from 'react';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import Button from '@/components/ui/button/Button';
import LeadFormModal from '@/components/leads/LeadFormModal';
import LeadsErrorBanner from '@/components/leads/LeadsErrorBanner';
import LeadsTable from '@/components/leads/LeadsTable';
import { PlusIcon } from '@/icons';
import { useModal } from '@/hooks/useModal';
import { Lead, LeadDraft, useLeads } from '@/context/LeadsContext';

function toDraft(lead: Lead): LeadDraft {
  const { company, contact, title, notes, research } = lead;
  return { company, contact, title, notes, research };
}

export default function CrmPage() {
  const { leads, addLead, updateLead } = useLeads();
  const { isOpen, openModal, closeModal } = useModal();
  // Null means the modal is adding rather than editing.
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  // Set when a save failed, so the form comes back with the text still in it.
  const [recoveredDraft, setRecoveredDraft] = useState<LeadDraft | null>(null);
  // Bumped on every open. The form keys off this, so it remounts — and picks up
  // its starting values — even when the same lead is edited twice in a row.
  const [formKey, setFormKey] = useState(0);

  const openForm = (lead: Lead | null, draft: LeadDraft | null = null) => {
    setEditingLead(lead);
    setRecoveredDraft(draft);
    setFormKey((key) => key + 1);
    openModal();
  };

  const handleSave = async (draft: LeadDraft) => {
    // The modal closes straight away and the table updates optimistically. If
    // the request then fails the row is rolled back, and without this the typed
    // draft would be gone with it — so the form reopens holding the same text,
    // alongside the banner explaining what happened.
    const saved = editingLead
      ? await updateLead(editingLead.id, draft)
      : await addLead(draft);

    if (!saved) openForm(editingLead, draft);
  };

  return (
    <div>
      <PageBreadcrumb pageTitle="CRM" />

      <LeadsErrorBanner />

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Leads
            </h3>
            <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
              Add leads manually, paste in research notes, and move them through
              the pipeline.
            </p>
          </div>
          <Button
            size="sm"
            startIcon={<PlusIcon />}
            onClick={() => openForm(null)}
          >
            Add lead
          </Button>
        </div>

        <LeadsTable leads={leads} onEdit={(lead) => openForm(lead)} />
      </div>

      {/* `Modal` unmounts only its children, so the form itself has to be
          remounted for its state to pick up new starting values — hence a key
          that changes on every open, not just on a change of target. */}
      <LeadFormModal
        key={formKey}
        isOpen={isOpen}
        onClose={closeModal}
        onSave={handleSave}
        mode={editingLead ? 'edit' : 'add'}
        initialDraft={
          recoveredDraft ??
          (editingLead ? toDraft(editingLead) : undefined)
        }
      />
    </div>
  );
}
