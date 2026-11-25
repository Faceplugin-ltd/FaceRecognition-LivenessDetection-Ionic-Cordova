import { useEffect, useState } from 'react';
import { displayUri, resolveDisplaySrc } from '../pickImage';
import type { ReactNode } from 'react';

/**
 * The shared look of the demo (Android `shell/Ui.kt` and `view_section.xml`): status colours,
 * the pill, the card, metric tiles and the label/value rows every screen is built from.
 */

/** Straight from the Android app's `colors.xml`, so the two look like one product. */
export const colors = {
  statusMatch: '#2E7D32',
  statusNoMatch: '#B26A00',
  statusInfo: '#1976D2',
  danger: '#B3261E',
  accent: '#D0BCFF',
  livenessReal: '#2EE6A6',
  surface: 'var(--fp-surface-container)',
  outline: 'var(--fp-outline-variant)',
  onSurface: 'var(--fp-on-surface)',
  muted: 'var(--fp-on-surface-variant)',
} as const;

export type BadgeKind = 'pass' | 'fail' | 'warn' | 'info';

export const badgeColor: Record<BadgeKind, string> = {
  pass: colors.statusMatch,
  fail: colors.danger,
  warn: colors.statusNoMatch,
  info: colors.statusInfo,
};

/** A rounded, tinted label — outcomes, ID tags and badges. */
export function Pill({
  children,
  color,
  size = 12,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
}) {
  return (
    <span
      style={{
        background: color ?? 'var(--fp-outline-variant)',
        color: color ? '#fff' : 'var(--fp-on-surface)',
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: size,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** The card every section and status block sits in. */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: 'var(--fp-surface-container)',
        border: '1px solid var(--fp-outline-variant)',
        borderRadius: 16,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** One big number with a caption under it. Used in rows of three. */
export function MetricTile({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--fp-surface-container)',
        border: '1px solid var(--fp-outline-variant)',
        borderRadius: 12,
        padding: '12px 8px',
        textAlign: 'center',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--fp-on-surface-variant)', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

export function MetricsRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 8 }}>{children}</div>;
}

/** A thin progress bar; [value] is 0..1. */
export function Bar({ value, color }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div
      style={{
        height: 4,
        borderRadius: 999,
        background: 'var(--fp-outline-variant)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: color ?? colors.accent,
        }}
      />
    </div>
  );
}

/** A titled card holding label/value rows — the Attribute and capture-check sections. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </Card>
  );
}

/** One label / value row, with an optional badge and a score bar under it. */
export function Row({
  label,
  value,
  badge,
  score,
  onClick,
  preWrap,
}: {
  label: string;
  value: string;
  badge?: [string, BadgeKind];
  score?: number | null;
  onClick?: () => void;
  /** Long values (the landmark list) keep their newlines and scroll. */
  preWrap?: boolean;
}) {
  const showBar = typeof score === 'number' && Number.isFinite(score);
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 0',
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div
          style={{
            width: 108,
            flexShrink: 0,
            fontSize: 13,
            color: 'var(--fp-on-surface-variant)',
          }}
        >
          {label}
        </div>
        <div
          style={{
            flex: 1,
            fontSize: 14,
            minWidth: 0,
            whiteSpace: preWrap ? 'pre-wrap' : 'normal',
            maxHeight: preWrap ? 160 : undefined,
            overflowY: preWrap ? 'auto' : undefined,
            wordBreak: 'break-word',
          }}
        >
          {value}
        </div>
        {badge && (
          <Pill color={badgeColor[badge[1]]} size={11}>
            {badge[0]}
          </Pill>
        )}
      </div>
      {showBar && (
        <div style={{ marginTop: 6 }}>
          <Bar value={score} color={badge ? badgeColor[badge[1]] : undefined} />
        </div>
      )}
    </div>
  );
}

/** A stored crop or original by file path; falls back to a neutral placeholder. */
export function FaceImage({
  path,
  size,
  round,
  alt = '',
}: {
  path?: string | null;
  size?: number;
  round?: boolean;
  alt?: string;
}) {
  const [src, setSrc] = useState(() =>
    path && /^(https?|data|blob):/.test(path) ? path : ''
  );
  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setSrc('');
      return;
    }
    if (/^(https?|data|blob):/.test(path)) {
      setSrc(path);
      return;
    }
    setSrc('');
    void resolveDisplaySrc(path).then((next) => {
      if (!cancelled) setSrc(next);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const box: React.CSSProperties = {
    width: size ?? '100%',
    height: size ?? '100%',
    aspectRatio: size ? undefined : '1 / 1',
    borderRadius: round ? '50%' : 12,
    objectFit: 'cover',
    background: 'var(--fp-surface-container)',
    flexShrink: 0,
  };
  if (!path) {
    return (
      <div
        style={{
          ...box,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          opacity: 0.5,
        }}
      >
        No photo
      </div>
    );
  }
  if (!src) {
    return <div style={box} aria-hidden />;
  }
  return <img src={src} alt={alt} style={box} />;
}

/**
 * App-private files are not loadable from the Cordova WebView by path (https://localhost
 * blocks file://). Prefer data:/http(s); otherwise convertFileSrc or a cached data URL.
 */
export function toSrc(path: string): string {
  if (!path) return '';
  if (/^(https?|data|blob):/.test(path)) return path;
  return displayUri(path) ?? path;
}
