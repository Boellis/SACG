import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../components/ui';
import { formatGardenLocal } from '../../../lib/gardenTime';
import {
  ActionShell,
  Facts,
  ProblemText,
  TextAreaField,
  TextField,
  useActionRunner,
  type CardProps,
} from '../ActionShell';
import { changedFields } from '../overrides';
import type { PollAction } from '../types';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;
const MAX_OPTION_CHARS = 120;

/** One option per non-blank line, trimmed. */
const parseOptions = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * A poll for the members. The question and the options (one per line) can be
 * edited; the close date is shown, and changed by asking the assistant.
 */
export default function PollActionCard({ threadId, action }: CardProps<PollAction>) {
  const runner = useActionRunner(threadId, action.id);
  const { input } = action;
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(input.question);
  const [optionsText, setOptionsText] = useState(input.options.join('\n'));
  const isEditing = editing && action.status === 'proposed';

  const options = parseOptions(optionsText);
  const edited = { question: question.trim(), options };
  const overrides = changedFields({ question: input.question, options: input.options }, edited, ['question', 'options']);
  const problem =
    options.length < MIN_OPTIONS || options.length > MAX_OPTIONS
      ? `A poll needs ${MIN_OPTIONS} to ${MAX_OPTIONS} options.`
      : options.some((o) => o.length > MAX_OPTION_CHARS)
        ? `Each option can be at most ${MAX_OPTION_CHARS} characters.`
        : !edited.question
          ? 'Ask a question.'
          : null;

  return (
    <ActionShell
      label="Poll"
      action={action}
      runner={runner}
      editing={editing}
      onToggleEdit={() => setEditing((e) => !e)}
      approveLabel="Approve"
      onApprove={() => void runner.execute({ mode: 'run', overrides })}
      overrides={overrides}
      invalid={problem !== null}
      done={
        <>
          <p>The poll is open for votes.</p>
          <Link to="/polls" className="text-garden-700 underline">
            View polls
          </Link>
        </>
      }
    >
      <div className="space-y-3">
        {isEditing ? (
          <div className="space-y-3">
            <TextField label="Question" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} />
            <TextAreaField
              label="Options (one per line)"
              rows={5}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
            />
            {problem && <ProblemText>{problem}</ProblemText>}
          </div>
        ) : (
          <>
            <Facts rows={[['Question', edited.question]]} />
            <ol className="ml-5 list-decimal space-y-0.5 text-sm text-gray-900">
              {options.map((option, i) => (
                <li key={i} className="whitespace-pre-wrap break-words">
                  {option}
                </li>
              ))}
            </ol>
          </>
        )}
        {input.closesOn && <Badge color="gray">{`Closes ${formatGardenLocal(input.closesOn)}`}</Badge>}
      </div>
    </ActionShell>
  );
}
