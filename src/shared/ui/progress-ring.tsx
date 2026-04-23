import { memo } from 'react';

/**
 * Pure-SVG progress ring. Drop-in replacement for the recharts
 * `<PieChart><Pie><Cell/></Pie></PieChart>` pattern that `PhaseCard` +
 * `ProjectHeader` used to draw a donut — recharts pulled ~524 KB of
 * minified JS into the initial bundle to render what is, mathematically,
 * one `<circle>` with a `stroke-dashoffset`.
 *
 * Visuals: two concentric circles. The track (ring background) is the
 * full circumference; the progress arc is a partial stroke rotated to
 * start at 12 o'clock. Rounded stroke caps match the recharts-era look.
 *
 * Accessibility: `role="img"` + `aria-label` gives the ring a readable
 * label (e.g. "72% complete"). Pass `aria-hidden` if a sibling already
 * conveys the percentage textually and the ring is purely decorative.
 */
interface ProgressRingProps {
    /** 0-100; values outside this range are clamped. */
    value: number;
    /** SVG square size in CSS px. Defaults to 64. */
    size?: number;
    /** Stroke width in CSS px. Defaults to 8. */
    strokeWidth?: number;
    /** Track (background) color. Tailwind-derived CSS variable or hex. */
    trackColor?: string;
    /** Progress arc color. */
    color?: string;
    /** Accessible name; overrides the default "{value}% complete" label. */
    ariaLabel?: string;
    /** Render as aria-hidden — use when siblings already announce the value. */
    decorative?: boolean;
    /** Optional classname on the outer <svg>. */
    className?: string;
}

export const ProgressRing = memo(function ProgressRing({
    value,
    size = 64,
    strokeWidth = 8,
    trackColor = 'rgb(226 232 240)', // slate-200
    color = 'rgb(249 115 22)', // orange-500 — brand-adjacent
    ariaLabel,
    decorative = false,
    className,
}: ProgressRingProps) {
    const clamped = Math.max(0, Math.min(100, value));
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - clamped / 100);
    const center = size / 2;

    return (
        <svg
            width={size}
            height={size}
            className={className}
            viewBox={`0 0 ${size} ${size}`}
            role={decorative ? undefined : 'img'}
            aria-hidden={decorative || undefined}
            aria-label={decorative ? undefined : (ariaLabel ?? `${Math.round(clamped)}% complete`)}
        >
            {/* Track */}
            <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={trackColor}
                strokeWidth={strokeWidth}
            />
            {/* Progress arc — rotated -90° so it starts at 12 o'clock. */}
            <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: 'stroke-dashoffset 300ms ease-out' }}
            />
        </svg>
    );
});
