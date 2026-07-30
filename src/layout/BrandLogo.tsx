import React from 'react';
import Image from 'next/image';

type BrandLogoProps = {
  /** Set false to render the mark alone, for the collapsed sidebar. */
  showWordmark?: boolean;
};

/**
 * The template baked the wordmark into its logo SVGs as outlined paths, so a
 * rename could not be typed — and a light/dark pair of <Image> tags was needed
 * to swap them. Pairing the icon-only mark with real text keeps the name
 * editable and lets one element cover both themes; those SVGs are now gone.
 */
export default function BrandLogo({ showWordmark = true }: BrandLogoProps) {
  return (
    <span className="flex items-center gap-2.5">
      <Image
        src="/images/logo/logo-icon.svg"
        alt="CRMAdmin"
        width={32}
        height={32}
        priority
      />
      {showWordmark && (
        <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          CRMAdmin
        </span>
      )}
    </span>
  );
}
