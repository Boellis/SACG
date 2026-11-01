import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatGardenLocal, formatGardenLocalWhen, formatGardenWhen } from '../../../lib/gardenTime';
import { listenEvents } from '../../calendar/eventsApi';
import { typeLabel } from '../../calendar/eventText';
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
import type { CreateEventAction, CreateEventInput, UpdateEventAction } from '../types';
import type { EventType, GardenEvent } from '../../../lib/types';

const FIELDS = ['title', 'type', 'start', 'end', 'location', 'description'] as const;
type Field = (typeof FIELDS)[number];

interface EventValues {
  title: string;
  type: EventType;
  start: string; // garden-local `YYYY-MM-DDTHH:mm`
  end: string;
  location: string;
  description: string;
}

const TYPES: EventType[] = ['meeting', 'workday', 'other'];

const toValues = (input: Partial<CreateEventInput>): EventValues => ({
  title: input.title ?? '',
  type: input.type ?? 'meeting',
  start: input.start ?? '',
  end: input.end ?? '',
  location: input.location ?? '',
  description: input.description ?? '',
});

function problemWith(v: EventValues, has: (f: Field) => boolean): string | null {
  if (has('title') && !v.title.trim()) return 'Give the event a title.';
  if ((has('start') && !v.start) || (has('end') && !v.end)) return 'Set when the event starts and ends.';
  // Both ends are known only when both are part of the proposal; an update that moves one end
  // can't be checked against the event's current other end from here (the server does).
  if (has('start') && has('end') && v.end < v.start) return "The end can't be before the start.";
  return null;
}

/**
 * A calendar event to create, or changes to an existing one. For an update only
 * the fields the assistant proposed to change are shown and editable.
 */
export default function EventActionCard({ threadId, action }: CardProps<CreateEventAction | UpdateEventAction>) {
  const runner = useActionRunner(threadId, action.id);
  const typeId = useId();
  const [editing, setEditing] = useState(false);

  const input: Partial<CreateEventInput> = action.input;
  const isUpdate = action.type === 'update_event';
  const has = (f: Field) => !isUpdate || input[f] !== undefined;
  const fields = FIELDS.filter(has);

  const proposed = toValues(input);
  const [values, setValues] = useState<EventValues>(proposed);
  const set = <K extends Field>(key: K, value: EventValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  // An update names its event only by id, so look it up to show what is being changed.
  const targetId = isUpdate ? (action.input as { eventId: string }).eventId : null;
  const [events, setEvents] = useState<GardenEvent[] | null>(null);
  useEffect(() => {
    if (targetId) return listenEvents(setEvents);
  }, [targetId]);
  const target: GardenEvent | undefined = events?.find((e) => e.id === targetId);

  const edited: EventValues = { ...values, title: values.title.trim(), location: values.location.trim() };
  const overrides = changedFields(proposed, edited, fields);
  const problem = problemWith(edited, has);

  // For an update the rows are the changes, so they say "New …".
  const label = (create: string, update: string) => (isUpdate ? update : create);
  const targetRows: Array<[string, ReactNode]> =
    isUpdate && events
      ? [
          [
            'Event',
            target
              ? `${target.title}\n${formatGardenWhen(target.start.toDate(), target.end.toDate(), target.allDay)}`
              : "That event wasn't found. It may have been deleted.",
          ],
        ]
      : [];
  const rows: Array<[string, ReactNode]> = [...targetRows];
  if (has('title')) rows.push([label('Title', 'New title'), edited.title]);
  if (has('type')) rows.push([label('Type', 'New type'), typeLabel(edited.type)]);
  if (has('start') && has('end')) {
    rows.push([label('When', 'New time'), formatGardenLocalWhen(edited.start, edited.end, input.allDay ?? false)]);
  } else {
    if (has('start')) rows.push([label('Starts', 'New start'), formatGardenLocal(edited.start)]);
    if (has('end')) rows.push([label('Ends', 'New end'), formatGardenLocal(edited.end)]);
  }
  if (isUpdate && input.allDay !== undefined && !(has('start') && has('end'))) {
    rows.push(['All day', input.allDay ? 'Yes' : 'No']);
  }
  if (has('location') && edited.location) rows.push([label('Where', 'New location'), edited.location]);
  if (has('description') && edited.description) rows.push([label('Details', 'New details'), edited.description]);

  const when = typeof action.result?.when === 'string' ? action.result.when : '';

  return (
    <ActionShell
      label={isUpdate ? 'Calendar event update' : 'Calendar event'}
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
          <p>
            {isUpdate ? 'Calendar updated' : 'Added to the calendar'}
            {when ? `: ${when}` : ''}
          </p>
          <Link to="/calendar" className="text-garden-700 underline">
            View calendar
          </Link>
        </>
      }
    >
      {editing && action.status === 'proposed' ? (
        <div className="space-y-3">
          {targetRows.length > 0 && <Facts rows={targetRows} />}
          {has('title') && (
            <TextField label="Title" value={values.title} maxLength={120} onChange={(e) => set('title', e.target.value)} />
          )}
          {has('type') && (
            <div className="flex flex-col gap-1">
              <label htmlFor={typeId} className="text-sm font-medium text-gray-700">
                Type
              </label>
              <select
                id={typeId}
                value={values.type}
                onChange={(e) => set('type', e.target.value as EventType)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-garden-500"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(has('start') || has('end')) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {has('start') && (
                <TextField label="Starts" type="datetime-local" value={values.start} onChange={(e) => set('start', e.target.value)} />
              )}
              {has('end') && (
                <TextField label="Ends" type="datetime-local" value={values.end} onChange={(e) => set('end', e.target.value)} />
              )}
            </div>
          )}
          {has('location') && (
            <TextField label="Location" value={values.location} maxLength={200} onChange={(e) => set('location', e.target.value)} />
          )}
          {has('description') && (
            <TextAreaField
              label="Description"
              value={values.description}
              maxLength={4000}
              onChange={(e) => set('description', e.target.value)}
            />
          )}
          {problem && <ProblemText>{problem}</ProblemText>}
        </div>
      ) : (
        <Facts rows={rows} />
      )}
    </ActionShell>
  );
}
