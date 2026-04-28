import { Modal } from './Modal';

interface PayFineModalProps {
  fineId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function PayFineModal({ fineId, onConfirm, onCancel }: PayFineModalProps) {
  return (
    <Modal title="Confirm Payment" onCancel={onCancel}>
      <p>Are you sure you want to pay this fine?</p>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>Fine ID: {fineId}</p>
      <div className="modal-actions">
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" data-autofocus onClick={onConfirm}>Pay Fine</button>
      </div>
    </Modal>
  );
}