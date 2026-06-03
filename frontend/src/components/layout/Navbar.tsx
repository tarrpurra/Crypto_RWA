import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import YieldMindOrb from "@/components/intro/YieldMindOrb";
import { useState, useEffect } from "react";

const Navbar = ({ hasEntered }: { hasEntered: boolean }) => {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const [isHovered, setIsHovered] = useState(false);

  const navLinks = [
    { href: "/", label: "Product" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/risk", label: "Docs" },
    { href: "/trade", label: "Log in" },
    { href: "/allocation", label: "Get started" },
  ];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-40 flex h-16 items-center justify-between px-6 py-3 bg-black/80 backdrop-blur-md border-b border-black/30"
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
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              <YieldMindOrb 
                size={isHovered ? 40 : 36} 
                className="h-full w-full" 
              />
            </motion.div>

            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: hasEntered ? 1 : 0, x: hasEntered ? 0 : -8 }}
              transition={{ delay: 0.8, duration: 0.6, ease: "easeOut" }}
              className="text-xl font-semibold tracking-tight text-white"
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
                ? "bg-black/60 text-white"
                : "text-gray-400 hover:text-white transition-colors duration-200"
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