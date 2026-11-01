import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { Badge, Button } from '../../components/ui';
import { formatGardenDate } from '../../lib/gardenTime';
import { listenThreadActions, listenThreadMessages, listenThreads, sendAssistantMessage } from './assistantApi';
import ChatMessage from './ChatMessage';
import { errorText } from './errors';
import { placeActions } from './placement';
import type { AssistantAction, AssistantMessage, AssistantThread, ChatUsage } from './types';

/** The server refuses longer messages (MAX_MESSAGE_CHARS); say so up front rather than cut a paste short. */
const MAX_MESSAGE_CHARS = 20_000;

/** A message the admin just sent that the server hasn't stored yet. */
interface Pending {
  text: string;
  /** How many messages the thread had when it was sent; more than this means ours has arrived. */
  baseCount: number;
}

function threadSubtitle(thread: AssistantThread, meId: string | undefined): string {
  const updated = thread.updatedAt?.toDate?.();
  return [updated ? formatGardenDate(updated, 'short') : '', thread.createdBy !== meId ? thread.createdByName : '']
    .filter(Boolean)
    .join(' · ');
}

function turnsLeftText(usage: ChatUsage): string {
  const left = Math.max(0, usage.limit - usage.turnsToday);
  if (left === 0) return 'No turns left today';
  return `${left} turn${left === 1 ? '' : 's'} left today`;
}

/** Stands in until the action cards: one line per proposal. */
function ProposalLine({ action }: { action: AssistantAction }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800">
      <Badge color="blue">Proposed</Badge>
      <span className="min-w-0 whitespace-pre-wrap break-words">{action.summary}</span>
    </div>
  );
}

export default function AssistantPage() {
  const { member: me } = useAuth();

  const [threads, setThreads] = useState<AssistantThread[] | null>(null);
  const [threadsFailed, setThreadsFailed] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[] | null>(null);
  const [actions, setActions] = useState<AssistantAction[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const sending = useRef(false); // blocks a double send before `busy` re-renders
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => listenThreads(setThreads, () => setThreadsFailed(true)), []);

  useEffect(() => {
    setMessages(null);
    setActions(null);
    setLoadFailed(false);
    if (!activeId) return;
    const fail = () => setLoadFailed(true);
    const stopMessages = listenThreadMessages(activeId, setMessages, fail);
    const stopActions = listenThreadActions(activeId, setActions, fail);
    return () => {
      stopMessages?.();
      stopActions?.();
    };
  }, [activeId]);

  // Ready to paste: focus the box on arrival and again whenever a turn finishes.
  useEffect(() => {
    if (!busy) boxRef.current?.focus();
  }, [busy]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages?.length, actions?.length, pending, busy]);

  const placement = useMemo(() => placeActions(messages ?? [], actions ?? []), [messages, actions]);

  const loading = activeId !== null && !loadFailed && (messages === null || actions === null);
  const showPending = pending !== null && !(messages && messages.length > pending.baseCount);
  const tooLong = draft.length > MAX_MESSAGE_CHARS;

  function openThread(id: string | null) {
    if (busy) return;
    setActiveId(id);
    setPending(null);
    setError('');
  }

  async function send() {
    const text = draft.trim();
    if (!text || tooLong || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    setPending({ text, baseCount: messages?.length ?? 0 });
    setDraft('');
    try {
      const res = await sendAssistantMessage(activeId, text);
      setUsage(res.usage);
      setActiveId(res.threadId); // a first message creates the thread; later ones keep it
    } catch (err) {
      setError(errorText(err));
      setPending(null);
      setDraft((current) => current || text); // never lose a long paste to an error
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  }

  const renderActions = (list: AssistantAction[] | undefined) =>
    list?.map((action) => <ProposalLine key={action.id} action={action} />);

  return (
    <div className="flex flex-col gap-4 md:h-[calc(100vh-6.5rem)] md:flex-row">
      <h1 className="sr-only">AI Assistant</h1>

      <aside className="flex max-h-56 w-full shrink-0 flex-col gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm md:max-h-none md:w-64">
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => openThread(null)}>
          New conversation
        </Button>
        <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto">
          {threadsFailed && (
            <p role="alert" className="px-1 text-xs text-red-600">
              Couldn&apos;t load your conversations. Reload the page to try again.
            </p>
          )}
          {!threadsFailed && threads === null && <p className="px-1 text-xs text-gray-500">Loading…</p>}
          {threads && threads.length === 0 && <p className="px-1 text-xs text-gray-500">No conversations yet.</p>}
          {threads && threads.length > 0 && (
            <ul className="space-y-1">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-current={thread.id === activeId ? 'true' : undefined}
                    onClick={() => openThread(thread.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                      thread.id === activeId ? 'bg-garden-100 text-garden-700' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span className="block truncate text-sm font-medium">{thread.title || 'Untitled conversation'}</span>
                    <span className="block truncate text-xs text-gray-500">{threadSubtitle(thread, me?.id)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      <section className="flex h-[75vh] min-h-[28rem] min-w-0 flex-1 flex-col rounded-2xl border border-gray-100 bg-white shadow-sm md:h-auto">
        <div role="log" aria-label="Conversation" className="flex-1 space-y-3 overflow-y-auto p-4">
          {activeId === null && !showPending && (
            <div className="mx-auto max-w-md space-y-2 py-10 text-center text-sm text-gray-500">
              <p>
                Paste a member&apos;s request, or ask for something in your own words. I&apos;ll draft calendar events,
                emails with RSVP links, announcements and polls for you to review.
              </p>
              <p>Nothing is sent or changed until you approve it.</p>
            </div>
          )}
          {loading && <p className="text-sm text-gray-500">Loading conversation…</p>}
          {loadFailed && (
            <p role="alert" className="text-sm text-red-600">
              Couldn&apos;t load this conversation. Reload the page to try again.
            </p>
          )}
          {messages?.length === 0 && !showPending && <p className="text-sm text-gray-500">No messages yet.</p>}

          {messages?.map((message) => (
            <Fragment key={message.id}>
              <ChatMessage message={message} meUid={me?.id} />
              {renderActions(placement.after.get(message.id))}
            </Fragment>
          ))}
          {messages && renderActions(placement.unplaced)}

          {showPending && pending && (
            <ChatMessage
              meUid={me?.id}
              message={{
                id: 'pending',
                seq: 0,
                role: 'user',
                kind: 'user_text',
                raw: '',
                display: { text: pending.text },
              }}
            />
          )}
          {busy && (
            <p role="status" className="text-sm italic text-gray-500">
              Thinking… this can take a minute.
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="space-y-2 border-t border-gray-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <textarea
            ref={boxRef}
            aria-label="Message"
            rows={4}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Paste a member's request here, or ask me to draft something…"
            className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500 disabled:bg-gray-50"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="flex flex-wrap gap-x-3 text-xs text-gray-500">
              {tooLong ? (
                <span className="text-red-600">
                  {draft.length.toLocaleString('en-US')} / {MAX_MESSAGE_CHARS.toLocaleString('en-US')} characters. Shorten
                  it to send.
                </span>
              ) : (
                <span>Ctrl/⌘ + Enter to send</span>
              )}
              {usage && <span>{turnsLeftText(usage)}</span>}
            </p>
            <Button type="submit" disabled={busy || !draft.trim() || tooLong}>
              {busy ? 'Working…' : 'Send'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
