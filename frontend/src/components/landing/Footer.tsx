export function Footer() {
  return (
    <footer className="border-t border-lp-border-muted">
      <div className="mx-auto max-w-screen-2xl px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 py-10 text-sm text-lp-fg-muted md:flex-row">
          <p>&copy; 2025 AIYield. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="transition-colors hover:text-lp-fg">
              Privacy
            </a>
            <a href="#" className="transition-colors hover:text-lp-fg">
              Legal
            </a>
            <a href="#" className="transition-colors hover:text-lp-fg">
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
