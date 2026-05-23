import type { Metadata } from 'next';
import { Geist, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import './globals.css';

// Playfair Display chosen over Fraunces because next/font's Fraunces shipping
// renders precomposed Latvian glyphs (ā, ē, ī, ū) as base + separate combining
// macron, producing "a⁻" instead of "ā" in headings. Playfair Display ships
// the precomposed glyphs in its latin-ext subset correctly. Verified with a
// headless Playwright glyph-width probe across Fraunces / Playfair / Spectral /
// EB Garamond / Cormorant Garamond — all five report 0px diff between "a" and
// "ā" when loaded fresh from Google Fonts, suggesting the issue is in next/font's
// subsetting of Fraunces specifically. Swap is safe + reversible.
const playfair = Playfair_Display({
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
      className={`${playfair.variable} ${geist.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--paper)] text-[var(--ink)]">
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
