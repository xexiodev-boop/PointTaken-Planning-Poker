import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { GripVertical, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConfirmation } from "../../hooks/useConfirmation.jsx";
import { useModal } from "../../hooks/useModal.js";
import { IssueKey } from "../IssueKey.jsx";
import { JiraImport } from "./JiraImport.jsx";

export function ItemManager({ room, send, error, onClose }) {
  const { t } = useLingui();
  const [itemTitles, setItemTitles] = useState("");
  const pendingItems = useMemo(
    () => room.items.filter((item) => item.status === "pending"),
    [room.items],
  );
  const [orderedItems, setOrderedItems] = useState(pendingItems);
  const estimatedItems = room.items.filter((item) => item.status === "estimated");
  const votingItemId = room.currentRound && room.currentRound.phase !== "finalized"
    ? room.currentRound.itemId
    : null;
  const pendingOrderRef = useRef(null);
  const pendingSignature = pendingItems.map(({ id, title }) => `${id}:${title}`).join("|");
  const dialogRef = useModal(onClose);
  const { confirm, confirmationDialog } = useConfirmation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    setOrderedItems((current) => {
      const currentSignature = current.map(({ id, title }) => `${id}:${title}`).join("|");
      if (currentSignature === pendingSignature) {
        pendingOrderRef.current = null;
        return current;
      }
      if (pendingOrderRef.current && pendingOrderRef.current !== pendingSignature) {
        return current;
      }
      pendingOrderRef.current = null;
      return pendingItems;
    });
  }, [pendingItems, pendingSignature]);

  // A rejected reorder produces no state broadcast, so the optimistic order
  // would otherwise stay pinned indefinitely. `send` clears `error` on every
  // dispatch, so a fresh error while a reorder is in flight means the server
  // refused it — drop the pin and snap back to the authoritative order.
  useEffect(() => {
    if (error && pendingOrderRef.current) {
      pendingOrderRef.current = null;
      setOrderedItems(pendingItems);
    }
  }, [error, pendingItems]);

  function addItems(event) {
    event.preventDefault();
    const titles = itemTitles.split(/\r?\n/).map((title) => title.trim()).filter(Boolean);
    if (!titles.length) return;
    send({ type: "add_items", titles });
    setItemTitles("");
  }

  async function removeEstimated(item) {
    const accepted = await confirm({
      title: t`Remove this estimated item?`,
      message: t`“${item.title}” and its saved estimate will be deleted from this room.`,
      confirmLabel: t`Remove item`,
      tone: "danger",
    });
    if (accepted) send({ type: "remove_item", itemId: item.id });
  }

  function reorderItems(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedItems((items) => {
      const reordered = arrayMove(
        items,
        items.findIndex((item) => item.id === active.id),
        items.findIndex((item) => item.id === over.id),
      );
      pendingOrderRef.current = reordered.map(({ id, title }) => `${id}:${title}`).join("|");
      send({ type: "reorder_items", itemIds: reordered.map((item) => item.id) });
      return reordered;
    });
  }

  return (
    <div className="workspace-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="item-manager-title"
        aria-modal="true"
        className="items-screen workspace-modal"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header className="items-screen-header">
          <div>
            <p className="eyebrow"><Trans>Estimation queue</Trans></p>
            <h1 id="item-manager-title"><Trans>Items to estimate</Trans></h1>
            <p><Trans>Add one item per line. You can keep editing the queue during a vote.</Trans></p>
          </div>
          <div className="workspace-header-actions">
            <span className="items-room-name">{room.name}</span>
            <button className="workspace-close" onClick={onClose} type="button" aria-label={t`Close items`}><X size={17} aria-hidden="true" /></button>
          </div>
        </header>

        <div className="items-workspace">
          <section className="items-composer">
          <span className="item-step">01</span>
          <h2><Trans>Add items</Trans></h2>
          <p><Trans>Paste a list from your backlog or write the work down here.</Trans></p>
          <form onSubmit={addItems}>
            <textarea
              autoFocus
              maxLength={16000}
              onChange={(event) => setItemTitles(event.target.value)}
              placeholder={t`Login with SSO\nAdd audit log export\nImprove empty states`}
              rows={10}
              value={itemTitles}
            />
            <div>
              <small>
                <Plural
                  value={itemTitles.split(/\r?\n/).filter((line) => line.trim()).length}
                  one="# item ready"
                  other="# items ready"
                />
              </small>
              <button className="primary-button" disabled={!itemTitles.trim()} type="submit">
                <Trans>Add to session</Trans>
              </button>
            </div>
          </form>
          <JiraImport room={room} send={send} />
          </section>

          <section className="items-queue">
          <div className="items-queue-heading">
            <div>
              <span className="item-step">02</span>
              <h2><Trans>Session queue</Trans></h2>
            </div>
            <span><Plural value={pendingItems.length} one="# pending" other="# pending" /></span>
          </div>
          {orderedItems.length ? (
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={reorderItems}
              sensors={sensors}
            >
              <SortableContext items={orderedItems.map((item) => item.id)} strategy={rectSortingStrategy}>
                <ol>
                  {orderedItems.map((item, index) => (
                    <SortableQueueItem
                      locked={item.id === votingItemId}
                      index={index}
                      item={item}
                      key={item.id}
                      onRemove={() => send({ type: "remove_item", itemId: item.id })}
                      onUpdate={(title) => send({ type: "update_item", itemId: item.id, title })}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="items-queue-empty">
              <strong><Trans>Your queue is empty</Trans></strong>
              <p><Trans>Add a few items and they’ll appear here in voting order.</Trans></p>
            </div>
          )}
          {estimatedItems.length > 0 && (
            <div className="estimated-summary">
              <strong>
                <Plural
                  value={estimatedItems.length}
                  one="# already estimated"
                  other="# already estimated"
                />
              </strong>
              <ol>
                {estimatedItems.map((item) => (
                  <li key={item.id}>
                    <b>{item.finalValue}</b>
                    <span><IssueKey item={item} />{item.title}</span>
                    <button
                      className="queue-remove"
                      onClick={() => removeEstimated(item)}
                      type="button"
                      aria-label={t`Remove ${item.title}`}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
          </section>
        </div>
        {confirmationDialog}
      </section>
    </div>
  );
}

function SortableQueueItem({ index, item, locked, onRemove, onUpdate }) {
  const { t } = useLingui();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id, disabled: locked || editing });

  useEffect(() => {
    if (!editing) setTitle(item.title);
  }, [editing, item.title]);

  function save(event) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) return;
    onUpdate(nextTitle);
    setEditing(false);
  }

  return (
    <li
      className={isDragging ? "dragging" : ""}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="queue-drag-handle"
        disabled={locked}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t`Drag to reorder ${item.title}`}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <small>{String(index + 1).padStart(2, "0")}</small>
      {editing ? (
        <form className="queue-item-editor" onSubmit={save}>
          <input
            autoFocus
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <button type="submit"><Trans>Save</Trans></button>
          <button
            onClick={() => {
              setTitle(item.title);
              setEditing(false);
            }}
            type="button"
          >
            <Trans>Cancel</Trans>
          </button>
        </form>
      ) : (
        <>
          <span><IssueKey item={item} />{item.title}</span>
          <div className="queue-item-actions">
            {locked && <em className="queue-voting-badge"><Trans>Voting now</Trans></em>}
            <button
              className="queue-edit"
              disabled={locked}
              onClick={() => setEditing(true)}
              type="button"
              aria-label={t`Edit ${item.title}`}
            >
              <Trans>Edit</Trans>
            </button>
            <button
              className="queue-remove"
              disabled={locked}
              onClick={onRemove}
              type="button"
              aria-label={t`Remove ${item.title}`}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </li>
  );
}
