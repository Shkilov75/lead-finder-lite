'use client';

import Image from 'next/image';
import React, { useState } from 'react';
import { Dropdown } from '../ui/dropdown/Dropdown';

/**
 * The template's version links to /profile, /signin and a support page. None of
 * those routes exist here, so the menu is reduced to the account summary rather
 * than shipping links that 404.
 */
export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  function toggleDropdown(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center text-gray-700 dark:text-gray-400 dropdown-toggle"
      >
        <span className="mr-3 overflow-hidden rounded-full h-11 w-11">
          <Image
            width={44}
            height={44}
            src="/images/user/owner-photo.jpg"
            alt="User"
          />
        </span>

        <span className="block mr-1 font-medium text-theme-sm">You</span>

        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute right-0 mt-[17px] flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-400">
          You
        </span>
        <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
          Workshop demo account
        </span>
        <p className="pt-3 mt-3 text-gray-500 border-t border-gray-200 text-theme-xs dark:border-gray-800 dark:text-gray-400">
          Leads are stored in this browser only.
        </p>
      </Dropdown>
    </div>
  );
}
