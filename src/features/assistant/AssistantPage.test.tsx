import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Timestamp } from 'firebase/firestore';

vi.mock('./assistantApi', () => ({
  sendAssistantMessage: vi.fn(),
  listenThreads: vi.fn(),
  listenThreadMessages: vi.fn(),
  listenThreadActions: vi.fn(),
}));
vi.mock('../../auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/firebase', () => ({ auth: {}, db: {}, app: {}, functions: {} }));

import * as apiMod from './assistantApi';
import * as useAuthMod from '../../auth/useAuth';
import AssistantPage from './AssistantPage';
import type {
  AssistantAction,
  AssistantMessage,
  AssistantThread,
  ChatResult,
  ChatUsage,
  MessageKind,
} from './types';
import type { Member } from '../../lib/types';

const mockedSend = vi.mocked(apiMod.sendAssistantMessage);
const mockedListenThreads = vi.mocked(apiMod.listenThreads);
const mockedListenMessages = vi.mocked(apiMod.listenThreadMessages);
const mockedListenActions = vi.mocked(apiMod.listenThreadActions);
const mockedUseAuth = vi.mocked(useAuthMod.useAuth);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ts = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) }) as unknown as Timestamp;

const me = {
  id: 'admin-uid',
  uid: 'admin-uid',
  email: 'brandon@example.com',
  displayName: 'Brandon Ellis',
  role: 'admin',
  status: 'active',
  currentYearHours: 0,
} as unknown as Member;

const thread = (id: string, title: string, over: Partial<AssistantThread> = {}): AssistantThread => ({
  id,
  title,
  createdBy: me.id,
  createdByName: 'Brandon Ellis',
  createdAt: ts('2026-11-01T15:00:00Z'),
  updatedAt: ts('2026-11-01T15:00:00Z'),
  ...over,
});

const toolUse = (id: string) => ({ type: 'tool_use', id, name: 'propose_calendar_event', input: {} });

function msg(
  seq: number,
  kind: MessageKind,
  text: string,
  over: Partial<AssistantMessage> = {},
  raw: unknown = [{ type: 'text', text }],
): AssistantMessage {
  return {
    id: String(seq).padStart(6, '0'),
    seq,
    role: kind === 'assistant' ? 'assistant' : 'user',
    kind,
    raw: JSON.stringify(raw),
    display: { text },
    createdAt: ts('2026-11-01T15:00:00Z'),
    ...over,
  };
}

const usage = (turnsToday = 1): ChatUsage => ({ turnsToday, limit: 60 });
const reply = (threadId: string, text: string, u = usage()): ChatResult => ({
  threadId,
  reply: text,
  actionIds: [],
  usage: u,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// The page's three Firestore listeners; tests push snapshots through these.
const emit = {
  threads: (_t: AssistantThread[]) => {},
  messages: (_m: AssistantMessage[]) => {},
  actions: (_a: AssistantAction[]) => {},
};
const unsubscribe = { threads: vi.fn(), messages: vi.fn(), actions: vi.fn() };

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AssistantPage />
    </MemoryRouter>,
  );
}

const messageBox = () => screen.getByRole('textbox', { name: 'Message' });
const sendButton = () => screen.getByRole('button', { name: 'Send' });
const typeMessage = (value: string) => fireEvent.change(messageBox(), { target: { value } });
/** Resolves once a turn has finished and the composer is idle again. */
const turnFinished = () => screen.findByRole('button', { name: 'Send' });

/** Show the conversation list, open one thread and deliver its messages/actions. */
function openThread(id: string, messages: AssistantMessage[] = [], actions: AssistantAction[] = []) {
  act(() => emit.threads([thread(id, `Thread ${id}`)]));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`Thread ${id}`) }));
  act(() => {
    emit.messages(messages);
    emit.actions(actions);
  });
}

