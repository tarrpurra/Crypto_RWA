import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

const Navbar = ({ hasEntered }: { hasEntered: boolean }) => {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  const navLinks = [
    { href: "/", label: "Product" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/risk", label: "Docs" },
    { href: "/decision-log", label: "Log in" },
    { href: "/dashboard", label: "Get started" },
  ];

  return (
    <nav
      className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-lp-border-muted bg-lp-bg/82 px-6 py-3 backdrop-blur-md"
    >
      <div className="flex items-center gap-3">
        {/* Conditional logo rendering based on intro state */}
        {hasEntered && (
          <>
            <motion.div
              layoutId="yieldmind-logo"
              className={`
                h-10 w-10 
                ${reducedMotion ? "hidden" : ""}
                hover:scale-105 transition-transform duration-200
              `}
            >
              <img src="/master_logo.png" alt="" aria-hidden="true" draggable={false} className="h-full w-full object-contain" />
            </motion.div>

            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: hasEntered ? 1 : 0, x: hasEntered ? 0 : -8 }}
              transition={{ delay: 0.8, duration: 0.6, ease: "easeOut" }}
              className="text-xl font-semibold tracking-tight text-lp-fg"
            >
              YieldMind
            </motion.span>
          </>
        )}
      </div>

      <div className="hidden md:flex items-center gap-6 text-sm font-medium">
        {navLinks.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-md
              ${pathname === link.href
                ? "bg-lp-surface-2 text-lp-fg"
                : "text-lp-fg-muted hover:text-lp-fg transition-colors duration-200"
              }
            `}
          >
            {/* Icons would go here based on link label */}
            <span>{link.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
};

export default Navbar;
