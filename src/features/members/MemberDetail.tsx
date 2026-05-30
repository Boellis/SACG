import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { Button, Card, Badge, Field } from '../../components/ui';
import type { Member, Plot, Role, MemberStatus, VolunteerHour } from '../../lib/types';
import {
  listenMember,
  approveMember,
  setMemberRole,
  setMemberStatus,
  updateMemberProfile,
} from './membersApi';
import { listenPlots } from '../plots/plotsApi';
import { listenMemberHours, addHours, deleteHours } from '../hours/hoursApi';
import { yearToDateHours } from '../../logic/hours';
import { formatTenure } from '../../lib/tenure';

function RoleBadge({ role }: { role: Role }) {
  return <Badge color={role === 'admin' ? 'blue' : 'gray'}>{role}</Badge>;
}

function StatusBadge({ status }: { status: MemberStatus }) {
  const colorMap: Record<MemberStatus, 'green' | 'amber' | 'gray'> = {
    active: 'green',
    pending: 'amber',
    inactive: 'gray',
  };
  return <Badge color={colorMap[status]}>{status}</Badge>;
}

export default function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [hourEntries, setHourEntries] = useState<VolunteerHour[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Add hours form state
  const [hoursDate, setHoursDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [hoursAmount, setHoursAmount] = useState('');
  const [hoursDesc, setHoursDesc] = useState('');
  const [addingHours, setAddingHours] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsub = listenMember(id, (m) => setMember(m));
    return unsub;
  }, [id]);

  useEffect(() => {
    const unsub = listenPlots((data) => setPlots(data));
    return unsub;
  }, []);

  useEffect(() => {
    if (!id) return;
    const unsub = listenMemberHours(id, setHourEntries);
    return unsub;
  }, [id]);

  function startEdit() {
    if (!member) return;
    setEditName(member.displayName);
    setEditPhone(member.phone ?? '');
    setEditNotes(member.notes ?? '');
    setSaveError('');
    setEditing(true);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setSaving(true);
    setSaveError('');
    try {
      await updateMemberProfile(member.id, {
        displayName: editName.trim() || undefined,
        phone: editPhone.trim() || undefined,
        notes: editNotes.trim() || undefined,
      });
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleRole() {
    if (!member) return;
    await setMemberRole(member.id, member.role === 'admin' ? 'member' : 'admin');
  }

  async function handleSetStatus(status: MemberStatus) {
    if (!member) return;
    await setMemberStatus(member.id, status);
  }

  async function handleApprove() {
    if (!member) return;
    await approveMember(member.id);
  }

  const memberPlots = member ? plots.filter((p) => p.holderMemberId === member.id) : [];
  const ytdHours = yearToDateHours(hourEntries, new Date().getUTCFullYear());
  const sortedHours = [...hourEntries].sort(
    (a, b) => b.date.toDate().getTime() - a.date.toDate().getTime(),
  );

  async function handleAddHours(e: React.FormEvent) {
    e.preventDefault();
    if (!member || !user) return;
    const hrs = parseFloat(hoursAmount);
    if (isNaN(hrs) || hrs <= 0) return;
    setAddingHours(true);
    try {
      await addHours({
        memberId: member.id,
        date: new Date(hoursDate + 'T00:00:00'),
        hours: hrs,
        description: hoursDesc.trim() || undefined,
        recordedBy: user.uid,
      });
      setHoursAmount('');
      setHoursDesc('');
    } finally {
      setAddingHours(false);
    }
  }

  if (member === undefined) {
    return <div className="p-6 text-gray-500 text-sm">Loading member…</div>;
  }

  if (member === null) {
    return (
      <div className="p-6">
        <p className="text-red-600 font-medium">Member not found.</p>
        <Button variant="ghost" onClick={() => navigate('/members')} className="mt-4">
          Back to Members
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/members')}>
          ← Back
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">{member.displayName}</h1>
        <RoleBadge role={member.role} />
        <StatusBadge status={member.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Member Info */}
        <Card title="Member Info">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Email</dt>
              <dd className="font-medium">{member.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Phone</dt>
              <dd className="font-medium">{member.phone || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Hours (this year)</dt>
              <dd className="font-medium">{member.currentYearHours}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Member since</dt>
              <dd className="font-medium">
                {member.joinedAt ? member.joinedAt.toDate().toLocaleDateString() : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Active in SACG for</dt>
              <dd className="font-medium">{formatTenure(member.joinedAt, new Date())}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="font-medium">{member.createdAt.toDate().toLocaleDateString()}</dd>
            </div>
            {member.notes && (
              <div className="pt-2 border-t border-gray-100">
                <dt className="text-gray-500 mb-1">Notes</dt>
                <dd className="text-gray-800">{member.notes}</dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Admin Actions */}
        <Card title="Admin Actions">
          <div className="space-y-3">
            {member.status === 'pending' && (
              <Button onClick={handleApprove} className="w-full">
                Approve Member
              </Button>
            )}
            <Button variant="secondary" onClick={handleToggleRole} className="w-full">
              Switch to {member.role === 'admin' ? 'member' : 'admin'}
            </Button>
            <div className="flex gap-2">
              {(['active', 'inactive', 'pending'] as MemberStatus[]).map((s) => (
                <Button
                  key={s}
                  variant={member.status === s ? 'primary' : 'secondary'}
                  onClick={() => handleSetStatus(s)}
                  className="flex-1 text-xs"
                  disabled={member.status === s}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </Card>

        {/* Plots */}
        <Card title="Plots Held">
          {memberPlots.length === 0 ? (
            <p className="text-sm text-gray-500">No plots assigned.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {memberPlots.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span className="font-medium">{p.id}</span>
                  <span className="text-gray-500">{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Volunteer Hours */}
        <Card title="Volunteer Hours">
          <p className="text-sm text-gray-700 mb-3">
            YTD: <span className="font-semibold">{ytdHours}</span> hrs
          </p>
          {sortedHours.length === 0 ? (
            <p className="text-sm text-gray-500 mb-3">No entries yet.</p>
          ) : (
            <ul className="space-y-1 text-sm mb-4">
              {sortedHours.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                  <span>
                    {e.date.toDate().toLocaleDateString()} &mdash;{' '}
                    <strong>{e.hours} hrs</strong>
                    {e.description && ` — ${e.description}`}
                  </span>
                  <Button
                    variant="danger"
                    className="text-xs px-2 py-0.5 ml-2"
                    onClick={() => deleteHours(e.id)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={handleAddHours} className="space-y-2 border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Add Entry</p>
            <Field
              label="Date"
              type="date"
              value={hoursDate}
              onChange={(e) => setHoursDate(e.target.value)}
            />
            <Field
              label="Hours"
              type="number"
              step="0.5"
              min="0.5"
              value={hoursAmount}
              onChange={(e) => setHoursAmount(e.target.value)}
              placeholder="e.g. 2"
            />
            <Field
              label="Description (optional)"
              value={hoursDesc}
              onChange={(e) => setHoursDesc(e.target.value)}
              placeholder="e.g. Workday"
            />
            <Button type="submit" disabled={addingHours} className="w-full">
              {addingHours ? 'Adding…' : 'Add Hours'}
            </Button>
          </form>
        </Card>

        {/* Edit Profile */}
        <Card title="Edit Profile">
          {editing ? (
            <form onSubmit={handleSaveProfile} className="space-y-3">
              <Field
                label="Display Name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <Field
                label="Phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="e.g. 555-123-4567"
              />
              <div className="flex flex-col gap-1">
                <label htmlFor="edit-notes" className="text-sm font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  id="edit-notes"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500"
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="secondary" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button onClick={startEdit}>Edit name / phone / notes</Button>
          )}
        </Card>
      </div>
    </div>
  );
}
