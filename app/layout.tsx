import type { Metadata } from 'next';
import { Fraunces, Geist, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

const geist = Geist({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Latvijas dzīvokļu karte',
  description: 'Jauno projektu apkopojums un salīdzinājums Latvijā',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="lv"
      className={`${fraunces.variable} ${geist.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--paper)] text-[var(--ink)]">
        {children}
      </body>
    </html>
  );
}
