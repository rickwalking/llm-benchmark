import { useEffect, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import { X } from "lucide-react";

type ModalProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
};

const focusableSelector =
  "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export default function Modal({ title, children, onClose }: ModalProps): ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(focusableSelector);
    focusable?.focus();
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key !== "Tab" || !dialog) {
        return;
      }
      const elements = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (elements.length === 0) {
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        aria-modal="true"
        aria-labelledby="modal-title"
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
