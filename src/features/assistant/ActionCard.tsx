import { Badge } from '../../components/ui';
import AnnouncementActionCard from './cards/AnnouncementActionCard';
import EmailActionCard from './cards/EmailActionCard';
import EventActionCard from './cards/EventActionCard';
import PollActionCard from './cards/PollActionCard';
import type { CardProps } from './ActionShell';

export type ActionCardProps = CardProps;

/** An action type this version of the app doesn't know: shown, but never approvable from here. */
function UnknownActionCard({ summary }: { summary?: string }) {
  return (
    <div className="w-full max-w-2xl space-y-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-gray-900 whitespace-pre-wrap break-words">{summary}</p>
        <Badge color="gray">Not supported</Badge>
      </div>
      <p className="text-xs text-gray-500">
        This kind of proposal needs a newer version of the app. Reload the page; if it is still here, ask Brandon.
      </p>
    </div>
  );
}

/**
 * One proposal from the assistant, with what the admin can do with it:
 * approve, edit, reject (and, for an email, test-send first). Nothing is sent
 * or changed until an admin approves.
 */
export default function ActionCard(props: ActionCardProps) {
  const { action } = props;
  switch (action.type) {
    case 'create_event':
    case 'update_event':
      return <EventActionCard {...props} action={action} />;
    case 'send_email':
      return <EmailActionCard {...props} action={action} />;
    case 'post_announcement':
      return <AnnouncementActionCard {...props} action={action} />;
    case 'create_poll':
      return <PollActionCard {...props} action={action} />;
    default:
      return <UnknownActionCard summary={(action as { summary?: string }).summary} />;
  }
}

export { ActionCard };
