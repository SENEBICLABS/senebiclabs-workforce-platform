"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LayoutDashboard, ListChecks, Target, User } from "lucide-react";
import { useAppState } from "./AppState";
import { Switch } from "./ui/Switch";
import { api } from "@/lib/api";

const CALIBRATION_ENABLED =
  process.env.NEXT_PUBLIC_CALIBRATION_ENABLED === "true";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/queue", label: "Review queue", icon: ListChecks },
  // Shown only when calibration gates access; an invitation qualifies otherwise.
  ...(CALIBRATION_ENABLED
    ? [{ href: "/calibration", label: "Calibration", icon: Target }]
    : []),
  { href: "/account", label: "Account", icon: User },
];

function initialsOf(name: string | undefined, email: string | undefined) {
  const source = (name || email || "").trim();
  if (!source) return "—";
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "—";
}

function Sidebar() {
  const pathname = usePathname();
  const { me, reviewedThisSession } = useAppState();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-rail md:flex">
      <div className="px-5 py-5">
        <Link
          href="/dashboard"
          className="focusable rounded-btn text-[17px] font-bold tracking-tight text-white"
        >
          Senebiclabs
        </Link>
      </div>

      <nav className="flex-1 px-2" aria-label="Main">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`focusable flex items-center gap-3 rounded-btn border-l-2 px-3 py-2 text-body transition-colors duration-150 ${
                    active
                      ? "border-accent bg-rail-hover font-semibold text-white"
                      : "border-transparent text-rail-text hover:bg-rail-hover hover:text-white"
                  }`}
                >
                  <Icon size={17} aria-hidden="true" className="shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-on-fill"
          >
            {initialsOf(me?.name, me?.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">
              {me?.name ?? me?.email ?? "Signing in…"}
            </p>
            <p className="tnum truncate text-[12px] text-rail-text">
              {reviewedThisSession} reviewed this session
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-surface md:hidden"
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`focusable flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <Icon size={19} aria-hidden="true" />
            {label.split(" ")[0]}
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

  const signOut = async () => {
    try {
      await api.signOut();
    } finally {
      router.push("/");
    }
  };

  return (
    <header className="sticky top-0 z-20 h-16 border-b border-hairline bg-surface">
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between gap-4 px-5 lg:px-8">
        <h1 className="truncate text-title text-ink">{title}</h1>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <div className="hidden items-center gap-2.5 sm:flex">
            <Switch
              checked={available}
              onChange={setAvailable}
              label="Available for reviews"
            />
            <span className="text-[13px] font-semibold text-muted">
              {available ? "Available for reviews" : "Not available"}
            </span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
              className="focusable flex items-center gap-1.5 rounded-btn p-1 transition-colors hover:bg-canvas"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-on-fill"
              >
                {initialsOf(me?.name, me?.email)}
              </span>
              <ChevronDown size={14} aria-hidden="true" className="text-muted" />
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
                  className="absolute right-0 z-20 mt-2 w-60 rounded-card border border-hairline bg-surface py-1 shadow-[0_8px_28px_rgba(16,49,46,0.12)]"
                >
                  {me && (
                    <div className="border-b border-hairline px-4 py-3">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {me.name}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-muted">
                        {me.email}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-3 sm:hidden">
                    <span className="text-[13px] text-ink">
                      {available ? "Available" : "Not available"}
                    </span>
                    <Switch
                      checked={available}
                      onChange={setAvailable}
                      label="Available for reviews"
                    />
                  </div>
                  <Link
                    href="/account"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="focusable block px-4 py-2 text-[13px] text-ink transition-colors hover:bg-canvas"
                  >
                    Account
                  </Link>
                  <button
                    role="menuitem"
                    onClick={signOut}
                    className="focusable w-full px-4 py-2 text-left text-[13px] text-ink transition-colors hover:bg-canvas"
                  >
                    Sign out
                  </button>
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
      className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-btn border border-hairline bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink shadow-[0_8px_28px_rgba(0,0,0,0.5)] md:bottom-6 md:left-auto md:right-6 md:translate-x-0"
    >
      {toast}
    </div>
  );
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
      <Sidebar />
      <div className="md:pl-60">
        <TopBar title={title} />
        <main className="mx-auto max-w-[1280px] px-5 pb-24 pt-6 md:pb-10 lg:px-8">
          {children}
        </main>
      </div>
      <MobileTabBar />
      <Toast />
    </div>
  );
}
