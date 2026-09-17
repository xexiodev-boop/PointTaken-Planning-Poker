import { Trans } from "@lingui/react/macro";
import { ListOrdered } from "lucide-react";
import { IssueKey } from "../IssueKey.jsx";
import { QuickAddItem } from "../round/QuickAddItem.jsx";

export function UpNext({ room, send, onManageItems }) {
  const round = room.currentRound;
  if (room.viewer.role !== "facilitator" || !round || round.phase === "finalized") return null;
  const queued = room.items.filter((item) => item.status === "pending" && item.id !== round.itemId);

  return (
    <section className="side-section up-next-section">
      <div className="side-heading">
        <h2><Trans>Up next</Trans></h2>
        <div className="side-heading-actions">
          <button className="picker-manage" onClick={onManageItems} type="button">
            <ListOrdered size={13} aria-hidden="true" />
            <Trans>Manage</Trans>
          </button>
          <span>{queued.length}</span>
        </div>
      </div>
      {queued.length ? (
        <ol className="up-next-list">
          {queued.map((item, index) => (
            <li key={item.id}>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <span><IssueKey item={item} />{item.title}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-history"><Trans>Nothing else is queued yet.</Trans></p>
      )}
      <QuickAddItem onAdd={(title) => send({ type: "add_items", titles: [title] })} />
    </section>
  );
}
