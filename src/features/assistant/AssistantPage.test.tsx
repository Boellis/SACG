import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Timestamp } from 'firebase/firestore';

vi.mock('./assistantApi', () => ({
  sendAssistantMessage: vi.fn(),
  executeAssistantAction: vi.fn(),
  rejectAssistantAction: vi.fn(),
  listenThreads: vi.fn(),
  listenThreadMessages: vi.fn(),
  listenThreadActions: vi.fn(),
}));
vi.mock('../members/membersApi', () => ({ listenMembers: vi.fn() }));
vi.mock('../email/emailJobsApi', () => ({ listenEmailJob: vi.fn(() => vi.fn()) }));
vi.mock('../calendar/eventsApi', () => ({ listenRsvps: vi.fn(), listenEvents: vi.fn() }));
vi.mock('../../auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/firebase', () => ({ auth: {}, db: {}, app: {}, functions: {} }));

import * as apiMod from './assistantApi';
import * as emailJobsApiMod from '../email/emailJobsApi';
import * as membersApiMod from '../members/membersApi';
import * as useAuthMod from '../../auth/useAuth';
import AssistantPage from './AssistantPage';
import type {
  AssistantAction,
  AssistantMessage,
  AssistantThread,
  ChatResult,
  ChatUsage,
  ExecuteActionResult,
  MessageKind,
} from './types';
import type { Member } from '../../lib/types';

const mockedSend = vi.mocked(apiMod.sendAssistantMessage);
const mockedExecute = vi.mocked(apiMod.executeAssistantAction);
const mockedReject = vi.mocked(apiMod.rejectAssistantAction);
const mockedListenJob = vi.mocked(emailJobsApiMod.listenEmailJob);
const mockedListenThreads = vi.mocked(apiMod.listenThreads);
const mockedListenMessages = vi.mocked(apiMod.listenThreadMessages);
const mockedListenActions = vi.mocked(apiMod.listenThreadActions);
const mockedListenMembers = vi.mocked(membersApiMod.listenMembers);
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

const members = [
  me,
  { ...me, id: 'm-alice', uid: 'm-alice', email: 'alice@example.com', displayName: 'Alice Example', role: 'member' },
  { ...me, id: 'm-bob', uid: 'm-bob', email: 'bob@example.com', displayName: 'Bob Example', role: 'member' },
] as Member[];

const eventAction = (over: Record<string, unknown> = {}) =>
  ({
    id: 'a-event',
    type: 'create_event',
    summary: 'Create the Nov 7 meeting',
    status: 'proposed',
    toolUseId: 'toolu_1',
    input: { title: 'Meeting', type: 'meeting', start: '2026-11-07T09:00', end: '2026-11-07T10:00', allDay: false },
    ...over,
  }) as AssistantAction;

