import { Trans, useLingui } from "@lingui/react/macro";
import { Plus } from "lucide-react";
import { useState } from "react";

export function QuickAddItem({ autoFocus = false, onAdd }) {
  const { t } = useLingui();
  const [draft, setDraft] = useState("");

  function submit(event) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    onAdd(title);
    setDraft("");
  }

  return (
    <form className="picker-add" onSubmit={submit}>
      <input
        aria-label={t`Add an item to the queue`}
        autoFocus={autoFocus}
        maxLength={160}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t`New item`}
        value={draft}
      />
      <button disabled={!draft.trim()} type="submit">
        <Plus size={15} aria-hidden="true" />
        <Trans>Add</Trans>
      </button>
    </form>
  );
}
