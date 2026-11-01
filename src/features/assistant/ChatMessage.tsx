import type { AssistantMessage } from './types';

interface ChatMessageProps {
  message: AssistantMessage;
  /** The signed-in admin's uid: other admins' messages are labelled with their name. */
  meUid?: string;
}

// Everything below is shown as React text nodes with `whitespace-pre-wrap`. The
// text comes from pasted member messages and from the model, so it is never
// parsed as HTML or markdown.

/** One row of the conversation. Tool results are plumbing and render nothing. */
export default function ChatMessage({ message, meUid }: ChatMessageProps) {
  const text = message.display?.text ?? '';

  switch (message.kind) {
    case 'tool_results':
      return null;

    case 'app_note':
      // The server writes these as "[App update] Brandon approved…" for the model.
      return (
        <p role="note" className="mx-auto max-w-[90%] text-center text-xs italic text-gray-500 whitespace-pre-wrap break-words">
          {text.replace(/^\[App update\]\s*/, '')}
        </p>
      );

    case 'user_text': {
      const other = message.authorName && message.authorUid && message.authorUid !== meUid;
      return (
        <div className="flex flex-col items-end gap-0.5">
          {other && <span className="text-xs text-gray-500">{message.authorName}</span>}
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-garden-600 px-4 py-2 text-sm text-white whitespace-pre-wrap break-words">
            {text}
          </div>
        </div>
      );
    }

    case 'assistant': {
      const tools = message.display?.tools ?? [];
      if (!text && tools.length === 0) return null;
      return (
        <div className="flex flex-col items-start gap-1.5">
          {tools.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="What the assistant looked at">
              {tools.map((tool, i) => (
                <li key={`${tool.name}-${i}`} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                  {tool.label}
                </li>
              ))}
            </ul>
          )}
          {text && (
            <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-gray-200 bg-white px-4 py-2 text-sm text-gray-800 whitespace-pre-wrap break-words">
              {text}
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}
