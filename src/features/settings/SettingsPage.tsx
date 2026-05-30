import { useEffect, useState } from 'react';
import { Card, Button, Field } from '../../components/ui';
import { listenSettings, saveSettings } from './settingsApi';
import type { OrgSettings } from '../../lib/types';

const DEFAULTS: OrgSettings = {
  requiredHours: 12,
  firstHalfHours: 6,
  firstHalfMonths: 6,
  defaultDeposit: 25,
  currentSeason: '2026',
  contactEmail: 'southatxgarden@gmail.com',
};

interface FormValues {
  requiredHours: string;
  firstHalfHours: string;
  firstHalfMonths: string;
  defaultDeposit: string;
  currentSeason: string;
  contactEmail: string;
}

function settingsToForm(s: OrgSettings): FormValues {
  return {
    requiredHours: String(s.requiredHours),
    firstHalfHours: String(s.firstHalfHours),
    firstHalfMonths: String(s.firstHalfMonths),
    defaultDeposit: String(s.defaultDeposit),
    currentSeason: s.currentSeason,
    contactEmail: s.contactEmail,
  };
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<FormValues>(settingsToForm(DEFAULTS));
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const unsub = listenSettings((s) => {
      if (s !== null) {
        setValues(settingsToForm({ ...DEFAULTS, ...s }));
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  function set(field: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    setSaveError('');
    try {
      await saveSettings({
        requiredHours: Number(values.requiredHours),
        firstHalfHours: Number(values.firstHalfHours),
        firstHalfMonths: Number(values.firstHalfMonths),
        defaultDeposit: Number(values.defaultDeposit),
        currentSeason: values.currentSeason,
        contactEmail: values.contactEmail,
      });
      setSavedMsg('Saved ✓');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="p-6 text-gray-500">Loading settings…</p>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
      <Card title="Org Configuration">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Required Hours (annual)"
              name="requiredHours"
              type="number"
              min="0"
              value={values.requiredHours}
              onChange={(e) => set('requiredHours', e.target.value)}
            />
            <Field
              label="First-Half Hours"
              name="firstHalfHours"
              type="number"
              min="0"
              value={values.firstHalfHours}
              onChange={(e) => set('firstHalfHours', e.target.value)}
            />
            <Field
              label="First-Half Months"
              name="firstHalfMonths"
              type="number"
              min="0"
              value={values.firstHalfMonths}
              onChange={(e) => set('firstHalfMonths', e.target.value)}
            />
            <Field
              label="Default Deposit ($)"
              name="defaultDeposit"
              type="number"
              min="0"
              value={values.defaultDeposit}
              onChange={(e) => set('defaultDeposit', e.target.value)}
            />
            <Field
              label="Current Season"
              name="currentSeason"
              type="text"
              value={values.currentSeason}
              onChange={(e) => set('currentSeason', e.target.value)}
            />
            <Field
              label="Contact Email"
              name="contactEmail"
              type="email"
              value={values.contactEmail}
              onChange={(e) => set('contactEmail', e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {savedMsg && <span className="text-sm text-green-600 font-medium">{savedMsg}</span>}
            {saveError && <span className="text-sm text-red-600">{saveError}</span>}
          </div>
        </form>
      </Card>
    </div>
  );
}
