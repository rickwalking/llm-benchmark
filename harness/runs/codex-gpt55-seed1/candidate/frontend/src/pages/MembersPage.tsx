import { Plus, UserRound } from "lucide-react";
import type { ReactElement } from "react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import Message from "../components/Message";
import type { Member } from "../types";
import { formatDate } from "../utils";

const emptyForm = { name: "", email: "" };

export default function MembersPage(): ReactElement {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(emptyForm);

  async function load(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      setMembers(await api.members());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load members");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      await api.createMember(form);
      setForm(emptyForm);
      setNotice("Member created.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create member");
    }
  }

  return (
    <div className="page-grid">
      <section>
        <div className="section-title">
          <div>
            <p className="eyebrow">Members</p>
            <h2>Library Members</h2>
          </div>
        </div>
        {loading ? <p className="empty-state">Loading members…</p> : null}
        {error ? <Message kind="error">{error}</Message> : null}
        {!loading && members.length === 0 ? <p className="empty-state">No members have been added yet.</p> : null}
        <div className="list">
          {members.map((member) => (
            <Link className="list-row" key={member.id} to={`/members/${member.id}`}>
              <span>
                <strong>{member.name}</strong>
                <small>{member.email} · since {formatDate(member.member_since)}</small>
              </span>
              <span className={member.status === "suspended" ? "pill danger" : "pill"}>
                {member.status}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <aside className="side-panel" aria-labelledby="add-member-heading">
        <h2 id="add-member-heading">Add Member</h2>
        {notice ? <Message kind="success">{notice}</Message> : null}
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Name
            <input
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label>
            Email
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </label>
          <button type="submit">
            <Plus aria-hidden="true" size={16} /> Add member
          </button>
        </form>
        <p className="muted">
          <UserRound aria-hidden="true" size={16} /> Members are selected explicitly at checkout.
        </p>
      </aside>
    </div>
  );
}
