import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}));

import * as useAuthMod from '../auth/useAuth';
import { MemberPicker } from './MemberPicker';
import type { Member } from '../lib/types';

const mockedUseAuth = vi.mocked(useAuthMod.useAuth);

const member = (id: string, displayName: string, over: Partial<Member> = {}): Member =>
  ({ id, uid: id, email: `${id}@example.com`, displayName, role: 'member', status: 'active', ...over }) as Member;

const me = member('me', 'Brandon Ellis', { role: 'admin' });
const members = [
  member('zed', 'Zed Example'),
  me,
  member('amy', 'Amy Example'),
  member('noemail', 'No Email', { email: ' ' }),
  member('pending', 'Pat Pending', { status: 'pending' }),
];

describe('MemberPicker', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ user: null, member: me, role: 'admin', status: 'active', loading: false });
  });

  it('lists me first as "(me)", then active members with an email by name', () => {
    render(<MemberPicker members={members} value="me" onChange={vi.fn()} label="Send test to" />);
    const select = screen.getByLabelText('Send test to');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Brandon Ellis (me)', 'Amy Example', 'Zed Example']);
    expect(select).toHaveValue('me');
  });

  it('reports the picked member id', () => {
    const onChange = vi.fn();
    render(<MemberPicker members={members} value="me" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zed' } });
    expect(onChange).toHaveBeenCalledWith('zed');
  });
});
