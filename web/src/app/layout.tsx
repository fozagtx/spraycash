import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Payday · Pay freelancers anywhere, every second",
  description:
    "Fund payroll in dollars. Your team sees earnings tick up in their own currency, at a rate locked the moment you hit pay.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#FAF8F4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Instrument+Serif&display=swap"
        />
      </head>
      <body>
        <header className="header">
          <div className="container header-inner">
            <Link href="/" className="brand" aria-label="Payday home">
              <span className="brand-mark" aria-hidden />
              Payday
            </Link>
            <nav className="nav">
              <Link href="/employer">Run payroll</Link>
              <Link href="/me">My pay</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="container">
            Payday runs on a test network with demo dollars. Exchange rates verified by Chainlink.
          </div>
        </footer>
      </body>
    </html>
  );
}