describe('AssistantPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({ user: { uid: me.id } as never, member: me, role: 'admin', status: 'active', loading: false });
    mockedListenThreads.mockImplementation((cb) => {
      emit.threads = cb;
      return unsubscribe.threads;
    });
    mockedListenMessages.mockImplementation((_id, cb) => {
      emit.messages = cb;
      return unsubscribe.messages;
    });
    mockedListenActions.mockImplementation((_id, cb) => {
      emit.actions = cb;
      return unsubscribe.actions;
    });
  });

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  it('starts a conversation without a thread id, then keeps sending into the thread it created', async () => {
    mockedSend.mockResolvedValueOnce(reply('t1', 'Hello!')).mockResolvedValueOnce(reply('t1', 'Done.'));
    renderPage();

    typeMessage('Hi');
    fireEvent.click(sendButton());
    await waitFor(() => expect(mockedSend).toHaveBeenCalledWith(null, 'Hi'));
    await waitFor(() =>
      expect(mockedListenMessages).toHaveBeenCalledWith('t1', expect.any(Function), expect.any(Function)),
    );
    await turnFinished();

    typeMessage('Draft the email');
    fireEvent.click(sendButton());
    await waitFor(() => expect(mockedSend).toHaveBeenLastCalledWith('t1', 'Draft the email'));
    await turnFinished();
    expect(mockedSend).toHaveBeenCalledTimes(2);
  });

  it('trims the message and clears the composer once it is sent', async () => {
    mockedSend.mockResolvedValueOnce(reply('t1', 'ok'));
    renderPage();

    typeMessage('  Forwarded from Denny:\n\nCan we RSVP the meeting?\n\n');
    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mockedSend).toHaveBeenCalledWith(null, 'Forwarded from Denny:\n\nCan we RSVP the meeting?'),
    );
    expect(messageBox()).toHaveValue('');
    await turnFinished();
  });

  it('does not send an empty message', () => {
    renderPage();
    expect(sendButton()).toBeDisabled();
    typeMessage('   \n ');
    expect(sendButton()).toBeDisabled();
    fireEvent.keyDown(messageBox(), { key: 'Enter', ctrlKey: true });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it.each([
    ['Ctrl+Enter', { ctrlKey: true }],
    ['⌘+Enter', { metaKey: true }],
  ])('sends with %s', async (_label, modifier) => {
    mockedSend.mockResolvedValueOnce(reply('t1', 'ok'));
    renderPage();

    typeMessage('Hi');
    fireEvent.keyDown(messageBox(), { key: 'Enter', ...modifier });

    await waitFor(() => expect(mockedSend).toHaveBeenCalledWith(null, 'Hi'));
    await turnFinished();
  });

  it('does not send on a plain Enter (that is a new line)', () => {
    renderPage();
    typeMessage('Hi');
    fireEvent.keyDown(messageBox(), { key: 'Enter' });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('shows Working… while the assistant answers, and blocks a second send and thread switching', async () => {
    const turn = deferred<ChatResult>();
    mockedSend.mockReturnValueOnce(turn.promise);
    renderPage();
    act(() => emit.threads([thread('t9', 'Older thread')]));

    typeMessage('Hi');
    fireEvent.click(sendButton());

    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(messageBox()).toBeDisabled();
    expect(screen.getByRole('button', { name: /older thread/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /new conversation/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/thinking/i);
    fireEvent.keyDown(messageBox(), { key: 'Enter', ctrlKey: true });
    expect(mockedSend).toHaveBeenCalledTimes(1);

    await act(async () => turn.resolve(reply('t1', 'Hello')));
    await turnFinished();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /older thread/i })).toBeEnabled();
  });

  it('echoes the sent message right away, before the server has stored it', async () => {
    const turn = deferred<ChatResult>();
    mockedSend.mockReturnValueOnce(turn.promise);
    renderPage();

    typeMessage('Hi from Denny');
    fireEvent.click(sendButton());

    expect(within(screen.getByRole('log')).getByText('Hi from Denny')).toBeInTheDocument();

    await act(async () => turn.resolve(reply('t1', 'Hello')));
    await turnFinished();
  });

  it('swaps the echo for the stored message once it arrives (no duplicate)', async () => {
    mockedSend.mockResolvedValueOnce(reply('t1', 'Hello'));
    renderPage();

    typeMessage('Hi from Denny');
    fireEvent.click(sendButton());
    await turnFinished();
    act(() => emit.messages([msg(1, 'user_text', 'Hi from Denny'), msg(2, 'assistant', 'Hello')]));

    expect(within(screen.getByRole('log')).getAllByText('Hi from Denny')).toHaveLength(1);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it("shows the server's error text and gives the message back to the composer", async () => {
    const text =
      "AI assistant isn't set up yet. Brandon needs to add the Anthropic API key in Google Cloud Secret Manager (ANTHROPIC_API_KEY).";
    mockedSend.mockRejectedValueOnce(Object.assign(new Error(text), { code: 'functions/failed-precondition' }));
    renderPage();

    typeMessage('Set up the RSVP');
    fireEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(messageBox()).toHaveValue('Set up the RSVP');
    expect(screen.getByRole('log')).not.toHaveTextContent('Set up the RSVP');
    expect(sendButton()).toBeEnabled();
  });

  it('shows the daily-limit message verbatim', async () => {
    const text = 'Daily assistant limit reached (60). It resets at midnight.';
    mockedSend.mockRejectedValueOnce(Object.assign(new Error(text), { code: 'functions/resource-exhausted' }));
    renderPage();

    typeMessage('One more');
    fireEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('turns the SDK\'s bare "internal" error into something readable', async () => {
    mockedSend.mockRejectedValueOnce(Object.assign(new Error('internal'), { code: 'functions/internal' }));
    renderPage();

    typeMessage('Hi');
    fireEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
  });

  it('clears an old error when the next send starts', async () => {
    mockedSend
      .mockRejectedValueOnce(Object.assign(new Error('Try later'), { code: 'functions/unavailable' }))
      .mockResolvedValueOnce(reply('t1', 'ok'));
    renderPage();

    typeMessage('Hi');
    fireEvent.click(sendButton());
    await screen.findByRole('alert');

    fireEvent.click(sendButton());
    await turnFinished();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows how many turns are left today after a reply', async () => {
    mockedSend.mockResolvedValueOnce(reply('t1', 'ok', usage(7)));
    renderPage();
    expect(screen.queryByText(/turns? left today/i)).not.toBeInTheDocument();

    typeMessage('Hi');
    fireEvent.click(sendButton());

    expect(await screen.findByText('53 turns left today')).toBeInTheDocument();
  });

  it.each([
    [59, '1 turn left today'],
    [60, 'No turns left today'],
  ])('words the hint for the last turns (%i used)', async (used, hint) => {
    mockedSend.mockResolvedValueOnce(reply('t1', 'ok', usage(used)));
    renderPage();

    typeMessage('Hi');
    fireEvent.click(sendButton());

    expect(await screen.findByText(hint)).toBeInTheDocument();
  });

  it('blocks a message over the 20,000-character limit instead of silently cutting it', () => {
    renderPage();
    typeMessage('x'.repeat(20_001));

    expect(sendButton()).toBeDisabled();
    expect(screen.getByText(/20,001 \/ 20,000/)).toBeInTheDocument();

    typeMessage('x'.repeat(20_000));
    expect(sendButton()).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Threads
  // -------------------------------------------------------------------------

  it('lists the conversations and opens one, subscribing to its messages and actions', () => {
    renderPage();
    act(() => emit.threads([thread('t2', 'Nov 7 meeting RSVP'), thread('t1', 'Garden hours question')]));

    const titles = within(screen.getByRole('navigation', { name: 'Conversations' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(titles[0]).toMatch(/Nov 7 meeting RSVP/);
    expect(titles[1]).toMatch(/Garden hours question/);

    fireEvent.click(screen.getByRole('button', { name: /Nov 7 meeting RSVP/ }));

    expect(mockedListenMessages).toHaveBeenCalledWith('t2', expect.any(Function), expect.any(Function));
    expect(mockedListenActions).toHaveBeenCalledWith('t2', expect.any(Function), expect.any(Function));
    expect(screen.getByRole('button', { name: /Nov 7 meeting RSVP/ })).toHaveAttribute('aria-current', 'true');
  });

  it('shows the opened conversation, then "New conversation" returns to a blank one and stops listening', () => {
    renderPage();
    openThread('t1', [msg(1, 'user_text', 'Denny asked about Nov 7'), msg(2, 'assistant', 'I can set that up.')]);

    expect(screen.getByText('Denny asked about Nov 7')).toBeInTheDocument();
    expect(screen.getByText('I can set that up.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }));

    expect(unsubscribe.messages).toHaveBeenCalled();
    expect(unsubscribe.actions).toHaveBeenCalled();
    expect(screen.queryByText('Denny asked about Nov 7')).not.toBeInTheDocument();
    expect(screen.getByText(/nothing is sent or changed until you approve/i)).toBeInTheDocument();
  });

  it('does not show a previous conversation\'s messages while the next one loads', () => {
    renderPage();
    act(() => emit.threads([thread('t1', 'First'), thread('t2', 'Second')]));
    fireEvent.click(screen.getByRole('button', { name: /First/ }));
    act(() => {
      emit.messages([msg(1, 'user_text', 'Only in the first thread')]);
      emit.actions([]);
    });

    fireEvent.click(screen.getByRole('button', { name: /Second/ }));

    expect(screen.queryByText('Only in the first thread')).not.toBeInTheDocument();
    expect(screen.getByText(/loading conversation/i)).toBeInTheDocument();
  });

  it("labels other admins' conversations with who started them", () => {
    renderPage();
    act(() =>
      emit.threads([
        thread('t1', 'Mine'),
        thread('t2', 'Theirs', { createdBy: 'denny-uid', createdByName: 'Denny Smith' }),
      ]),
    );

    expect(screen.getByRole('button', { name: /Theirs/ })).toHaveTextContent('Denny Smith');
    expect(screen.getByRole('button', { name: /Mine/ })).not.toHaveTextContent('Brandon Ellis');
  });

  it("says so when the conversation list can't be loaded", () => {
    mockedListenThreads.mockImplementation((_cb, onError) => {
      onError?.(new Error('permission-denied'));
      return unsubscribe.threads;
    });
    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load your conversations/i);
  });

  it('stops listening when the page closes', () => {
    const { unmount } = renderPage();
    openThread('t1');

    unmount();

    expect(unsubscribe.threads).toHaveBeenCalled();
    expect(unsubscribe.messages).toHaveBeenCalled();
    expect(unsubscribe.actions).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  it('renders user and assistant text as plain text: markup is shown literally, never interpreted', () => {
    renderPage();
    const assistantText = 'Use <b>x</b> and <img src=x onerror="alert(1)">\nSecond line';
    openThread('t1', [
      msg(1, 'user_text', 'Add <i>this</i> please'),
      msg(2, 'assistant', assistantText),
      msg(3, 'app_note', '[App update] <script>alert(2)</script> approved'),
    ]);

    const log = screen.getByRole('log');
    expect(log.querySelector('b, i, img, script')).toBeNull();
    expect(screen.getByText('Add <i>this</i> please')).toBeInTheDocument();
    const bubble = screen.getByText(/Use <b>x<\/b>/);
    expect(bubble.textContent).toBe(assistantText); // the line break is kept in the text...
    expect(bubble).toHaveClass('whitespace-pre-wrap'); // ...and shown as one
    expect(screen.getByText(/<script>alert\(2\)<\/script> approved/)).toBeInTheDocument();
  });

  it('does not render tool_results messages', () => {
    renderPage();
    openThread('t1', [
      msg(1, 'user_text', 'Hi'),
      msg(2, 'assistant', 'Looking…'),
      msg(3, 'tool_results', 'RAW-TOOL-OUTPUT-SHOULD-STAY-HIDDEN'),
      msg(4, 'assistant', 'All set.'),
    ]);

    expect(screen.getByText('Looking…')).toBeInTheDocument();
    expect(screen.getByText('All set.')).toBeInTheDocument();
    expect(screen.queryByText(/RAW-TOOL-OUTPUT/)).not.toBeInTheDocument();
  });

  it('shows what the assistant looked at as chips, and skips a bubble that has no text', () => {
    renderPage();
    openThread('t1', [
      msg(1, 'user_text', 'What is on the calendar?'),
      msg(2, 'assistant', '', {
        display: { text: '', tools: [{ name: 'list_events', label: 'Checked the calendar' }] },
      }),
    ]);

    const chip = screen.getByText('Checked the calendar');
    expect(chip).toBeInTheDocument();
    expect(chip.parentElement?.parentElement?.querySelectorAll('div.whitespace-pre-wrap')).toHaveLength(0);
  });

  it('shows app_note rows as system notes, without the [App update] prefix', () => {
    renderPage();
    openThread('t1', [msg(1, 'app_note', '[App update] Brandon Ellis approved action a1 (create_event): Created the Nov 7 meeting')]);

    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Brandon Ellis approved action a1 (create_event): Created the Nov 7 meeting');
    expect(note).not.toHaveTextContent('[App update]');
  });

  it("labels other admins' messages with their name, not mine", () => {
    renderPage();
    openThread('t1', [
      msg(1, 'user_text', 'From me', { authorUid: me.id, authorName: 'Brandon Ellis' }),
      msg(2, 'user_text', 'From Denny', { authorUid: 'denny-uid', authorName: 'Denny Smith' }),
    ]);

    const log = screen.getByRole('log');
    expect(log).toHaveTextContent('Denny Smith');
    expect(log).not.toHaveTextContent('Brandon Ellis');
  });

  // -------------------------------------------------------------------------
  // Proposals (placeholder lines until the action cards)
  // -------------------------------------------------------------------------

  it('places a proposal after the assistant message that closes the turn which made it', () => {
    renderPage();
    openThread(
      't1',
      [
        msg(1, 'user_text', 'Please set up an RSVP'),
        msg(2, 'assistant', '', { display: { text: '' } }, [toolUse('toolu_1')]),
        msg(3, 'tool_results', 'hidden'),
        msg(4, 'assistant', "Here's the plan", {}, [{ type: 'text', text: "Here's the plan" }]),
        msg(5, 'user_text', 'Thanks!'),
      ],
      [
        {
          id: 'a1',
          type: 'create_event',
          summary: 'Create the Nov 7 meeting',
          status: 'proposed',
          toolUseId: 'toolu_1',
          input: { title: 'Meeting', type: 'meeting', start: '2026-11-07T09:00', end: '2026-11-07T10:00', allDay: false },
        },
      ],
    );

    const plan = screen.getByText("Here's the plan");
    const proposal = screen.getByText('Create the Nov 7 meeting');
    const thanks = screen.getByText('Thanks!');
    expect(plan.compareDocumentPosition(proposal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(proposal.compareDocumentPosition(thanks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still shows a proposal it cannot match to a message, at the end', () => {
    renderPage();
    openThread(
      't1',
      [msg(1, 'user_text', 'Hello'), msg(2, 'assistant', 'Reply')],
      [
        {
          id: 'a1',
          type: 'post_announcement',
          summary: 'Post the pavilion notice',
          status: 'proposed',
          toolUseId: 'toolu_missing',
          input: { title: 'Pavilion', body: 'Closed Saturday', pinned: false },
        },
      ],
    );

    const reply = screen.getByText('Reply');
    const proposal = screen.getByText('Post the pavilion notice');
    expect(reply.compareDocumentPosition(proposal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says so when the opened conversation can't be loaded", () => {
    mockedListenMessages.mockImplementation((_id, _cb, onError) => {
      onError?.(new Error('permission-denied'));
      return unsubscribe.messages;
    });
    renderPage();
    act(() => emit.threads([thread('t1', 'Broken')]));
    fireEvent.click(screen.getByRole('button', { name: /Broken/ }));

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load this conversation/i);
  });
});
