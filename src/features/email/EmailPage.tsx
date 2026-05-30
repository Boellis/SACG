import { useState, useEffect } from 'react';
import { listenMembers } from '../members/membersApi';
import { activeMemberEmails, customEmails, dedupeEmails } from '../../logic/emailAudience';
import { buildGmailComposeUrl, buildMailtoUrl } from '../../lib/emailLinks';
import { Button, Card } from '../../components/ui';
import type { Member } from '../../lib/types';

type AudienceMode = 'all' | 'custom';

export default function EmailPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    return listenMembers(setMembers);
  }, []);

  const activeMembers = members.filter((m) => m.status === 'active');

  const rawEmails =
    audienceMode === 'all'
      ? activeMemberEmails(members)
      : customEmails(members, Array.from(selectedIds));

  const emails = dedupeEmails(rawEmails);

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const canCompose = emails.length > 0;
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
          Will BCC {emails.length} member{emails.length !== 1 ? 's' : ''}
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
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              variant="primary"
              disabled={!canCompose}
              onClick={() => window.open(gmailUrl, '_blank')}
            >
              Compose in Gmail
            </Button>

            <a
              href={canCompose ? mailtoUrl : undefined}
              aria-disabled={!canCompose}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors border border-garden-600 ${
                canCompose
                  ? 'text-garden-700 bg-white hover:bg-garden-50'
                  : 'text-gray-400 border-gray-300 pointer-events-none cursor-not-allowed'
              }`}
            >
              Use my mail app
            </a>
          </div>

          <p className="text-xs text-gray-500">
            Opens a compose window from your signed-in email; recipients are BCC&apos;d so they don&apos;t see each other.
          </p>
        </div>
      </Card>
    </div>
  );
}
