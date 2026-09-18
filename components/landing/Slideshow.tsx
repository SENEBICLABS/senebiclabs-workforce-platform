"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WhyJoin } from "@/lib/marketing-content";

/**
 * The claims, one at a time, as a slideshow a reader moves through.
 *
 * Built on a scroll-snap track rather than a drag library: on a phone that
 * makes swiping the browser's own gesture, with its own momentum and rubber
 * banding, and on a desktop a trackpad swipe works for free. The arrows and
 * dots drive the same scroller, so there is one source of truth for position
 * and nothing to keep in sync.
 *
 * Announced as a carousel: the region carries aria-roledescription, each slide
 * says which number it is, and the position line beneath is a live region, so
 * a screen reader hears "2 of 4" when it changes rather than silence. Arrow
 * keys move between slides when the track has focus.
 */
export function Slideshow({ items }: { items: WhyJoin[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  /**
   * One slide per view, which is what makes the position honest.
   *
   * An earlier version showed three at a time on a wide screen. The track then
   * ran out of scroll before the last slide could reach the left edge: at
   * 1440px the reachable targets were 0, 646, 1202, 1202, so slides three and
   * four shared a position and no amount of arithmetic could tell them apart.
   * That is what made the last dot land short and an arrow press skip ahead.
   * A full-width slide always has a target of its own, at every width.
   */
  const targetFor = useCallback((el: HTMLElement, index: number) => {
    const slide = el.children[index] as HTMLElement | undefined;
    if (!slide) return 0;
    const padLeft = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const max = el.scrollWidth - el.clientWidth;
    return Math.min(Math.max(0, slide.offsetLeft - padLeft), max);
  }, []);

  /**
   * Which slide the track is showing, read from the scroller rather than from
   * state: a smooth scroll is still animating when the next key arrives, and
   * stepping from stale state skipped a slide.
   */
  const indexNow = useCallback(
    (el: HTMLElement) => {
      let nearest = 0;
      let best = Infinity;
      for (let i = 0; i < items.length; i++) {
        const distance = Math.abs(targetFor(el, i) - el.scrollLeft);
        if (distance < best) {
          best = distance;
          nearest = i;
        }
      }
      return nearest;
    },
    [items.length, targetFor]
  );

  /** Position comes from the scroller itself, so a swipe updates the dots. */
  useEffect(() => {
    const el = track.current;
    if (!el) return;

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setCurrent(indexNow(el)));
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [indexNow]);

  const goTo = (index: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(items.length - 1, index));
    el.scrollTo({ left: targetFor(el, next), behavior: "smooth" });
    setCurrent(next);
  };

  /** One step from wherever the track actually is, not from stale state. */
  const step = (by: number) => {
    const el = track.current;
    if (!el) return;
    goTo(indexNow(el) + by);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  };

  return (
    <div
      className="mt-12"
      role="region"
      aria-roledescription="carousel"
      aria-label="Why clinicians join Senebiclabs"
    >
      {/* No bleed: the track sits on the section's own content box, so a slide
          lines up with the heading above it. snap-start against a padded track
          rested at 40px of scroll, which pushed every card off centre. */}
      <div
        ref={track}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="focusable flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-2 scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <div
            key={item.title}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}: ${item.title}`}
            className="w-full shrink-0 snap-start text-left"
          >
            {/* The slide is the scroll unit and fills the track, so every one
                has a position of its own and the dots cannot disagree with a
                swipe. The card inside hugs the text rather than stretching with
                it: at full width the detail ran to about 170 characters a line
                and left half the panel empty. */}
            <div className="mx-auto max-w-[820px] rounded-card border border-hairline bg-linear-to-br from-accent-soft/40 via-transparent to-transparent p-7 sm:p-10 lg:p-12">
              <p aria-hidden="true" className="tnum text-label text-accent">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-5 text-[24px] leading-tight text-ink sm:text-[28px]">
                {item.title}
              </h3>
              <p className="mt-4 text-[19px] leading-relaxed text-strong">{item.lead}</p>
              <p className="mt-4 text-body leading-relaxed text-muted">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={current === 0}
          aria-label="Previous"
          className="focusable grid h-10 w-10 place-items-center rounded-full border border-hairline text-ink transition-colors hover:bg-accent-soft disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          {items.map((item, i) => (
            <button
              key={item.title}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to ${item.title}`}
              aria-current={i === current ? "true" : undefined}
              className={`focusable h-1.5 rounded-full transition-all ${
                i === current ? "w-7 bg-ink" : "w-1.5 bg-white/25 hover:bg-white/45"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={current === items.length - 1}
          aria-label="Next"
          className="focusable grid h-10 w-10 place-items-center rounded-full border border-hairline text-ink transition-colors hover:bg-accent-soft disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <p aria-live="polite" className="mt-4 text-center font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
        {current + 1} of {items.length}
      </p>
    </div>
  );
}
