import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Greg Lewis",
  description: "Recent projects — ML systems, AWS-native AI infra, and applied analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <footer className="mx-auto w-full max-w-6xl px-6 pb-10 pt-8">
          <div className="flex items-center gap-5 border-t border-neutral-200 pt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500 dark:border-neutral-800 dark:text-neutral-500">
            <a
              href="https://github.com/s1m31-63j6"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/greghlewis"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              Contact
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
