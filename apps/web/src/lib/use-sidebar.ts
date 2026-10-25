import { useCallback, useEffect, useRef, useState } from 'react';
import { readItem, STORAGE_KEYS, writeItem } from '../preferences/storage';
import { isInsideScrollable } from './scrollable';

const DESKTOP_MIN_WIDTH = 1024;
const isDesktop = () => window.innerWidth >= DESKTOP_MIN_WIDTH;

export interface SidebarControls {
  /** Mobile drawer state. */
  mobileOpen: boolean;
  openMobile(): void;
  closeMobile(): void;
  /** X button: collapses on desktop, closes the drawer on mobile. */
  close(): void;
  /** Floating ☰ button: re-expands the collapsed desktop sidebar. */
  expandDesktop(): void;
  /** Closes the mobile drawer after following a link inside the sidebar. */
  onSidebarClick(event: React.MouseEvent): void;
}

/**
 * Sidebar behavior shared by every page with a side menu: mobile drawer with backdrop and edge
 * swipe, desktop collapse persisted in `study_sidebar_collapsed` (class on `<html>`).
 */
export function useSidebar(): SidebarControls {
  const [mobileOpen, setMobileOpen] = useState(false);
  const openRef = useRef(mobileOpen);
  openRef.current = mobileOpen;

  useEffect(() => {
    document.body.classList.toggle('overflow-hidden', mobileOpen);
    document.body.classList.toggle('lg:overflow-auto', mobileOpen);
  }, [mobileOpen]);

  useEffect(() => {
    document.documentElement.classList.toggle('sidebar-collapsed', readItem(STORAGE_KEYS.sidebarCollapsed) === 'true');
  }, []);

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let startedInScrollable = false;

    const onTouchStart = (e: TouchEvent) => {
      if (isDesktop()) return;
      const touch = e.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      startedInScrollable = isInsideScrollable(e.target);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (isDesktop()) return;
      const touch = e.changedTouches[0];
      if (!touch || startedInScrollable) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dy) > 30 || Math.abs(dx) < Math.abs(dy) * 2.2 || Date.now() - startTime > 450) return;
      const isEdgeSwipe = startX <= Math.min(28, window.innerWidth * 0.08);
      if (!openRef.current && dx > 45 && isEdgeSwipe) setMobileOpen(true);
      else if (openRef.current && dx < -45) setMobileOpen(false);
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const close = useCallback(() => {
    if (isDesktop()) {
      document.documentElement.classList.add('sidebar-collapsed');
      writeItem(STORAGE_KEYS.sidebarCollapsed, 'true');
    } else {
      setMobileOpen(false);
    }
  }, []);
  const expandDesktop = useCallback(() => {
    document.documentElement.classList.remove('sidebar-collapsed');
    writeItem(STORAGE_KEYS.sidebarCollapsed, 'false');
  }, []);
  const onSidebarClick = useCallback((event: React.MouseEvent) => {
    if ((event.target as Element).closest('a') && !isDesktop()) setMobileOpen(false);
  }, []);

  return { mobileOpen, openMobile, closeMobile, close, expandDesktop, onSidebarClick };
}
