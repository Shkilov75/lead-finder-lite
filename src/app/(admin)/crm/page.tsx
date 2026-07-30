'use client';

import React from 'react';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import Button from '@/components/ui/button/Button';
import AddLeadModal from '@/components/leads/AddLeadModal';
import LeadsTable from '@/components/leads/LeadsTable';
import { PlusIcon } from '@/icons';
import { useModal } from '@/hooks/useModal';
import { useLeads } from '@/context/LeadsContext';

export default function CrmPage() {
  const { leads, addLead } = useLeads();
  const { isOpen, openModal, closeModal } = useModal();

  return (
    <div>
      <PageBreadcrumb pageTitle="CRM" />

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
          <Button size="sm" startIcon={<PlusIcon />} onClick={openModal}>
            Add lead
          </Button>
        </div>

        <LeadsTable leads={leads} />
      </div>

      <AddLeadModal isOpen={isOpen} onClose={closeModal} onSave={addLead} />
    </div>
  );
}
