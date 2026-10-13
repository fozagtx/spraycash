import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { NavLinks, SoundToggle, ToastProvider } from "@/components/Motion";
import { SmoothScroll } from "@/components/smooth-scroll";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spraycash · Pay your team anywhere, every second",
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
        <SmoothScroll />
        <ToastProvider>
        <header className="header">
          <div className="container">
            <div className="header-inner">
              <div className="header-left">
                <Link href="/" className="brand" aria-label="Spraycash home">
                  <Logo />
                </Link>
                <NavLinks
                  links={[
                    { href: "/employer", label: "Run payroll" },
                    { href: "/me", label: "My pay" },
                  ]}
                />
              </div>
              <div className="header-actions">
                <Link href="/employer/new" className="btn btn-sm btn-ink">
                  Send pay
                </Link>
              </div>
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="footer">
          <div className="container footer-inner">
            <Logo size={22} />
            <span>Payroll that crosses borders as fast as the work does.</span>
            <span>Monad testnet · settled in AUSD by Agora · rates verified by Chainlink</span>
            <SoundToggle />
          </div>
        </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