const emailAction = (over: Record<string, unknown> = {}) =>
  ({
    id: 'a-email',
    type: 'send_email',
    summary: 'Email everyone the RSVP link',
    status: 'proposed',
    toolUseId: 'toolu_1',
    dependsOn: 'a-event',
    input: {
      audience: { kind: 'all_active' },
      subject: 'RSVP: Nov 7 meeting',
      body: 'Hi {firstName}, {rsvpLink}',
      rsvp: { eventActionId: 'a-event' },
    },
    ...over,
  }) as AssistantAction;

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
    mockedListenMembers.mockImplementation((cb) => {
      cb(members);
      return vi.fn();
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

  it("shows the assistant's pause and cut-off notes from the stored conversation, right after the turn and after a reload", async () => {
    // The server stores these notes (functions/src/assistant/loop.ts); the page only shows stored messages.
    const paused = '(I paused here to stay within my limits for one message. Say "continue" and I\'ll pick up where I left off.)';
    const cut = '(My reply got cut off because it ran too long. Ask me to continue, or to keep it shorter.)';
    const stored = [
      msg(1, 'user_text', 'Set up the Nov 7 RSVP'),
      msg(2, 'assistant', 'Checking the calendar.', {
        display: { text: 'Checking the calendar.', tools: [{ name: 'list_events', label: 'Checked the calendar' }] },
      }),
      msg(3, 'tool_results', '1 tool result'),
      msg(4, 'assistant', paused), // a turn that hit its limits: the note is a message of its own
      msg(5, 'user_text', 'continue'),
      msg(6, 'assistant', `Here is the long draft\n\n${cut}`), // a text-only reply that was cut off: the note is in its text
    ];
    mockedSend.mockResolvedValueOnce(reply('t1', `Checking the calendar.\n\n${paused}`));
    const { unmount } = renderPage();

    typeMessage('Set up the Nov 7 RSVP');
    fireEvent.click(sendButton());
    await turnFinished();
    act(() => emit.messages(stored.slice(0, 4)));
    expect(within(screen.getByRole('log')).getByText(paused)).toBeInTheDocument();

    unmount();
    renderPage();
    openThread('t1', stored);
    const log = within(screen.getByRole('log'));
    expect(log.getByText(paused)).toBeInTheDocument();
    expect(log.getByText(/^Here is the long draft\s+\(My reply got cut off/)).toHaveTextContent(cut);
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
  // Action cards in the chat
  // -------------------------------------------------------------------------

  /** True when `a` comes before `b` in the page. */
  const before = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  /** The start of a turn: the admin's request, then the assistant message that proposes `toolUseIds`. */
  const proposingTurn = (...toolUseIds: string[]): AssistantMessage[] => [
    msg(1, 'user_text', 'Please set up an RSVP'),
    msg(2, 'assistant', 'Drafting that now', {}, [{ type: 'text', text: 'Drafting that now' }, ...toolUseIds.map(toolUse)]),
  ];

  it('places a proposal right after the assistant message that made it, before the rest of the turn', () => {
    renderPage();
    openThread(
      't1',
      [
        ...proposingTurn('toolu_1'),
        msg(3, 'tool_results', 'hidden'),
        msg(4, 'assistant', "Here's the plan"),
        msg(5, 'user_text', 'Thanks!'),
      ],
      [eventAction()],
    );

    const drafting = screen.getByText('Drafting that now');
    const proposal = screen.getByText('Create the Nov 7 meeting');
    const plan = screen.getByText("Here's the plan");
    const thanks = screen.getByText('Thanks!');
    expect(before(drafting, proposal)).toBe(true);
    expect(before(proposal, plan)).toBe(true);
    expect(before(plan, thanks)).toBe(true);
  });

  it('keeps a proposal where its own message put it as the turn goes on and later turns follow', () => {
    renderPage();
    const turn = proposingTurn('toolu_1');
    openThread('t1', turn, [eventAction()]);
    const card = screen.getByText('Create the Nov 7 meeting'); // a node of the card: if it is rebuilt this is a new element
    const stays = () => {
      expect(screen.getByText('Create the Nov 7 meeting')).toBe(card);
      expect(before(screen.getByText('Drafting that now'), card)).toBe(true);
    };
    stays();

    act(() => emit.messages([...turn, msg(3, 'tool_results', 'hidden'), msg(4, 'assistant', "Here's the plan")]));
    stays();
    expect(before(card, screen.getByText("Here's the plan"))).toBe(true);

    act(() =>
      emit.messages([
        ...turn,
        msg(3, 'tool_results', 'hidden'),
        msg(4, 'assistant', "Here's the plan"),
        msg(5, 'user_text', 'Thanks!'),
        msg(6, 'assistant', "You're welcome"),
      ]),
    );
    stays();
    expect(before(card, screen.getByText("Here's the plan"))).toBe(true);
    expect(before(screen.getByText("Here's the plan"), screen.getByText("You're welcome"))).toBe(true);
  });

  it('updates a card in place, never rebuilding it, as the member list and its own status change', () => {
    let deliverMembers: (m: Member[]) => void = () => {};
    mockedListenMembers.mockImplementation((cb) => {
      deliverMembers = cb;
      cb(members);
      return vi.fn();
    });
    renderPage();
    openThread('t1', proposingTurn('toolu_1'), [eventAction()]);
    const card = screen.getByText('Create the Nov 7 meeting');

    act(() => deliverMembers([...members, { ...members[1], id: 'm-new', displayName: 'New Member' } as Member]));
    expect(screen.getByText('Create the Nov 7 meeting')).toBe(card);

    act(() => emit.actions([eventAction({ status: 'executing' })]));
    expect(screen.getByText('Create the Nov 7 meeting')).toBe(card);
    expect(screen.getByText('Sending…')).toBeInTheDocument();

    act(() => emit.actions([eventAction({ status: 'executed', result: { eventId: 'ev1' } })]));
    expect(screen.getByText('Create the Nov 7 meeting')).toBe(card);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('keeps a card mounted while the assistant keeps talking: its edit and its running call survive', async () => {
    const call = deferred<ExecuteActionResult>();
    mockedExecute.mockReturnValueOnce(call.promise);
    renderPage();
    const turn = proposingTurn('toolu_1');
    openThread('t1', turn, [eventAction()]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockedExecute).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();

    // The turn carries on while that call is still running: more messages arrive.
    act(() => emit.messages([...turn, msg(3, 'tool_results', 'hidden'), msg(4, 'assistant', "Here's the plan")]));

    expect(screen.getByLabelText('Title')).toHaveValue('X'); // the edit survived
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled(); // still in flight
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Done editing' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockedExecute).toHaveBeenCalledTimes(1);

    await act(async () => call.resolve({ status: 'executed', result: {} }));

    expect(mockedExecute.mock.calls[0][0]).toEqual({
      threadId: 't1',
      actionId: 'a-event',
      mode: 'run',
      overrides: { title: 'X' },
    });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled(); // sent: waits for its live status
  });

  it("keeps an email's test send guarded while the assistant keeps talking, so a test goes out once", async () => {
    mockedListenJob.mockImplementation(() => vi.fn());
    const call = deferred<ExecuteActionResult>();
    mockedExecute.mockReturnValueOnce(call.promise);
    renderPage();
    const turn = proposingTurn('toolu_1', 'toolu_2');
    const event = eventAction({ status: 'executed', result: { eventId: 'ev1', title: 'Meeting' } });
    const email = emailAction({ toolUseId: 'toolu_2' });
    openThread('t1', turn, [event, email]);

    fireEvent.click(screen.getByRole('button', { name: 'Send test' }));
    expect(mockedExecute).toHaveBeenCalledTimes(1);

    act(() => emit.messages([...turn, msg(3, 'tool_results', 'hidden'), msg(4, 'assistant', "Here's the plan")]));

    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve & send to everyone' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Send test' }));
    expect(mockedExecute).toHaveBeenCalledTimes(1);

    await act(async () => call.resolve({ status: 'proposed', result: { jobId: 'job-test-1' } }));

    expect(mockedListenJob).toHaveBeenCalledWith('job-test-1', expect.any(Function));
    expect(screen.getByRole('button', { name: 'Send test' })).toBeEnabled(); // a test send doesn't lock the card
    expect(screen.getByRole('button', { name: 'Approve & send to everyone' })).toBeEnabled();
  });

  it('keeps a card, and what was typed into it, when the message that made it arrives after it', () => {
    renderPage();
    const turn = proposingTurn('toolu_1');
    // The proposal is delivered before the assistant message that made it: the two listeners aren't ordered.
    openThread('t1', [turn[0]], [eventAction()]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } });

    const card = screen.getByText('Create the Nov 7 meeting');
    expect(before(card, screen.getByLabelText('Title'))).toBe(true);

    act(() => emit.messages(turn));

    expect(screen.getByText('Create the Nov 7 meeting')).toBe(card); // moved into place, not rebuilt
    expect(screen.getByLabelText('Title')).toHaveValue('X');
    expect(before(screen.getByText('Drafting that now'), card)).toBe(true); // and now sits right after its message
  });

  it.each([
    ['Approve', () => mockedExecute],
    ['Reject', () => mockedReject],
  ])("doesn't let the admin leave the conversation while a card's %s is running", async (buttonName, api) => {
    const call = deferred<ExecuteActionResult | undefined>();
    api().mockReturnValueOnce(call.promise as never);
    renderPage();
    act(() => emit.threads([thread('t1', 'Meeting thread'), thread('t2', 'Other thread')]));
    fireEvent.click(screen.getByRole('button', { name: /Meeting thread/ }));
    act(() => {
      emit.messages(proposingTurn('toolu_1'));
      emit.actions([eventAction()]);
    });
    fireEvent.click(screen.getByRole('button', { name: buttonName }));
    expect(api()).toHaveBeenCalledTimes(1);

    // Leaving would unmount the card and forget the call: coming back, its buttons would work again.
    const other = screen.getByRole('button', { name: /Other thread/ });
    expect(other).toBeDisabled();
    expect(screen.getByRole('button', { name: /new conversation/i })).toBeDisabled();
    fireEvent.click(other);
    expect(mockedListenMessages).not.toHaveBeenCalledWith('t2', expect.any(Function), expect.any(Function));
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();

    await act(async () => call.resolve(undefined));

    expect(screen.getByRole('button', { name: /Other thread/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /new conversation/i })).toBeEnabled();
  });

  it('lets the admin move on again when a card call fails', async () => {
    mockedExecute.mockRejectedValueOnce(Object.assign(new Error('Approve the event first'), { code: 'functions/failed-precondition' }));
    renderPage();
    act(() => emit.threads([thread('t1', 'Meeting thread'), thread('t2', 'Other thread')]));
    fireEvent.click(screen.getByRole('button', { name: /Meeting thread/ }));
    act(() => {
      emit.messages(proposingTurn('toolu_1'));
      emit.actions([eventAction()]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Approve the event first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Other thread/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('still shows a proposal it cannot match to a message, at the end', () => {
    renderPage();
    openThread(
      't1',
      [msg(1, 'user_text', 'Hello'), msg(2, 'assistant', 'Reply')],
      [eventAction({ toolUseId: 'toolu_missing' })],
    );

    const reply = screen.getByText('Reply');
    const proposal = screen.getByText('Create the Nov 7 meeting');
    expect(reply.compareDocumentPosition(proposal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows each proposal as a card with Approve and Reject', () => {
    renderPage();
    openThread('t1', [msg(1, 'user_text', 'Hi'), msg(2, 'assistant', 'Done', {}, [toolUse('toolu_1')])], [eventAction()]);

    expect(screen.getByText('Proposed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('approves in the conversation that is open', async () => {
    mockedExecute.mockResolvedValue({ status: 'executed', result: {} });
    renderPage();
    openThread('t7', [msg(1, 'user_text', 'Hi'), msg(2, 'assistant', 'Done', {}, [toolUse('toolu_1')])], [eventAction()]);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(mockedExecute).toHaveBeenCalledWith({ threadId: 't7', actionId: 'a-event', mode: 'run' }),
    );
  });

  it('keeps an email waiting for its event, and frees it the moment the event is approved', () => {
    renderPage();
    openThread(
      't1',
      [msg(1, 'user_text', 'Hi'), msg(2, 'assistant', 'Plan', {}, [toolUse('toolu_1')])],
      [eventAction(), emailAction()],
    );

    expect(screen.getByRole('button', { name: 'Approve & send to everyone' })).toBeDisabled();
    expect(screen.getByText('Approve the event first')).toBeInTheDocument();

    act(() => emit.actions([eventAction({ status: 'executed', result: { eventId: 'ev1', title: 'Meeting' } }), emailAction()]));

    expect(screen.getByRole('button', { name: 'Approve & send to everyone' })).toBeEnabled();
    expect(screen.queryByText('Approve the event first')).not.toBeInTheDocument();
  });

  it('holds the cards back until the member list is there (their counts and pickers need it)', () => {
    let deliverMembers: (m: Member[]) => void = () => {};
    mockedListenMembers.mockImplementation((cb) => {
      deliverMembers = cb;
      return vi.fn();
    });
    renderPage();
    openThread('t1', [msg(1, 'user_text', 'Hi'), msg(2, 'assistant', 'Plan', {}, [toolUse('toolu_1')])], [eventAction()]);

    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();

    act(() => deliverMembers(members));

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
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
