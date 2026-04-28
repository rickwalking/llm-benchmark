import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Member } from '../api';
import CreateMemberModal from '../components/CreateMemberModal';

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadMembers = () => {
    setLoading(true);
    api.members.list()
      .then(setMembers)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load members'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadMembers(); }, []);

  if (loading) {
    return <div className="loading"><span className="spinner" /> Loading members...</div>;
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  if (members.length === 0) {
    return (
      <div className="empty-state">
        <h3>No members registered</h3>
        <p>Add members to start lending books.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px' }}>Members</h1>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>Add Member</button>
      </div>

      <div className="card">
        <table className="table" aria-label="Members list">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Member Since</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td><Link to={`/members/${m.id}`}>{m.name}</Link></td>
                <td>{m.email}</td>
                <td>{m.member_since}</td>
                <td>
                  {m.status === 'active'
                    ? <span className="badge badge-success">Active</span>
                    : <span className="badge badge-danger">Suspended</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <CreateMemberModal onClose={() => { setShowCreateModal(false); loadMembers(); }} />
      )}
    </div>
  );
}
