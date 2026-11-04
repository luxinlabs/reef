"use client";

import { useEffect, useRef } from "react";
import { SkyEngine } from "./engine";
import type { GliderSpec } from "./world";

/** Glyphs come from the canvas's font-family, so give it (or a parent) a monospace font. */
export function HeavenSky({ className, gliders, paused = false }: { className?: string; gliders?: GliderSpec[]; paused?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SkyEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new SkyEngine(canvas, gliders);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // The roster is fixed for the life of the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`heaven-sky ${className ?? ""}`} />;
}
