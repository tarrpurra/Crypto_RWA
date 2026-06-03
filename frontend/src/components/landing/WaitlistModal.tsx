"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";

interface WaitlistModalProps {
  open: boolean;
  onClose: () => void;
}

export function WaitlistModal({ open, onClose }: WaitlistModalProps) {
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setSubmitted(false);
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6 backdrop-blur-xl dark:bg-black/70"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-lp-border bg-lp-glass p-1 backdrop-blur-2xl"
          >
            {submitted ? (
              <div className="rounded-[2.25rem] bg-lp-surface p-9 text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[0.75rem] bg-emerald-500/10">
                  <Check className="h-8 w-8 text-emerald-400" />
                </div>
                <p className="font-display text-3xl font-semibold tracking-tight text-lp-fg">
                  You&apos;re on the list.
                </p>
                <p className="mt-2 text-lp-fg-secondary">
                  We&apos;ve sent a confirmation to your email.
                </p>
                <button
                  onClick={onClose}
                  className="mt-8 rounded-3xl border border-lp-border px-8 py-3 text-sm text-lp-fg transition-colors hover:bg-lp-glass"
                >
                  Return to homepage
                </button>
              </div>
            ) : (
              <div className="rounded-[2.25rem] bg-lp-surface p-9">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <p className="font-display text-3xl font-semibold tracking-tight text-lp-fg">
                      Join the waitlist
                    </p>
                    <p className="mt-1 text-sm text-lp-fg-secondary">
                      Limited spots available for Q1.
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-lp-fg-muted transition-colors hover:text-lp-fg"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[1px] text-lp-fg-muted">
                      Full name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Elena Voss"
                      className="w-full rounded-2xl border border-lp-border bg-lp-glass px-4 py-3.5 text-sm text-lp-fg placeholder-lp-fg-muted/50 outline-none transition-colors focus:border-lp-fg/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[1px] text-lp-fg-muted">
                      Work email
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="elena@protocol.xyz"
                      className="w-full rounded-2xl border border-lp-border bg-lp-glass px-4 py-3.5 text-sm text-lp-fg placeholder-lp-fg-muted/50 outline-none transition-colors focus:border-lp-fg/30"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full rounded-3xl bg-lp-fg px-6 py-4 font-semibold text-lp-bg transition-all duration-300 hover:opacity-90 active:scale-[0.98]"
                    >
                      Request access
                    </button>
                  </div>

                  <p className="text-center text-xs text-lp-fg-muted">
                    You&apos;ll receive an invite within 48 hours
                  </p>
                </form>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
