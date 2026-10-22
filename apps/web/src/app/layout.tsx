import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ModelFit — AI Model Discovery & Hardware Memory Estimator',
  description: 'Deterministic memory calculation engine and natural-language AI model advisor for local LLM hardware.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-dark-base text-zinc-100 antialiased flex flex-col font-sans">
        {/* Skip to Content accessible landmark */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-sage-600 focus:text-white focus:rounded focus:outline-none"
        >
          Skip to content
        </a>

        {children}
      </body>
    </html>
  );
}
