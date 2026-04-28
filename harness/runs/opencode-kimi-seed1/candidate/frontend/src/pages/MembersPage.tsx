import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch, useMutation } from '../hooks/useApi';
import { useSelectedMember } from '../contexts/MemberContext';
import type { Member } from '../types';
import { Loading, ErrorMessage, EmptyState } from '../components/Status';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

function MemberCard({ member, isSelected, onSelect }: {
  member: Member;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={`member-card ${isSelected ? 'selected' : ''}`}>
      <div className="member-info">
        <h3>{member.name}</h3>
        <p>{member.email}</p>
        <p className="member-since">Member since: {member.member_since}</p>
        <span className={`status-badge ${member.status}`}>{member.status}</span>
      </div>
      <div className="member-actions">
        <Link to={`/members/${member.id}`} className="btn btn-secondary">
          View Profile
        </Link>
        <Button
          onClick={onSelect}
          variant={isSelected ? 'secondary' : 'primary'}
        >
          {isSelected ? 'Selected' : 'Select'}
        </Button>
      </div>
    </div>
  );
}

export function MembersPage() {
  const { selectedMember, setSelectedMember } = useSelectedMember();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: members, loading, error, refetch } = useFetch<Member[]>('/api/members');
  const { mutate: createMember, loading: creating } = useMutation<Member, { name: string; email: string }>(
    '/api/members',
    {
      onSuccess: () => {
        setShowAddModal(false);
        setNewMember({ name: '', email: '' });
        setFormError(null);
        refetch();
      },
      onError: (err) => setFormError(err)
    }
  );

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    await createMember(newMember);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Members</h1>
        <Button onClick={() => setShowAddModal(true)}>Add Member</Button>
      </div>

      {!members || members.length === 0 ? (
        <EmptyState
          message="No members yet."
          action={<Button onClick={() => setShowAddModal(true)}>Add First Member</Button>}
        />
      ) : (
        <div className="members-list">
          {members.map(member => (
            <MemberCard
              key={member.id}
              member={member}
              isSelected={selectedMember?.id === member.id}
              onSelect={() => setSelectedMember(member)}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Member"
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="member-name">Name *</label>
            <input
              id="member-name"
              type="text"
              value={newMember.name}
              onChange={e => setNewMember(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="member-email">Email *</label>
            <input
              id="member-email"
              type="email"
              value={newMember.email}
              onChange={e => setNewMember(prev => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>
          {formError && (
            <p className="error-text" role="alert">{formError}</p>
          )}
          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={creating}>
              Add Member
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
