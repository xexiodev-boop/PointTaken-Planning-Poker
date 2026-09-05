import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { useModal } from "../../hooks/useModal.js";
import { exportHistory } from "../../lib/export.js";

export function History({ room }) {
  const { history } = room;
  const [selected, setSelected] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <section className="side-section history-section">
        <div className="side-heading">
          <h2><Trans>Estimates</Trans></h2>
          <div className="history-heading-actions">
            {history.length > 0 && (
              <button onClick={() => setExportOpen(!exportOpen)} type="button"><Trans>Export</Trans></button>
            )}
            <span>{history.length}</span>
          </div>
        </div>
        {exportOpen && (
          <div className="export-menu">
            <button onClick={() => exportHistory(room, "csv")} type="button"><Trans>Download CSV</Trans></button>
            <button onClick={() => exportHistory(room, "markdown")} type="button"><Trans>Download Markdown</Trans></button>
          </div>
        )}
        {history.length === 0 ? (
          <p className="empty-history"><Trans>Finished tasks will collect here.</Trans></p>
        ) : (
          <ol className="history-list">
            {history.map((item) => (
              <li key={item.id}>
                <button onClick={() => setSelected(item)} type="button">
                  <span>{item.finalValue}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.metrics
                        ? <Trans>{item.metrics.consensusPercent}% agreement</Trans>
                        : (
                          <Plural
                            value={item.votes.filter((vote) => vote.confirmed).length}
                            one="# vote"
                            other="# votes"
                          />
                        )}
                    </small>
                  </div>
                  <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
      {selected && <ResultDetail item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function ResultDetail({ item, onClose }) {
  const { t } = useLingui();
  const counts = new Map();
  item.votes.forEach((vote) => {
    if (vote.value) counts.set(vote.value, (counts.get(vote.value) ?? 0) + 1);
  });
  const dialogRef = useModal(onClose);

  return (
    <div className="workspace-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="result-detail-title"
        aria-modal="true"
        className="results-screen workspace-modal"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow"><Trans>Completed estimate</Trans></p>
            <h1 id="result-detail-title">{item.title}</h1>
            <p>{new Date(item.completedAt).toLocaleString()}</p>
          </div>
          <div className="workspace-header-actions">
            <span className="completed-estimate">{item.finalValue}</span>
            <button className="workspace-close" onClick={onClose} type="button" aria-label={t`Close details`}><X size={17} aria-hidden="true" /></button>
          </div>
        </header>
        <main className="result-detail">
          <section className="result-detail-summary">
            <div>
              <span><Trans>Final estimate</Trans></span>
              <strong>{item.finalValue}</strong>
            </div>
            <div>
              <span><Trans>App suggestion</Trans></span>
              <strong>{item.suggestion?.value ?? t`None`}</strong>
            </div>
            <div>
              <span><Trans>Agreement</Trans></span>
              <strong>{item.metrics ? `${item.metrics.consensusPercent}%` : "—"}</strong>
            </div>
            <div>
              <span><Trans>Vote range</Trans></span>
              <strong>
                {item.metrics?.low
                  ? item.metrics.low === item.metrics.high ? item.metrics.low : `${item.metrics.low}–${item.metrics.high}`
                  : "—"}
              </strong>
            </div>
          </section>
          <section className="vote-breakdown">
            <div>
              <p className="eyebrow"><Trans>Vote breakdown</Trans></p>
              <h2><Trans>How the team voted</Trans></h2>
            </div>
            <div className="breakdown-bars">
              {[...counts.entries()].map(([value, count]) => (
                <div key={value}>
                  <strong>{value}</strong>
                  <span><i style={{ width: `${(count / item.votes.length) * 100}%` }} /></span>
                  <b>{count}</b>
                </div>
              ))}
            </div>
            <ol className="result-voter-list">
              {item.votes.map((vote) => (
                <li key={vote.participantId}>
                  <span>{vote.participantName}</span>
                  <strong>{vote.value ?? t`No vote`}</strong>
                </li>
              ))}
            </ol>
          </section>
        </main>
      </section>
    </div>
  );
}
