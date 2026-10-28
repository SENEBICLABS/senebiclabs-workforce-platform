"use client";

import { useState } from "react";
import { RotateCw, ZoomIn, ZoomOut, Maximize } from "lucide-react";

/**
 * A case's image, to be read rather than glanced at.
 *
 * Zoom and rotate are what a reader of a scan reaches for first. Zooming enlarges the image inside a
 * scrolling frame, so a zoomed scan is panned with the scrollbars, the keyboard
 * or a finger, with no gesture to learn. Every control is a labelled button.
 *
 * `src` is this platform's media route, which checks the clinician may see the
 * case and then hands the browser a short-lived address. The image's stored
 * address is never in the page.
 */

const ZOOMS = [1, 1.5, 2, 3, 4];

/**
 * Render with `key={src}`: a new case is a new viewer, so it starts at the
 * whole image, the right way up, rather than at the last case's zoom.
 */
export function ImageViewer({ src, label }: { src: string; label: string }) {
  const [zoom, setZoom] = useState(0);
  const [turns, setTurns] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  const scale = ZOOMS[zoom];
  const sideways = turns % 2 === 1;

  const button =
    "focusable inline-flex h-9 w-9 items-center justify-center rounded-btn border border-hairline-strong bg-surface-raised text-ink transition-colors hover:border-accent/60 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Image controls">
        <button
          type="button"
          className={button}
          onClick={() => setZoom((z) => Math.max(0, z - 1))}
          disabled={zoom === 0 || state !== "ready"}
          aria-label="Zoom out"
        >
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
          disabled={zoom === ZOOMS.length - 1 || state !== "ready"}
          aria-label="Zoom in"
        >
          <ZoomIn size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => setTurns((t) => (t + 1) % 4)}
          disabled={state !== "ready"}
          aria-label="Rotate a quarter turn clockwise"
        >
          <RotateCw size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => {
            setZoom(0);
            setTurns(0);
          }}
          disabled={(zoom === 0 && turns === 0) || state !== "ready"}
          aria-label="Reset to the whole image"
        >
          <Maximize size={16} aria-hidden="true" />
        </button>
        <span className="tnum text-[14px] text-subtle" aria-live="polite">
          {Math.round(scale * 100)}%{turns ? `, rotated ${turns * 90}°` : ""}
        </span>
      </div>

      <div
        className="max-h-[70vh] overflow-auto rounded-btn border border-hairline bg-black/90"
        tabIndex={0}
        aria-label={`${label}, scroll to move around the image`}
      >
        {state === "failed" ? (
          <p className="px-5 py-10 text-center text-[15px] text-white">
            We could not load this image. Reload the case to try again; if it
            still does not appear, flag the case rather than judging it without
            the image.
          </p>
        ) : (
          <div className="relative grid min-h-[16rem] place-items-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- an authenticated, redirected, per-view URL; next/image would cache and proxy it */}
            <img
              src={src}
              alt={label}
              onLoad={() => setState("ready")}
              onError={() => setState("failed")}
              style={{
                width: `${scale * 100}%`,
                maxWidth: "none",
                transform: `rotate(${turns * 90}deg)`,
                margin: sideways ? `${(scale * 100) / 4}% 0` : undefined,
              }}
              className={`h-auto transition-transform duration-150 ${state === "loading" ? "opacity-0" : ""}`}
            />
            {state === "loading" && (
              <span className="absolute text-[15px] text-white/80" role="status">
                Loading image…
              </span>
            )}
          </div>
        )}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
