import { championIcon, championName, type ProStreamer } from '../../data/proStreamers';

/** Card subtitle: most played champions (one for one-tricks), lane and label. */
export function ProMeta({ pro }: { pro: ProStreamer }) {
  return (
    <span className="pro-meta">
      {pro.champions.length > 0 && (
        <span className="champ-icons">
          {pro.champions.map((id) => (
            <img
              key={id}
              src={championIcon(id)}
              alt={championName(id)}
              width={18}
              height={18}
              loading="lazy"
              // No broken-image symbol when the CDN is unreachable.
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ))}
        </span>
      )}
      <span className="pro-meta-text">
        <b>{pro.lane}</b> · {pro.label}
      </span>
    </span>
  );
}
