import { useEffect, useState } from 'react';
import { listenPlots } from '../plots/plotsApi';
import { listenMembers } from '../members/membersApi';
import { listenAllHours } from '../hours/hoursApi';
import { listenEvents, fetchRsvps } from '../calendar/eventsApi';
import { listenThreads } from '../forum/forumApi';
import { listenPolls, fetchVotes } from '../polls/pollsApi';
import { listenSettings } from '../settings/settingsApi';
import {
  DEFAULT_ORG_SETTINGS, currentSeasonDuesHistory, type AnalyticsDataset,
} from '../../logic/analytics';
import type { Member, Plot, VolunteerHour, GardenEvent, ForumThread, Poll, OrgSettings, Rsvp, PollVote } from '../../lib/types';

export function useAnalyticsData(): { data: AnalyticsDataset | null; error: string | null } {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [hours, setHours] = useState<VolunteerHour[] | null>(null);
  const [events, setEvents] = useState<GardenEvent[]>([]);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [rsvpsByEvent, setRsvpsByEvent] = useState<Record<string, Rsvp[]>>({});
  const [votesByPoll, setVotesByPoll] = useState<Record<string, PollVote[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubs = [
      listenMembers(setMembers),
      listenPlots(setPlots),
      listenAllHours(setHours),
      listenEvents(setEvents),
      listenThreads(setThreads),
      listenPolls(setPolls),
      listenSettings(setSettings),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (events.length === 0) return;
    let cancelled = false;
    Promise.all(events.map(async (e) => [e.id, await fetchRsvps(e.id)] as const))
      .then((pairs) => { if (!cancelled) setRsvpsByEvent(Object.fromEntries(pairs)); })
      .catch(() => { if (!cancelled) setError('Some RSVP counts failed to load'); });
    return () => { cancelled = true; };
  }, [events]);

  useEffect(() => {
    if (polls.length === 0) return;
    let cancelled = false;
    Promise.all(polls.map(async (p) => [p.id, await fetchVotes(p.id)] as const))
      .then((pairs) => { if (!cancelled) setVotesByPoll(Object.fromEntries(pairs)); })
      .catch(() => { if (!cancelled) setError('Some poll votes failed to load'); });
    return () => { cancelled = true; };
  }, [polls]);

  if (members === null || plots === null || hours === null) return { data: null, error };
  return {
    data: {
      members, plots, hours, events, threads, polls,
      rsvpsByEvent, votesByPoll,
      duesHistory: currentSeasonDuesHistory(plots),
      settings: settings ?? DEFAULT_ORG_SETTINGS,
    },
    error,
  };
}
