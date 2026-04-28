import { useState } from 'react';
import Modal from './Modal';
import { api, ApiError } from '../api';

export default function CreateMemberModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await api.members.create({ name, email });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create member');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add New Member"
      actions={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Member'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label htmlFor="member-name">Name *</label>
        <input id="member-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="member-email">Email *</label>
        <input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
    </Modal>
  );
}
