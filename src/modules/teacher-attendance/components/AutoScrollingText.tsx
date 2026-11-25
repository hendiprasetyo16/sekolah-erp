// src/modules/teacher-attendance/components/AutoScrollingText.tsx
import { useState, useEffect, useRef } from 'react';

interface AutoScrollingTextProps {
    text: string;
    className?: string;
}

export function AutoScrollingText({
    text,
    className = '',
}: AutoScrollingTextProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const measureRef = useRef<HTMLSpanElement | null>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [durationSec, setDurationSec] = useState(8);

    useEffect(() => {
        const checkOverflow = () => {
            const container = containerRef.current;
            const measure = measureRef.current;
            if (!container || !measure) return;

            const overflow = measure.offsetWidth > container.clientWidth + 2;
            setIsOverflowing(overflow);
            if (overflow) {
                setDurationSec(Math.max(6, Math.round((measure.offsetWidth + 32) / 35)));
            }
        };

        checkOverflow();

        const observer =
            typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(checkOverflow)
                : null;
        if (observer && containerRef.current) {
            observer.observe(containerRef.current);
        }
        window.addEventListener('resize', checkOverflow);

        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', checkOverflow);
        };
    }, [text]);

    return (
        <div
            ref={containerRef}
            style={
                isOverflowing
                    ? {
                        maskImage:
                            'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
                        WebkitMaskImage:
                            'linear-gradient(to right, transparent, black 6%, black 94%, transparent)',
                    }
                    : undefined
            }
            className={`relative overflow-hidden whitespace-nowrap ${className}`}
            title={text}
        >
            <span
                ref={measureRef}
                aria-hidden="true"
                className="invisible absolute pointer-events-none whitespace-nowrap"
            >
                {text}
            </span>

            {isOverflowing ? (
                <div
                    className="inline-flex w-max animate-attendance-marquee hover:[animation-play-state:paused]"
                    style={{ animationDuration: `${durationSec}s` }}
                >
                    <span className="pr-8">{text}</span>
                    <span className="pr-8" aria-hidden="true">
                        {text}
                    </span>
                </div>
            ) : (
                <span>{text}</span>
            )}
        </div>
    );
}