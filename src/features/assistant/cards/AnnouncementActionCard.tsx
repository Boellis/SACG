import { useId, useState } from 'react';
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
import type { AnnouncementAction } from '../types';

/**
 * A notice for the Lounge board. Title, text and "pinned" can be edited; when
 * it expires is shown, and changed by asking the assistant (a date can't be
 * cleared with an override).
 */
export default function AnnouncementActionCard({ threadId, action }: CardProps<AnnouncementAction>) {
  const runner = useActionRunner(threadId, action.id);
  const pinId = useId();
  const { input } = action;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ title: input.title, body: input.body, pinned: input.pinned });
  const isEditing = editing && action.status === 'proposed';

  const edited = { title: values.title.trim(), body: values.body, pinned: values.pinned };
  const overrides = changedFields({ title: input.title, body: input.body, pinned: input.pinned }, edited, [
    'title',
    'body',
    'pinned',
  ]);
  const problem = !edited.title ? 'Give the announcement a title.' : !edited.body.trim() ? 'Write the announcement.' : null;

  return (
    <ActionShell
      label="Announcement"
      action={action}
      runner={runner}
      editing={editing}
      onToggleEdit={() => setEditing((e) => !e)}
      approveLabel="Approve"
      onApprove={() => void runner.execute({ mode: 'run', overrides })}
      invalid={problem !== null}
      done={
        <>
          <p>Posted to the Lounge board.</p>
          <Link to="/lounge" className="text-garden-700 underline">
            View the Lounge
          </Link>
        </>
      }
    >
      <div className="space-y-3">
        {isEditing ? (
          <div className="space-y-3">
            <TextField
              label="Title"
              value={values.title}
              maxLength={120}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            />
            <TextAreaField
              label="Message"
              rows={5}
              value={values.body}
              maxLength={4000}
              onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
            />
            <div className="flex items-center gap-2">
              <input
                id={pinId}
                type="checkbox"
                checked={values.pinned}
                onChange={(e) => setValues((v) => ({ ...v, pinned: e.target.checked }))}
                className="accent-garden-600"
              />
              <label htmlFor={pinId} className="text-sm text-gray-700">
                Pin to the top
              </label>
            </div>
            {problem && <ProblemText>{problem}</ProblemText>}
          </div>
        ) : (
          <Facts
            rows={[
              ['Title', edited.title],
              ['Message', edited.body],
            ]}
          />
        )}
        {((!isEditing && edited.pinned) || input.expiresOn) && (
          <div className="flex flex-wrap gap-2">
            {!isEditing && edited.pinned && <Badge color="amber">Pinned</Badge>}
            {input.expiresOn && <Badge color="gray">{`Expires ${formatGardenLocal(input.expiresOn)}`}</Badge>}
          </div>
        )}
      </div>
    </ActionShell>
  );
}
