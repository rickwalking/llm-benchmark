import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { api, type Member } from '../api';

export function MemberList() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadMembers();
  }, []);

  async function loadMembers() {
    try {
      setLoading(true);
      const data = await api.members.list();
      setMembers(data);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value,
      email: (form.elements.namedItem('email') as HTMLInputElement).value,
    };
    try {
      setFormError('');
      await api.members.create(data);
      setShowForm(false);
      form.reset();
      loadMembers();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to create member');
    }
  }

  if (loading) return <p>Loading members&hellip;</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Members</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add Member'}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: '1.5rem' }}>
          <h2>New Member</h2>
          {formError && <div className="alert alert-danger">{formError}</div>}
          <div className="form-group">
            <label htmlFor="member-name">Name</label>
            <input id="member-name" name="name" required />
          </div>
          <div className="form-group">
            <label htmlFor="member-email">Email</label>
            <input id="member-email" name="email" type="email" required />
          </div>
          <button type="submit" className="btn btn-primary">Create Member</button>
        </form>
      )}

      {members.length === 0 ? (
        <div className="empty-state">
          <p>No members registered yet.</p>
          <p>Click &quot;Add Member&quot; to register the first one.</p>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Active Loans</th>
                <th>Unpaid Fines</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td><Link to={`/members/${member.id}`}>{member.name}</Link></td>
                  <td>{member.email}</td>
                  <td>
                    <span className={`badge ${member.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {member.status}
                    </span>
                  </td>
                  <td>{member.active_loans}</td>
                  <td>{member.unpaid_fines_cents > 0 ? `$${(member.unpaid_fines_cents / 100).toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}