import { idTag, score } from '../format';
import type { Candidate, FaceRecord } from '../data/gallery';
import { Bar, FaceImage, Pill } from './components';

/** One match row: rank, round thumbnail, name, ID tag, similarity bar and score. */
export default function MatchRow({
  rank,
  candidate,
  record,
  onClick,
}: {
  rank: number;
  candidate: Candidate;
  record?: FaceRecord | null;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0',
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <div style={{ width: 20, fontSize: 13, fontWeight: 700, opacity: 0.7 }}>
        {rank}
      </div>
      <FaceImage path={record?.cropPath} size={44} round />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {record?.name ?? candidate.name}
          </div>
          <Pill size={11}>{idTag(candidate.id)}</Pill>
        </div>
        <div style={{ marginTop: 5 }}>
          <Bar value={candidate.similarity} />
        </div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>
        {score(candidate.similarity)}
      </div>
    </div>
  );
}
