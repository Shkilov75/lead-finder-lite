import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { LeadsProvider } from '@/context/LeadsContext';

const outfit = Outfit({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Lead Finder Lite',
  description: 'A minimal CRM built during the vibe-to-live workshop.',
};

/**
 * Runs before first paint, so a dark-mode visitor never sees a white flash.
 * ThemeContext also applies the class, but only in a post-mount effect — by
 * then the light background has already been painted. Keep this in sync with
 * the storage key and class name ThemeContext uses.
 */
const themeScript = `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning: themeScript mutates <html>'s class before React
  // hydrates, which React would otherwise report as a server/client attribute
  // mismatch. It covers this element's own attributes only, not the tree.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <SidebarProvider>
            <LeadsProvider>{children}</LeadsProvider>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
