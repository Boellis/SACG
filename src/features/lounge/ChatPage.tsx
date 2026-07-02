import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { useAuth } from '../../auth/useAuth';
import { listenConversation, listenMessages, sendMessage } from './chatApi';
import type { Conversation, ChatMessage } from '../../lib/types';

export default function ChatPage() {
  const { convId } = useParams<{ convId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [convo, setConvo] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (convId) return listenConversation(convId, setConvo);
  }, [convId]);
  useEffect(() => {
    if (convId) return listenMessages(convId, setMsgs);
  }, [convId]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const myUid = user?.uid;
  const otherUid = convo?.participants.find((p) => p !== myUid);
  const otherName = (otherUid && convo?.participantNames?.[otherUid]) || 'Member';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!convId || !myUid || !text.trim()) return;
    setSending(true);
    const t = text;
    setText('');
    try {
      await sendMessage(convId, myUid, t);
    } catch {
      setText(t);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-2xl">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-200">
        <Button variant="ghost" onClick={() => navigate('/messages')}>
          ←
        </Button>
        <h1 className="text-lg font-semibold text-gray-900">{otherName}</h1>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-2">
        {msgs.length === 0 && <p className="text-sm text-gray-400 text-center">Say hello 👋</p>}
        {msgs.map((m) => {
          const mine = m.senderId === myUid;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                  mine ? 'bg-garden-600 text-white' : 'bg-gray-100 text-gray-800'
                }`}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 pt-3 border-t border-gray-200">
        <input
          className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-garden-500"
          placeholder="Message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={sending || !text.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
