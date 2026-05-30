import { useEffect, useState } from 'react';
import { getDoc } from 'firebase/firestore';
import { useAuth } from '../../auth/useAuth';
import { listenMemberHours, addHours, deleteHours } from './hoursApi';
import { hoursProgress } from '../../logic/hours';
import { settingsDoc } from '../../data/collections';
import { Card, Button, Field, Badge } from '../../components/ui';
import type { VolunteerHour, OrgSettings } from '../../lib/types';

const DEFAULT_SETTINGS: OrgSettings = {
  requiredHours: 12,
  firstHalfHours: 6,
  firstHalfMonths: 6,
  defaultDeposit: 25,
  currentSeason: '',
  contactEmail: '',
};

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function MyHoursPage() {
  const { member } = useAuth();
  const [entries, setEntries] = useState<VolunteerHour[]>([]);
  const [settings, setSettings] = useState<OrgSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Form state
  const [formDate, setFormDate] = useState(todayString());
  const [formHours, setFormHours] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!member) return;
    const unsub = listenMemberHours(member.id, setEntries);
    return unsub;
  }, [member]);

  useEffect(() => {
    getDoc(settingsDoc()).then((snap) => {
      if (snap.exists()) {
        setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<OrgSettings>) });
      }
      setSettingsLoaded(true);
    });
  }, []);

  if (!member) {
    return <p className="p-6 text-gray-500">Loading…</p>;
  }

  const now = new Date();
  const progress = settingsLoaded
    ? hoursProgress(member, entries, settings, now)
    : null;

  const ytdPercent = progress
    ? Math.min(100, (progress.ytd / progress.required) * 100)
    : 0;
  const firstHalfPercent = progress
    ? Math.min(100, (progress.firstHalf / progress.firstHalfRequired) * 100)
    : 0;

  // Sort newest-first by date
  const sorted = [...entries].sort(
    (a, b) => b.date.toDate().getTime() - a.date.toDate().getTime(),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    const hrs = parseFloat(formHours);
    if (isNaN(hrs) || hrs <= 0) {
      setFormError('Enter a positive number of hours.');
      return;
    }
    if (!formDate) {
      setFormError('Select a date.');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      await addHours({
        memberId: member.id,
        date: new Date(formDate + 'T00:00:00'),
        hours: hrs,
        description: formDesc.trim() || undefined,
        recordedBy: member.id,
      });
      setFormHours('');
      setFormDesc('');
      setFormDate(todayString());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to log hours.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteHours(id);
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-gray-900">My Volunteer Hours</h1>

      {/* Progress */}
      {progress && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title="Annual Hours (YTD)">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-700">
                {progress.ytd} / {progress.required} hrs
              </span>
              {progress.metAnnual ? (
                <Badge color="green">Requirement met</Badge>
              ) : (
                <Badge color="amber">In progress</Badge>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-garden-600 h-2.5 rounded-full transition-all"
                style={{ width: `${ytdPercent}%` }}
              />
            </div>
          </Card>

          {member.joinedAt && (
            <Card title="First 6 Months">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-700">
                  {progress.firstHalf} / {progress.firstHalfRequired} hrs
                </span>
                {progress.metFirstHalf ? (
                  <Badge color="green">Requirement met</Badge>
                ) : (
                  <Badge color="amber">In progress</Badge>
                )}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-garden-600 h-2.5 rounded-full transition-all"
                  style={{ width: `${firstHalfPercent}%` }}
                />
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Log Hours Form */}
      <Card title="Log Hours">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            label="Date"
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            max={todayString()}
          />
          <Field
            label="Hours"
            type="number"
            step="0.5"
            min="0.5"
            value={formHours}
            onChange={(e) => setFormHours(e.target.value)}
            placeholder="e.g. 2"
          />
          <Field
            label="Description (optional)"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            placeholder="e.g. Weeding workday"
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Logging…' : 'Log Hours'}
          </Button>
        </form>
      </Card>

      {/* Entry List */}
      <Card title="My Entries">
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-500">No hours logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <span className="font-medium text-sm">
                    {entry.date.toDate().toLocaleDateString()}
                  </span>
                  <span className="mx-2 text-gray-400">·</span>
                  <span className="text-sm text-garden-700 font-semibold">
                    {entry.hours} hrs
                  </span>
                  {entry.description && (
                    <span className="ml-2 text-sm text-gray-500">{entry.description}</span>
                  )}
                </div>
                <Button
                  variant="danger"
                  className="text-xs px-2 py-1"
                  onClick={() => handleDelete(entry.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
