/** Small pieces shared by every page with a side menu. */

export function MobileMenuIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
    </svg>
  );
}

/** Dark overlay behind the open mobile drawer; clicking it closes the drawer. */
export function SidebarBackdrop({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: pointer-only overlay; the drawer has its own close button.
    // biome-ignore lint/a11y/noStaticElementInteractions: same as above.
    <div id={id} className={`fixed inset-0 z-30 bg-black/50 lg:hidden${open ? '' : ' hidden'}`} onClick={onClose} />
  );
}

/** Floating ☰ button that re-opens the collapsed desktop sidebar (visible only when collapsed). */
export function DesktopSidebarOpenButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      id="desktop-sidebar-open-btn"
      type="button"
      className="desktop-sidebar-open-btn hidden fixed top-4 left-4 z-40 p-1 bg-transparent border-0 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all cursor-pointer items-center justify-center focus:outline-none group"
      aria-label="Abrir menu lateral"
      title="Abrir menu lateral"
      onClick={onClick}
    >
      <svg
        className="w-6 h-6 sm:w-7 sm:h-7 transition-transform group-hover:scale-110"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
