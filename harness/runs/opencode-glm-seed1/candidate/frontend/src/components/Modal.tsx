import { useEffect, useRef } from 'react';

interface ModalProps {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
}

export function Modal({ title, children, onCancel }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  useEffect(() => {
    const el = overlayRef.current?.querySelector<HTMLElement>('[data-autofocus]');
    if (el) el.focus();
    else overlayRef.current?.focus();
  }, []);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onCancel();
  }

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
    >
      <div className="modal">
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}