"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  LayoutDashboard,
  ListChecks,
  LogOut,
  NotebookText,
  Target,
  User,
} from "lucide-react";
import { useAppState } from "./AppState";
import { Switch } from "./ui/Switch";
import { BrandMark } from "./landing/BrandMark";
import { api, SIGNED_OUT_EVENT } from "@/lib/api";

const CALIBRATION_ENABLED =
  process.env.NEXT_PUBLIC_CALIBRATION_ENABLED === "true";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/queue", label: "Review queue", icon: ListChecks },
  // Shown only when calibration gates access; an invitation qualifies otherwise.
  ...(CALIBRATION_ENABLED
    ? [{ href: "/calibration", label: "Calibration", icon: Target }]
    : []),
  // The record of work done. Reachable, because a record nobody can find is
  // not much of a record.
  { href: "/earnings", label: "Work record", icon: NotebookText },
  { href: "/account", label: "Account", icon: User },
];

function initialsOf(name: string | undefined, email: string | undefined) {
  const source = (name || email || "").trim();
  if (!source) return "—";
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "—";
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Avatar({ size = "md" }: { size?: "sm" | "md" }) {
  const { me } = useAppState();
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-accent-hover to-accent font-bold text-on-fill ring-2 ring-accent/20 ${
        size === "sm" ? "h-8 w-8 text-[13px]" : "h-9 w-9 text-[14px]"
      }`}
    >
      {initialsOf(me?.name, me?.email)}
    </span>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { me, available, reviewedThisSession } = useAppState();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-hairline bg-rail md:flex">
      <div className="flex h-16 items-center px-5">
        <Link
          href="/dashboard"
          className="focusable flex items-center gap-2.5 rounded-btn text-[17px] font-semibold tracking-[0.04em] text-ink"
        >
          <span className="grid h-8 w-8 place-items-center rounded-btn bg-accent-soft text-accent-ink ring-1 ring-inset ring-accent/25">
            <BrandMark size={17} />
          </span>
          Senebiclabs
        </Link>
      </div>

      <nav className="flex-1 px-3 pt-4" aria-label="Main">
        <p className="mb-2 px-3 text-label uppercase text-subtle">Workspace</p>
        <ul className="space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`focusable group relative flex items-center gap-3 rounded-btn px-3 py-2.5 text-[15px] transition-colors duration-150 ${
                    active
                      ? "bg-accent-soft font-semibold text-ink"
                      : "text-rail-text hover:bg-rail-hover hover:text-ink"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent"
                    />
                  )}
                  <Icon
                    size={18}
                    aria-hidden="true"
                    className={`shrink-0 ${active ? "text-accent-ink" : "text-subtle group-hover:text-muted"}`}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="m-3 rounded-card border border-hairline-soft bg-surface p-3">
        <div className="flex items-center gap-3">
          <Avatar />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-ink">
              {me?.name ?? me?.email ?? "Signing in…"}
            </p>
            <p className="tnum truncate text-[13px] text-subtle">
              {reviewedThisSession} reviewed this session
            </p>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 border-t border-hairline-soft pt-3 text-[13px] text-muted">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${available ? "bg-accent shadow-[0_0_0_3px_rgb(79_191_164/0.2)]" : "bg-subtle"}`}
          />
          {available ? "Available for reviews" : "Not available"}
        </p>
      </div>
    </aside>
  );
}

function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-hairline bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`focusable relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
              active ? "text-accent-ink" : "text-subtle hover:text-muted"
            }`}
          >
            {active && (
              <span aria-hidden="true" className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent" />
            )}
            <Icon size={20} aria-hidden="true" />
            <span className="truncate">{label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function TopBar({ title }: { title: string }) {
  const router = useRouter();
  const { me, available, setAvailable } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const signOut = async () => {
    try {
      await api.signOut();
    } finally {
      router.push("/");
    }
  };

  return (
    <header className="sticky top-0 z-20 h-16 border-b border-hairline bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Senebiclabs dashboard"
            className="focusable grid h-8 w-8 shrink-0 place-items-center rounded-btn bg-accent-soft text-accent-ink ring-1 ring-inset ring-accent/25 md:hidden"
          >
            <BrandMark size={16} />
          </Link>
          <h1 className="truncate text-[20px] font-bold tracking-[-0.02em] text-ink sm:text-title">
            {title}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2.5 rounded-full border border-hairline bg-surface py-1.5 pl-3.5 pr-1.5 sm:flex">
            <span className="text-[14px] font-medium text-muted">
              {available ? "Available for reviews" : "Not available"}
            </span>
            <Switch
              checked={available}
              onChange={setAvailable}
              label="Available for reviews"
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
              className="focusable flex items-center gap-1.5 rounded-full p-1 pr-2 transition-colors hover:bg-accent-soft"
            >
              <Avatar size="sm" />
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={`text-muted transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  className="animate-rise absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-card bg-surface-raised py-1 shadow-pop"
                >
                  {me && (
                    <div className="flex items-center gap-3 border-b border-hairline-soft px-4 py-3">
                      <Avatar />
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-ink">
                          {me.name}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-subtle">
                          {me.email}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-b border-hairline-soft px-4 py-3 sm:hidden">
                    <span className="text-[15px] text-ink">
                      {available ? "Available" : "Not available"}
                    </span>
                    <Switch
                      checked={available}
                      onChange={setAvailable}
                      label="Available for reviews"
                    />
                  </div>
                  <div className="p-1">
                    <Link
                      href="/account"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="focusable flex items-center gap-2.5 rounded-btn px-3 py-2 text-[15px] text-strong transition-colors hover:bg-accent-soft hover:text-ink"
                    >
                      <User size={16} aria-hidden="true" className="text-subtle" />
                      Account
                    </Link>
                    <button
                      role="menuitem"
                      onClick={signOut}
                      className="focusable flex w-full items-center gap-2.5 rounded-btn px-3 py-2 text-left text-[15px] text-strong transition-colors hover:bg-accent-soft hover:text-ink"
                    >
                      <LogOut size={16} aria-hidden="true" className="text-subtle" />
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function Toast() {
  const { toast } = useAppState();
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-rise fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full bg-surface-raised py-2.5 pl-3 pr-4 text-[15px] font-semibold text-ink shadow-pop md:bottom-6 md:left-auto md:right-6 md:translate-x-0"
    >
      <CheckCircle2 size={18} aria-hidden="true" className="text-accent-ink" />
      {toast}
    </div>
  );
}

/**
 * Takes the person to sign-in the moment the platform says their session is
 * over.
 *
 * Revoking a session refuses it on its next request, but the page shell is only
 * checked for a signature at the edge, so without this a revoked clinician
 * would sit on a page whose every panel failed. It signs out first, which
 * clears the stale cookie so the edge redirect behaves from then on, and it
 * fires once however many requests come back 401 together.
 */
function SessionWatch() {
  const router = useRouter();
  const leaving = useRef(false);

  useEffect(() => {
    const onSignedOut = () => {
      if (leaving.current) return;
      leaving.current = true;
      fetch("/api/auth/sign-out", { method: "POST" })
        .catch(() => {})
        .finally(() => router.replace("/login"));
    };
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [router]);

  return null;
}

export function AppLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <SessionWatch />
      <Sidebar />
      <div className="md:pl-64">
        <TopBar title={title} />
        <main className="mx-auto max-w-[1280px] px-4 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-8 lg:px-8">
          {children}
        </main>
      </div>
      <MobileTabBar />
      <Toast />
    </div>
  );
}
