import { useId } from 'react';
import { useAuth } from '../auth/useAuth';
import type { Member } from '../lib/types';

export interface MemberPickerProps {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}

/**
 * Pick one emailable member (active, with an address), sorted by name, with
 * the signed-in admin first as "(me)". Used for one-person and test sends.
 */
export function MemberPicker({ members, value, onChange, label = 'Member' }: MemberPickerProps) {
  const { member: me } = useAuth();
  const id = useId();
  const eligible = members
    .filter((m) => m.status === 'active' && (m.email ?? '').trim() !== '')
    .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
  const mine = eligible.find((m) => m.id === me?.id);
  const options = mine ? [mine, ...eligible.filter((m) => m !== mine)] : eligible;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-garden-500"
      >
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {(m.displayName || '(no name)') + (m === mine ? ' (me)' : '')}
          </option>
        ))}
      </select>
    </div>
  );
}

export default MemberPicker;
