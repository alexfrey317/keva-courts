import { Fragment, useState } from 'react';
import type { AllKevaEvent, Team } from '../../types';
import { toMinutes } from '../../utils/dates';

interface AllKevaViewProps {
  date: string;
  events: AllKevaEvent[];
  teamMap?: Record<number, Team>;
}

interface LocationRow {
  key: string;
  label: string;
  type: string;
  resourceId: number;
  areaId: number | null;
  alwaysShow?: boolean;
  category: LocationCategory;
}

type LocationCategory = 'volleyball' | 'soccer' | 'other';
type AllKevaFilter = 'all' | 'volleyball' | 'soccer';

const KNOWN_LOCATIONS: LocationRow[] = [
  { key: '5-0', label: 'Court 1', type: 'Indoor volleyball / basketball', resourceId: 5, areaId: 0, alwaysShow: true, category: 'volleyball' },
  { key: '4-0', label: 'Court 2', type: 'Indoor volleyball / basketball', resourceId: 4, areaId: 0, alwaysShow: true, category: 'volleyball' },
  { key: '4-53', label: 'Court 2 Volleyball', type: 'Indoor volleyball / basketball', resourceId: 4, areaId: 53, category: 'volleyball' },
  { key: '3-51', label: 'Court 3 West', type: 'Indoor volleyball / basketball', resourceId: 3, areaId: 51, alwaysShow: true, category: 'volleyball' },
  { key: '3-52', label: 'Court 3 East', type: 'Indoor volleyball / basketball', resourceId: 3, areaId: 52, alwaysShow: true, category: 'volleyball' },
  { key: '1-0', label: 'Indoor Soccer Field 1', type: 'Indoor soccer', resourceId: 1, areaId: 0, alwaysShow: true, category: 'soccer' },
  { key: '2-0', label: 'Indoor Soccer Field 2', type: 'Indoor soccer', resourceId: 2, areaId: 0, alwaysShow: true, category: 'soccer' },
  { key: '51-0', label: 'Sand 1', type: 'Outdoor sand volleyball', resourceId: 51, areaId: 0, alwaysShow: true, category: 'volleyball' },
  { key: '52-0', label: 'Sand 2', type: 'Outdoor sand volleyball', resourceId: 52, areaId: 0, alwaysShow: true, category: 'volleyball' },
  { key: '92-0', label: 'Sand 3', type: 'Outdoor sand volleyball', resourceId: 92, areaId: 0, alwaysShow: true, category: 'volleyball' },
  { key: '8-0', label: 'Outdoor Field 1', type: 'Outdoor soccer', resourceId: 8, areaId: 0, alwaysShow: true, category: 'soccer' },
  { key: '231-0', label: 'Outdoor Field 2', type: 'Outdoor soccer', resourceId: 231, areaId: 0, alwaysShow: true, category: 'soccer' },
  { key: '147-104', label: 'Academic Year Camp', type: 'Camp / program space', resourceId: 147, areaId: 104, category: 'other' },
  { key: '147-127', label: 'Camp Basketball 7+', type: 'Camp / program space', resourceId: 147, areaId: 127, category: 'other' },
  { key: '181-0', label: 'Forfeit - Away Team Requested', type: 'Admin placeholder', resourceId: 181, areaId: 0, category: 'other' },
  { key: '209-0', label: 'Forfeit - Home Team Requested', type: 'Admin placeholder', resourceId: 209, areaId: 0, category: 'other' },
  { key: '233-0', label: 'Reschedule - Home Team Requested', type: 'Admin placeholder', resourceId: 233, areaId: 0, category: 'other' },
  { key: '234-0', label: 'Reschedule - Away Team Requested', type: 'Admin placeholder', resourceId: 234, areaId: 0, category: 'other' },
  { key: '237-0', label: 'Forfeit - Away Team Requested II', type: 'Admin placeholder', resourceId: 237, areaId: 0, category: 'other' },
];
const KNOWN_LOCATION_KEYS = new Set(KNOWN_LOCATIONS.map((location) => location.key));
const F2_AREA_IDS = new Set([30, 31, 33, 140, 141, 142, 143, 144, 145]);

function locationKey(event: AllKevaEvent): string {
  return `${event.resourceId}-${event.resourceAreaId ?? 0}`;
}

function fallbackLocation(event: AllKevaEvent): LocationRow {
  const areaId = event.resourceAreaId ?? 0;
  return {
    key: locationKey(event),
    label: `Resource ${event.resourceId}${areaId ? ` / area ${areaId}` : ''}`,
    type: 'Other DaySmart location',
    resourceId: event.resourceId,
    areaId,
    category: 'other',
  };
}

function displayLocationKeys(event: AllKevaEvent): string[] {
  if (event.resourceId === 3 && (event.resourceAreaId ?? 0) === 0) {
    return ['3-51', '3-52'];
  }
  if (event.resourceId === 2 && F2_AREA_IDS.has(event.resourceAreaId ?? 0)) {
    return ['2-0'];
  }
  return [locationKey(event)];
}

