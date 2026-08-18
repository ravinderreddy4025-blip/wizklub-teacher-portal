import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

const THRESHOLD = 0.85;

/**
 * Slide-to-confirm control. Disabled until `enabled` is true.
 * Calls `onConfirm` once when the handle is dragged past the threshold.
 */
const SlideToConfirm = ({
  enabled = true,
  disabled = false,
  label = 'Slide to continue',
  confirmingLabel = 'Continue…',
  onConfirm,
  resetKey,
  className = '',
}) => {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const offsetRef = useRef(0);
  const maxTravelRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [maxTravel, setMaxTravel] = useState(0);
  const [completed, setCompleted] = useState(false);

  const inactive = disabled || !enabled || completed;

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const handleSize = 48;
    const pad = 4;
    const travel = Math.max(0, track.clientWidth - handleSize - pad * 2);
    maxTravelRef.current = travel;
    setMaxTravel(travel);
  }, []);

  useEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    offsetRef.current = 0;
    setOffset(0);
    setCompleted(false);
    draggingRef.current = false;
  }, [enabled, disabled, resetKey]);

  const finish = useCallback(() => {
    if (completed) return;
    setCompleted(true);
    offsetRef.current = maxTravelRef.current;
    setOffset(maxTravelRef.current);
    onConfirm?.();
  }, [completed, onConfirm]);

  const onPointerDown = (e) => {
    if (inactive || maxTravelRef.current <= 0) return;
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startOffsetRef.current = offsetRef.current;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!draggingRef.current || inactive) return;
    const delta = e.clientX - startXRef.current;
    const next = Math.min(maxTravelRef.current, Math.max(0, startOffsetRef.current + delta));
    offsetRef.current = next;
    setOffset(next);
  };

  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const travel = maxTravelRef.current;
    if (travel > 0 && offsetRef.current >= travel * THRESHOLD) {
      finish();
    } else {
      offsetRef.current = 0;
      setOffset(0);
    }
  };

  const progress = maxTravel > 0 ? offset / maxTravel : 0;

  return (
    <div
      ref={trackRef}
      className={clsx(
        'relative h-14 w-full select-none overflow-hidden rounded-full border',
        enabled && !disabled
          ? 'border-brand-primary/30 bg-gradient-to-r from-orange-50 to-brand-primary/10'
          : 'border-slate-200 bg-slate-100',
        className,
      )}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-disabled={inactive}
      aria-label={label}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-brand-primary/15 transition-[width] duration-75"
        style={{ width: `${Math.max(progress * 100, 8)}%` }}
      />

      <p
        className={clsx(
          'pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold tracking-wide transition-opacity',
          enabled && !disabled ? 'text-brand-primary/80' : 'text-slate-400',
          progress > 0.35 && 'opacity-0',
        )}
      >
        {completed ? confirmingLabel : enabled ? label : 'Select an option first'}
      </p>

      <button
        type="button"
        disabled={inactive}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={clsx(
          'absolute top-1 left-1 z-10 flex h-12 w-12 items-center justify-center rounded-full shadow-md transition-colors touch-none',
          enabled && !disabled
            ? 'bg-brand-primary text-white cursor-grab active:cursor-grabbing'
            : 'bg-slate-300 text-slate-500 cursor-not-allowed',
        )}
        style={{ transform: `translateX(${offset}px)` }}
        aria-hidden={inactive}
      >
        <ChevronRight size={22} strokeWidth={2.5} />
      </button>
    </div>
  );
};

export default SlideToConfirm;
