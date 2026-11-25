import { ms, timeText } from '../format';
import type { CallReport, CallStep } from '../data/report';
import { totalMs } from '../data/report';
import { Bar, Card, colors, Pill } from './components';

/**
 * One status UI for every action (identify, enroll, import, attribute): outcome pill, total
 * time, when it finished, then one row per SDK call with pass/fail, its time and its share of
 * the total. Android `shell/StatusCard.kt`.
 */

/** Readable names for the stable step identifiers. */
export function stepName(name: string): string {
  switch (name) {
    case 'faceDetection':
      return 'Face detection';
    case 'templateExtraction':
      return 'Template extraction';
    case 'similarity':
      return '1:N search';
    case 'livenessCheck':
      return 'Liveness check';
    case 'duplicateCheck':
      return 'Duplicate check (1:N)';
    case 'save':
      return 'Save to gallery';
    default:
      return name;
  }
}

export function functionName(fn: string): string {
  switch (fn) {
    case 'identify':
      return 'Identify';
    case 'enroll':
      return 'Enroll';
    case 'attribute':
      return 'Attribute';
    default:
      return fn ? fn[0]!.toUpperCase() + fn.slice(1) : fn;
  }
}

export default function StatusCard({
  report,
  title,
  showDetail = true,
}: {
  report: CallReport;
  title?: string;
  showDetail?: boolean;
}) {
  const total = totalMs(report);
  const ok = report.steps.filter((s) => s.ok).length;
  const at =
    report.finishedAt > 0 ? timeText(new Date(report.finishedAt)) : '';
  const summary = [
    `Total ${ms(total)} ms`,
    `${ok} of ${report.steps.length} calls`,
    ...(at ? [at] : []),
  ].join('  ·  ');

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>
          {title ?? `${functionName(report.function)} status`}
        </div>
        <Pill color={report.success ? colors.statusMatch : colors.danger}>
          {report.success ? 'Success' : 'Failed'}
        </Pill>
      </div>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{summary}</div>

      <div style={{ marginTop: 10 }}>
        {report.steps.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.7 }}>No SDK calls were made.</div>
        ) : (
          report.steps.map((s, i) => (
            <StepRow key={`${s.name}-${i}`} step={s} total={total || 1} />
          ))
        )}
      </div>

      {showDetail && report.detail.trim() !== '' && (
        <div style={{ fontSize: 13, marginTop: 8 }}>{report.detail}</div>
      )}
    </Card>
  );
}

function StepRow({ step, total }: { step: CallStep; total: number }) {
  const color = step.ok ? colors.statusMatch : colors.danger;
  const share = Math.min(1, Math.max(step.ms > 0 ? 0.01 : 0, step.ms / total));
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: color,
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {step.ok ? '✓' : '✕'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
            {stepName(step.name)}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{ms(step.ms)} ms</div>
        </div>
        {step.detail !== '' && (
          <div style={{ fontSize: 12, opacity: 0.7 }}>{step.detail}</div>
        )}
        <div style={{ marginTop: 5 }}>
          <Bar value={share} color={color} />
        </div>
      </div>
    </div>
  );
}
