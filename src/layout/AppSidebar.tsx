'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from '../context/SidebarContext';
import { GridIcon, HorizontaLDots, TableIcon } from '../icons/index';
import SidebarWidget from './SidebarWidget';
import BrandLogo from './BrandLogo';

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path: string;
};

const navItems: NavItem[] = [
  { icon: <GridIcon />, name: 'Dashboard', path: '/' },
  { icon: <TableIcon />, name: 'CRM', path: '/crm' },
];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();

  const showLabels = isExpanded || isHovered || isMobileOpen;

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200
        ${showLabels ? 'w-[290px]' : 'w-[90px]'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-8 flex ${
          !isExpanded && !isHovered ? 'lg:justify-center' : 'justify-start'
        }`}
      >
        <Link href="/">
          <BrandLogo showWordmark={showLabels} />
        </Link>
      </div>

      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <h2
            className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
              !isExpanded && !isHovered ? 'lg:justify-center' : 'justify-start'
            }`}
          >
            {showLabels ? 'Menu' : <HorizontaLDots />}
          </h2>
          <ul className="flex flex-col gap-4">
            {navItems.map((nav) => {
              const isActive = pathname === nav.path;
              return (
                <li key={nav.name}>
                  <Link
                    href={nav.path}
                    className={`menu-item group ${
                      isActive ? 'menu-item-active' : 'menu-item-inactive'
                    } ${
                      !isExpanded && !isHovered
                        ? 'lg:justify-center'
                        : 'lg:justify-start'
                    }`}
                  >
                    <span
                      className={
                        isActive
                          ? 'menu-item-icon-active'
                          : 'menu-item-icon-inactive'
                      }
                    >
                      {nav.icon}
                    </span>
                    {showLabels && <span>{nav.name}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {showLabels ? <SidebarWidget /> : null}
      </div>
    </aside>
  );
};

export default AppSidebar;
