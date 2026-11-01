import { useEffect, useState } from 'react';
import { listenEmailJob } from '../features/email/emailJobsApi';
import type { EmailJob } from '../lib/types';

const plural = (n: number) => `${n} member${n === 1 ? '' : 's'}`;

/**
 * Live status line for a server-side email job: "Sending 12 of 52…" → "Queued for 52 members ✓". A done job has
 * handed every email to the mail queue; delivery happens after that, so the line says "queued", not "sent".
 */
export function EmailJobProgress({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<EmailJob | null>(null);

  useEffect(() => listenEmailJob(jobId, setJob), [jobId]);

  if (!job) {
    return (
      <p role="status" className="text-sm text-gray-500">
        Queued…
      </p>
    );
  }

  if (job.status === 'failed') {
    return (
      <p role="alert" className="text-sm text-red-600">
        Couldn&apos;t send: {job.error || 'unknown error'}
      </p>
    );
  }

  if (job.status === 'done') {
    const what = job.test
      ? `Test queued for ${job.recipients[0]?.displayName || plural(job.sent)} ✓`
      : `Queued for ${plural(job.sent)} ✓`;
    return (
      <div role="status" className="text-sm">
        <p className="text-green-700">
          {what}
          {job.failed > 0 && <span className="text-red-600"> ({job.failed} failed)</span>}
        </p>
        {!job.test && (
          <p className="text-xs text-gray-500">
            Delivery takes a few minutes; check Email → Recent emails for delivery status.
          </p>
        )}
      </div>
    );
  }

  return (
    <p role="status" className="text-sm text-gray-600">
      {`Sending ${job.sent + job.failed} of ${job.total}…`}
    </p>
  );
}

export default EmailJobProgress;
