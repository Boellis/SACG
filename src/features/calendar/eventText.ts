import { formatGardenWhen } from '../../lib/gardenTime';
import type { EventType, GardenEvent } from '../../lib/types';

export function typeLabel(type: EventType): string {
  if (type === 'workday') return 'Workday';
  if (type === 'meeting') return 'Meeting';
  return 'Other';
}

/** Plain-text event summary for member emails, in garden time. */
export function buildEmailBody(event: GardenEvent): string {
  const when = formatGardenWhen(event.start.toDate(), event.end.toDate(), event.allDay);
  const lines: string[] = [];
  lines.push(`${typeLabel(event.type)} — ${when}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  lines.push('');
  if (event.description) {
    lines.push(event.description);
    lines.push('');
  }
  lines.push('See the SACG calendar: https://sacg-garden-app.web.app/calendar');
  return lines.join('\n');
}
