import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../features/email/emailJobsApi', () => ({
  listenEmailJob: vi.fn(),
}));

import * as emailJobsApiMod from '../features/email/emailJobsApi';
import { EmailJobProgress } from './EmailJobProgress';
import type { EmailJob } from '../lib/types';

const mockedListen = vi.mocked(emailJobsApiMod.listenEmailJob);

const job = (over: Partial<EmailJob>): EmailJob =>
  ({
    id: 'job-1',
    subject: 'S',
    body: 'B',
    recipients: [{ memberId: 'm1', displayName: 'Denny Smith', email: 'denny@example.com' }],
    total: 52,
    sent: 0,
    failed: 0,
    skippedNoEmail: 0,
    status: 'queued',
    test: false,
    source: 'calendar',
    createdBy: 'admin1',
    createdByName: 'Ada Admin',
    ...over,
  }) as EmailJob;

describe('EmailJobProgress', () => {
  let emit: (j: EmailJob | null) => void;
  const unsubscribe = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedListen.mockImplementation((_id, cb) => {
      emit = cb;
      return unsubscribe;
    });
  });

  it('follows the job from sending to done', () => {
    const { unmount } = render(<EmailJobProgress jobId="job-1" />);
    expect(mockedListen).toHaveBeenCalledWith('job-1', expect.any(Function));

    act(() => emit(job({ status: 'sending', sent: 11, failed: 1 })));
    expect(screen.getByText('Sending 12 of 52…')).toBeInTheDocument();

    act(() => emit(job({ status: 'done', sent: 52 })));
    expect(screen.getByText('Sent to 52 members ✓')).toBeInTheDocument();

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('names the recipient of a test send', () => {
    render(<EmailJobProgress jobId="job-1" />);
    act(() => emit(job({ status: 'done', total: 1, sent: 1, test: true })));
    expect(screen.getByText('Test sent to Denny Smith ✓')).toBeInTheDocument();
  });

  it('shows the error when the job failed', () => {
    render(<EmailJobProgress jobId="job-1" />);
    act(() => emit(job({ status: 'failed', failed: 52, error: 'SMTP is down' })));
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send: SMTP is down");
  });
});
