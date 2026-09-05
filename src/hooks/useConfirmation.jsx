import { useLingui } from "@lingui/react/macro";
import { CircleHelp, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "default",
  onCancel,
  onConfirm,
}) {
  const { t } = useLingui();
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-backdrop" onMouseDown={onCancel} role="presentation">
      <section
        aria-describedby="confirmation-message"
        aria-labelledby="confirmation-title"
        aria-modal="true"
        className={`confirm-dialog ${tone === "danger" ? "danger" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <span className="confirm-icon" aria-hidden="true">
          {tone === "danger" ? <TriangleAlert size={20} /> : <CircleHelp size={20} />}
        </span>
        <h2 id="confirmation-title">{title}</h2>
        <p id="confirmation-message">{message}</p>
        <div>
          <button className="secondary-button" onClick={onCancel} type="button">{cancelLabel ?? t`Keep editing`}</button>
          <button
            className={tone === "danger" ? "danger-confirm-button" : "primary-button"}
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {confirmLabel ?? t`Continue`}
          </button>
        </div>
      </section>
    </div>
  );
}

export function useConfirmation() {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolverRef.current?.(false);
    resolverRef.current = resolve;
    setRequest(options);
  }), []);

  const resolve = useCallback((accepted) => {
    resolverRef.current?.(accepted);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  useEffect(() => () => resolverRef.current?.(false), []);

  return {
    confirm,
    confirmationDialog: request ? (
      <ConfirmDialog {...request} onCancel={() => resolve(false)} onConfirm={() => resolve(true)} />
    ) : null,
  };
}