function formatTime(time: string): string {
  if (!time) return '??';
  const [hourPart, minutePart] = time.split(':');
  const hour = Number(hourPart);
  if (!Number.isFinite(hour)) return time;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutePart} ${suffix}`;
}

function timeFromMinutes(minutes: number): string {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function buildTimeAxis(events: AllKevaEvent[]): string[] {
  const starts = events.map((event) => toMinutes(event.start)).filter(Number.isFinite);
  const ends = events.map((event) => toMinutes(event.end)).filter(Number.isFinite);
  if (starts.length === 0) return [];

  const first = Math.floor(Math.min(...starts) / 30) * 30;
  const last = Math.ceil(Math.max(...ends) / 30) * 30;
  const times = new Set<string>();
  for (let minutes = first; minutes <= last; minutes += 30) {
    times.add(timeFromMinutes(minutes));
  }
  for (const event of events) {
    times.add(event.start);
  }
  return [...times].sort((a, b) => toMinutes(a) - toMinutes(b));
}

function eventOverlapsTime(event: AllKevaEvent, time: string): boolean {
  const slotMin = toMinutes(time);
  const startMin = toMinutes(event.start);
  const endMin = toMinutes(event.end);
  return Number.isFinite(slotMin) && Number.isFinite(startMin) && Number.isFinite(endMin) && startMin <= slotMin && slotMin < endMin;
}

function teamName(teamId: number | null, teamMap?: Record<number, Team>): string {
  if (!teamId) return '';
  return teamMap?.[teamId]?.name || '';
}

function eventTitle(event: AllKevaEvent, teamMap?: Record<number, Team>): string {
  if (event.desc.trim()) return event.desc;
  if (event.eventTypeId === 'g') {
    const home = teamName(event.homeTeamId, teamMap);
    const away = teamName(event.visitingTeamId, teamMap);
    if (home && away) return `${home}\nvs ${away}`;
    if (home) return `${home} vs TBD`;
    if (away) return `TBD vs ${away}`;
    if ([3, 4, 5, 51, 52, 92].includes(event.resourceId)) return 'Volleyball game';
    if ([1, 2, 8, 231].includes(event.resourceId)) return 'Soccer game';
    return 'Game';
  }
  if (event.eventTypeId === '14') return 'Open play';
  if (event.eventTypeId === 'c') return 'Class';
  return '(No description)';
}

const FILTERS: Array<{ id: AllKevaFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'volleyball', label: 'Volleyball' },
  { id: 'soccer', label: 'Soccer' },
];

export function AllKevaView({ date, events, teamMap }: AllKevaViewProps) {
  const [filter, setFilter] = useState<AllKevaFilter>('all');
  const eventsByLocation = new Map<string, AllKevaEvent[]>();
  const unknownLocations = new Map<string, LocationRow>();

  for (const event of events) {
    for (const key of displayLocationKeys(event)) {
      if (!eventsByLocation.has(key)) eventsByLocation.set(key, []);
      eventsByLocation.get(key)!.push(event);
    }

    const rawKey = locationKey(event);
    if (!KNOWN_LOCATION_KEYS.has(rawKey) && rawKey !== '3-0' && !(event.resourceId === 2 && F2_AREA_IDS.has(event.resourceAreaId ?? 0))) {
      unknownLocations.set(rawKey, fallbackLocation(event));
    }
  }

  const allLocations = [
    ...KNOWN_LOCATIONS.filter((location) => location.alwaysShow || eventsByLocation.has(location.key)),
    ...[...unknownLocations.values()].sort((a, b) => a.resourceId - b.resourceId || (a.areaId ?? 0) - (b.areaId ?? 0)),
  ];
  const locations = allLocations.filter((location) => filter === 'all' || location.category === filter);
  const visibleLocationKeys = new Set(locations.map((location) => location.key));
  const visibleEvents = events.filter((event) => displayLocationKeys(event).some((key) => visibleLocationKeys.has(key)));
  const times = buildTimeAxis(visibleEvents);

  return (
    <section className="all-keva">
      <div className="all-keva-hero">
        <div>
          <p className="all-keva-kicker">Facility schedule</p>
          <h2>All KEVA</h2>
          <p>Every DaySmart event posted for {date}, shown without volleyball filtering.</p>
        </div>
        <div className="all-keva-count">
          <strong>{events.length}</strong>
          <span>{events.length === 1 ? 'event' : 'events'}</span>
        </div>
      </div>

      <div className="all-keva-filters" aria-label="All KEVA filters">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={filter === option.id ? 'active' : ''}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {times.length > 0 && (
        <div
          className="grid all-keva-grid"
          style={{ gridTemplateColumns: `minmax(52px,64px) repeat(${locations.length},minmax(112px,1fr))` }}
        >
          <div className="g-hdr" />
          {locations.map((location) => (
            <div key={location.key} className="g-hdr all-keva-location">
              <span>{location.label}</span>
              <small>{location.type}</small>
            </div>
          ))}

          {times.map((time) => (
            <Fragment key={time}>
              <div className="g-time">{formatTime(time)}</div>
              {locations.map((location) => {
                const cellEvents = (eventsByLocation.get(location.key) || []).filter((event) => eventOverlapsTime(event, time));
                if (cellEvents.length === 0) {
                  return (
                    <div key={location.key} className="g-cell booked all-keva-empty-cell">
                      {'\u2014'}
                    </div>
                  );
                }

                return (
                  <div key={location.key} className="g-cell booked all-keva-event-cell">
                    {cellEvents.map((event) => (
                      <div key={event.id} className="all-keva-event" title={`${formatTime(event.start)}-${formatTime(event.end)}`}>
                        {eventTitle(event, teamMap)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}

      {events.length === 0 && (
        <div className="all-keva-empty">No DaySmart events are posted for this date.</div>
      )}
    </section>
  );
}
