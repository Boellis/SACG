import { useState, useEffect } from 'react';
import { listenMembers } from '../members/membersApi';
import { buildGmailComposeUrl, buildMailtoUrl } from '../../lib/emailLinks';
import { enqueueIndividualEmails, listenRecentMail } from './mailApi';
import { useAuth } from '../../auth/useAuth';
import { Button, Card, Badge } from '../../components/ui';
import type { Member, MailDoc, MailDeliveryState } from '../../lib/types';

type AudienceMode = 'all' | 'custom';

function dedupeByEmail(members: Member[]): Member[] {
  const seen = new Set<string>();
  const out: Member[] = [];
  for (const m of members) {
    const key = (m.email ?? '').toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

function DeliveryBadge({ state }: { state?: MailDeliveryState }) {
  if (state === 'SUCCESS') return <Badge color="green">Sent</Badge>;
  if (state === 'ERROR') return <Badge color="red">Failed</Badge>;
  if (state === 'PROCESSING' || state === 'PENDING' || state === 'RETRY')
    return <Badge color="amber">Sending…</Badge>;
  return <Badge color="gray">Queued</Badge>;
}

export default function EmailPage() {
  const { member } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [sendError, setSendError] = useState('');
  const [recentMail, setRecentMail] = useState<MailDoc[]>([]);

  useEffect(() => listenMembers(setMembers), []);
  useEffect(() => listenRecentMail(setRecentMail), []);

  const activeMembers = members.filter((m) => m.status === 'active');

  // Recipients as full member objects (needed for per-person personalization),
  // deduped by email. Custom mode picks from the active members shown below.
  const recipients = dedupeByEmail(
    audienceMode === 'all' ? activeMembers : activeMembers.filter((m) => selectedIds.has(m.id)),
  );
  const emails = recipients.map((m) => m.email);
  const canSend = recipients.length > 0;

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSendIndividually() {
    if (!canSend || sending) return;
    if (!subject.trim() && !body.trim()) {
      setSendError('Add a subject or message before sending.');
      return;
    }
    const ok = window.confirm(
      `Send a separate, individual email to each of ${recipients.length} member${
        recipients.length !== 1 ? 's' : ''
      }?`,
    );
    if (!ok) return;

    setSending(true);
    setSendError('');
    setSendMsg('');
    try {
      const n = await enqueueIndividualEmails(recipients, subject, body, member?.id ?? null);
      setSendMsg(`Queued ${n} individual email${n !== 1 ? 's' : ''} for delivery.`);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to queue emails.');
    } finally {
      setSending(false);
    }
  }

  const gmailUrl = buildGmailComposeUrl(emails, subject, body);
  const mailtoUrl = buildMailtoUrl(emails, subject, body);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Email Members</h1>

      <Card title="Recipients">
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="audienceMode"
              value="all"
              checked={audienceMode === 'all'}
              onChange={() => setAudienceMode('all')}
              className="accent-garden-600"
            />
            <span className="text-sm font-medium text-gray-700">All active members</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="audienceMode"
              value="custom"
              checked={audienceMode === 'custom'}
              onChange={() => setAudienceMode('custom')}
              className="accent-garden-600"
            />
            <span className="text-sm font-medium text-gray-700">Custom selection</span>
          </label>
        </div>

        {audienceMode === 'custom' && (
          <div className="mt-4 border rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {activeMembers.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-500">No active members found.</p>
            )}
            {activeMembers.map((m) => (
              <label key={m.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedIds.has(m.id)}
                  onChange={() => toggleId(m.id)}
                  className="accent-garden-600"
                />
                <span className="text-sm text-gray-800">{m.displayName}</span>
                <span className="text-xs text-gray-500 ml-auto">{m.email}</span>
              </label>
            ))}
          </div>
        )}

        <p className="mt-3 text-sm font-medium text-garden-700">
          {recipients.length} recipient{recipients.length !== 1 ? 's' : ''} selected
        </p>
      </Card>

      <Card title="Message">
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email-subject" className="text-sm font-medium text-gray-700">
              Subject
            </label>
            <input
              id="email-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter subject…"
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500 border-gray-300"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="email-body" className="text-sm font-medium text-gray-700">
              Body
            </label>
            <textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="Enter message body…"
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500 border-gray-300 resize-y"
            />
          </div>

          <p className="text-xs text-gray-500">
            Personalize each message with <code className="text-garden-700">{'{firstName}'}</code>,{' '}
            <code className="text-garden-700">{'{name}'}</code>, or{' '}
            <code className="text-garden-700">{'{email}'}</code> — replaced per recipient.
          </p>
        </div>
      </Card>

      <Card title="Send individually">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Sends a <span className="font-medium">separate email to each recipient</span> — everyone
            gets their own message, so there is no shared thread and no visible recipient list.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={!canSend || sending} onClick={handleSendIndividually}>
              {sending
                ? 'Queuing…'
                : `Send individually to ${recipients.length} member${recipients.length !== 1 ? 's' : ''}`}
            </Button>
          </div>

          {sendMsg && <p className="text-sm text-garden-700 font-medium">{sendMsg}</p>}
          {sendError && <p className="text-sm text-red-600">{sendError}</p>}

          <p className="text-xs text-gray-500">
            Delivery is handled by the mail extension on the server. If nothing arrives, confirm the
            Trigger Email extension is installed and active (see the delivery log below).
          </p>
        </div>
      </Card>

      <Card title="Or compose one BCC email">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              variant="secondary"
              disabled={!canSend}
              onClick={() => window.open(gmailUrl, '_blank')}
            >
              Compose in Gmail
            </Button>

            <a
              href={canSend ? mailtoUrl : undefined}
              aria-disabled={!canSend}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors border border-garden-600 ${
                canSend
                  ? 'text-garden-700 bg-white hover:bg-garden-50'
                  : 'text-gray-400 border-gray-300 pointer-events-none cursor-not-allowed'
              }`}
            >
              Use my mail app
            </a>
          </div>

          <p className="text-xs text-gray-500">
            Opens a compose window from your signed-in email; recipients are BCC&apos;d so they don&apos;t see each other. Will BCC {emails.length} member{emails.length !== 1 ? 's' : ''}.
          </p>
        </div>
      </Card>

      <Card title="Recent emails">
        {recentMail.length === 0 ? (
          <p className="text-sm text-gray-500">No emails sent yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentMail.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">
                    {d.message?.subject || <span className="text-gray-400">(no subject)</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{d.toName || d.to?.[0]}</p>
                </div>
                <DeliveryBadge state={d.delivery?.state} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
