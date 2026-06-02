"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Product", href: "#features" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Docs", href: "#" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-lp-bg"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto max-w-screen-2xl px-6 lg:px-8">
        <div className="flex h-[72px] items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center bg-lp-fg">
              <span className="font-display text-lg font-semibold tracking-tighter text-lp-bg">A</span>
            </div>
            <span className="font-display text-xl font-semibold tracking-tighter text-lp-fg">AIYield</span>
          </div>

          <div className="hidden items-center gap-10 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-lp-fg-secondary transition-colors hover:text-lp-fg"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-4 md:flex">
            <Link
              to="/dashboard"
              className="border border-lp-border-muted px-5 py-2.5 text-sm font-medium text-lp-fg-muted transition-colors hover:border-lp-border hover:text-lp-fg"
            >
              Log in
            </Link>
            <Link
              to="/dashboard"
              className="border-2 border-lp-gold bg-lp-gold px-6 py-2.5 text-sm font-semibold text-lp-bg transition-all duration-300 hover:opacity-90 active:scale-[0.98]"
            >
              Get started
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex items-center justify-center text-lp-fg-secondary hover:text-lp-fg md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-lp-border-muted bg-lp-bg md:hidden">
          <div className="space-y-2 px-6 py-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block py-2 text-sm text-lp-fg-secondary transition-colors hover:text-lp-fg"
              >
                {link.label}
              </a>
            ))}
            <hr className="border-lp-border-muted" />
            <Link
              to="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm text-lp-fg-muted transition-colors hover:text-lp-fg"
            >
              Log in
            </Link>
            <Link
              to="/dashboard"
              onClick={() => setMobileOpen(false)}
              className="mt-2 inline-block border-2 border-lp-gold bg-lp-gold px-6 py-2.5 text-sm font-semibold text-lp-bg"
            >
              Get started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
