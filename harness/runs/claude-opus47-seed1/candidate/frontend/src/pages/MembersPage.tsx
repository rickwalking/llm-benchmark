import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, HttpError } from '../api/client';
import type { Member } from '../api/types';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';

export default function MembersPage() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  function load() {
    setError(null);
    api
      .listMembers()
      .then(setMembers)
      .catch((err: Error) => setError(err.message));
  }

  useEffect(load, []);

  return (
    <section aria-labelledby="members-heading">
      <div className="toolbar">
        <h1 id="members-heading">Members</h1>
        <button className="btn" onClick={() => setShowAdd(true)} type="button">
          Add member
        </button>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {!members && !error ? <Spinner label="Loading members…" /> : null}

      {members && members.length === 0 ? (
        <EmptyState
          title="No members yet"
          description="Register the first library member."
          action={
            <button className="btn" onClick={() => setShowAdd(true)} type="button">
              Add member
            </button>
          }
        />
      ) : null}

      {members && members.length > 0 ? (
        <ul className="member-list" aria-label="Member list">
          {members.map((m) => (
            <li key={m.id}>
              <Link
                to={`/members/${m.id}`}
                className="member-row"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{m.name}</div>
                  <div className="muted">{m.email}</div>
                </div>
                <div>
                  {m.status === 'suspended' ? (
                    <span className="badge badge--unavailable">Suspended</span>
                  ) : (
                    <span className="badge badge--available">Active</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <AddMemberModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => {
          setShowAdd(false);
          load();
        }}
      />
    </section>
  );
}

interface AddProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function AddMemberModal({ open, onClose, onCreated }: AddProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setEmail('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createMember({ name, email });
      onCreated();
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'Could not create member');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title="Add a member" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate>
        {error ? <ErrorBanner message={error} /> : null}
        <div className="form-field">
          <label htmlFor="member-name">Name</label>
          <input
            id="member-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="member-email">Email</label>
          <input
            id="member-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add member'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
