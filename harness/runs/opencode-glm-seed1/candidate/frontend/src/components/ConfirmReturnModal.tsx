import { Modal } from './Modal';

interface ConfirmReturnModalProps {
  loanId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmReturnModal({ loanId, onConfirm, onCancel }: ConfirmReturnModalProps) {
  return (
    <Modal title="Confirm Return" onCancel={onCancel}>
      <p>Are you sure you want to mark this loan as returned?</p>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Loan ID: {loanId}</p>
      <div className="modal-actions">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" data-autofocus onClick={onConfirm}>Confirm Return</button>
      </div>
    </Modal>
  );
}