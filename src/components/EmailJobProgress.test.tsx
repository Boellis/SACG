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

    // Done means every email is queued for delivery, not delivered: say so, and where to check.
    act(() => emit(job({ status: 'done', sent: 52 })));
    expect(screen.getByText('Queued for 52 members ✓')).toBeInTheDocument();
    expect(
      screen.getByText('Delivery takes a few minutes; check Email → Recent emails for delivery status.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sent to/i)).not.toBeInTheDocument();

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('counts what failed to queue', () => {
    render(<EmailJobProgress jobId="job-1" />);
    act(() => emit(job({ status: 'done', sent: 50, failed: 2 })));
    expect(screen.getByText(/^Queued for 50 members ✓/)).toHaveTextContent('Queued for 50 members ✓ (2 failed)');
  });

  it('names the recipient of a test send', () => {
    render(<EmailJobProgress jobId="job-1" />);
    act(() => emit(job({ status: 'done', total: 1, sent: 1, test: true })));
    expect(screen.getByText('Test queued for Denny Smith ✓')).toBeInTheDocument();
  });

  it('shows the error when the job failed', () => {
    render(<EmailJobProgress jobId="job-1" />);
    act(() => emit(job({ status: 'failed', failed: 52, error: 'SMTP is down' })));
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send: SMTP is down");
  });
});
