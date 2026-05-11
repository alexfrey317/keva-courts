import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import type { Mode, Theme } from './types';
import { compareDateTime, getDefaultDate, isUpcomingGame, isVbDay as checkVbDay, isToday } from './utils/dates';
import { computeRecord, countOpenSlots, hasTbdMatch } from './utils/courts';
import { getPref, setPref, applyTheme, getTeamColor } from './utils/theme';

import { useTeams } from './hooks/useTeams';
import { useGameData } from './hooks/useGameData';
import { useOpenPlay } from './hooks/useOpenPlay';
import { useSeasonData } from './hooks/useSeasonData';
import { useCalendarDots } from './hooks/useCalendarDots';
import { useNotifications } from './hooks/useNotifications';
import { useTeamRosters } from './hooks/useTeamRosters';
import { useSwipe } from './hooks/useSwipe';

import { Header } from './components/Layout/Header';
import { ModeToggle } from './components/Layout/ModeToggle';
import { Calendar } from './components/Calendar/Calendar';
import { DayNav } from './components/Calendar/DayNav';
import { Summary } from './components/GameGrid/Summary';
import { ScheduleGrid } from './components/GameGrid/ScheduleGrid';
import { Callouts } from './components/GameGrid/Callouts';
import { OpenPlayView } from './components/OpenPlay/OpenPlayView';
import { NextGameCard } from './components/Common/NextGameCard';
import { Loading } from './components/Common/Loading';
import { QuickStartCard } from './components/Common/QuickStartCard';
import { TeamRosterName } from './components/Common/TeamRosterName';

// Lazy-loaded components (not needed on initial render)
const SeasonSchedule = lazy(() => import('./components/Season/SeasonSchedule').then(m => ({ default: m.SeasonSchedule })));
const StandingsView = lazy(() => import('./components/Season/StandingsView').then(m => ({ default: m.StandingsView })));
const TeamPicker = lazy(() => import('./components/TeamPicker/TeamPicker').then(m => ({ default: m.TeamPicker })));
const CourtMapModal = lazy(() => import('./components/CourtMap/CourtMapModal').then(m => ({ default: m.CourtMapModal })));
const NotificationsTab = lazy(() => import('./components/Notifications/NotificationsTab').then(m => ({ default: m.NotificationsTab })));
const FindSubsView = lazy(() => import('./components/FindSubs/FindSubsView').then(m => ({ default: m.FindSubsView })));

function formatCourtList(courts: string[]): string {
  if (courts.length <= 1) return courts[0] || '';
  if (courts.length === 2) return `${courts[0]} and ${courts[1]}`;
  return `${courts.slice(0, -1).join(', ')}, and ${courts[courts.length - 1]}`;
}

interface ViewedPlayerSchedule {
  name: string;
  teamIds: number[];
}

export function App() {
  // ── Date & navigation ──
  const [dateStr, setDateStr] = useState(getDefaultDate);

  // ── Mode / tab ──
  const [mode, setModeRaw] = useState<Mode>(() => (getPref('keva-tab', 'games') as Mode) || 'games');
  const [viewedPlayer, setViewedPlayer] = useState<ViewedPlayerSchedule | null>(null);
  const isViewingPlayerSchedule = mode === 'findsubs' && viewedPlayer != null;
  const setMode = useCallback((m: Mode) => {
    if (m !== 'findsubs') setViewedPlayer(null);
    setModeRaw(m);
    setPref('keva-tab', m);
  }, []);

  // ── Calendar state ──
  const [calOpen, setCalOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(() => Number(getPref('keva-ws', '0')));
  const initDate = new Date(getDefaultDate() + 'T12:00:00');
  const [calYear, setCalYear] = useState(initDate.getFullYear());
  const [calMonth, setCalMonth] = useState(initDate.getMonth());
  const handleViewChange = useCallback((y: number, m: number) => { setCalYear(y); setCalMonth(m); }, []);
  const handleWeekStart = (v: number) => { setWeekStart(v); setPref('keva-ws', String(v)); };

  // ── Theme ──
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = getPref('keva-theme', null);
    return (saved as Theme) || (window.matchMedia?.('(prefers-color-scheme:light)').matches ? 'light' : 'dark');
  });
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setPref('keva-theme', next);
    applyTheme(next);
  };

  // ── UI state ──
  const [copied, setCopied] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundReady, setBackgroundReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setBackgroundReady(true), 350);
    return () => window.clearTimeout(id);
  }, []);

  const share = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };

  // ── Teams ──
  const {
    teamData, teamLoading, teamError, teamSource, teamFetchedAt, showPicker, setShowPicker,
    myTeams, saveTeams, myTeamObjs, myTeamIdSet, teamColorOverrides, teamColorMap, myTeamDateMap,
    reloadTeams,
  } = useTeams();

  const activeScheduleTeamIds = isViewingPlayerSchedule ? viewedPlayer.teamIds : myTeams;
  const activeScheduleTeamIdSet = useMemo(() => new Set(activeScheduleTeamIds), [activeScheduleTeamIds]);
  const activeScheduleTeamObjs = useMemo(() => {
    if (!teamData) return [];
    return activeScheduleTeamIds.map((id) => teamData.teamMap[id]).filter(Boolean);
  }, [activeScheduleTeamIds, teamData]);
  const activeScheduleColorMap = useMemo(() => {
    const colors = new Map<number, number>();
    activeScheduleTeamIds.forEach((id, index) => {
      colors.set(id, teamColorOverrides[id] ?? index);
    });
    return colors;
  }, [activeScheduleTeamIds, teamColorOverrides]);

  // ── Game data ──
  const myIds = (mode === 'myteam' || isViewingPlayerSchedule) && activeScheduleTeamIdSet.size > 0 ? activeScheduleTeamIdSet : null;
  const { gameState, refetch } = useGameData(dateStr, myIds);

  // ── Open play ──
  const {
    sessions: opSessions,
    loading: opLoading,
    error: opError,
    source: opSource,
    fetchedAt: opFetchedAt,
    opDates,
    todaySessions: todayOp,
    reload: reloadOpenPlay,
  } = useOpenPlay(dateStr, mode === 'openplay' || backgroundReady);

  // ── Season data ──
  const {
    allSeasonGames,
    loading: seasonLoading,
    error: seasonError,
    source: seasonSource,
    fetchedAt: seasonFetchedAt,
    reload: reloadSeason,
  } = useSeasonData(mode === 'season' || mode === 'myteam' || mode === 'findsubs' || backgroundReady);

  const scheduledGameDates = useMemo(() => {
    const dates = new Set<string>();
    for (const game of allSeasonGames || []) dates.add(game.date);
    return dates;
  }, [allSeasonGames]);
  const activeScheduleDateMap = useMemo(() => {
    if (!isViewingPlayerSchedule) return myTeamDateMap;
    const dates = new Map<string, number[]>();
    if (!allSeasonGames) return dates;

    for (const game of allSeasonGames) {
      const teamIds = [game.ht, game.vt].filter((teamId) => activeScheduleTeamIdSet.has(teamId));
      if (!teamIds.length) continue;
      const existing = dates.get(game.date) || [];
      for (const teamId of teamIds) {
        if (!existing.includes(teamId)) existing.push(teamId);
      }
      dates.set(game.date, existing);
    }

    return dates;
  }, [activeScheduleTeamIdSet, allSeasonGames, isViewingPlayerSchedule, myTeamDateMap]);
  const viewPlayerSchedule = useCallback((playerName: string, teamIds: number[]) => {
    const uniqueTeamIds = [...new Set(teamIds)].filter((teamId) => teamData?.teamMap[teamId]);
    if (!uniqueTeamIds.length) return;

    setViewedPlayer({ name: playerName, teamIds: uniqueTeamIds });

    const now = new Date();
    const nextGame = allSeasonGames
      ?.filter((game) =>
        (uniqueTeamIds.includes(game.ht) || uniqueTeamIds.includes(game.vt)) &&
        isUpcomingGame(game.date, game.start, now),
      )
      .sort((a, b) => compareDateTime(a.date, a.start, b.date, b.start))[0];
    if (nextGame) setDateStr(nextGame.date);

    setMode('findsubs');
  }, [allSeasonGames, setMode, teamData]);
  const isVbDay = checkVbDay(dateStr, scheduledGameDates)
    || (gameState.status === 'ok' && gameState.rawGames.length > 0);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    const startedAt = Date.now();
    setRefreshing(true);

    try {
      const jobs: Promise<unknown>[] = [reloadTeams()];
      if (mode === 'games' || mode === 'myteam' || isViewingPlayerSchedule) jobs.push(refetch());
      if (mode === 'openplay') jobs.push(reloadOpenPlay());
      if (mode === 'games' || mode === 'myteam' || mode === 'season' || mode === 'findsubs') jobs.push(reloadSeason());
      await Promise.allSettled(jobs);
    } finally {
      const minVisibleMs = 650;
      const remainingMs = Math.max(0, minVisibleMs - (Date.now() - startedAt));
      window.setTimeout(() => setRefreshing(false), remainingMs);
    }
  }, [isViewingPlayerSchedule, mode, refetch, refreshing, reloadOpenPlay, reloadSeason, reloadTeams]);

  // ── Calendar dots ──
  const calendarTeamColorMap = isViewingPlayerSchedule ? activeScheduleColorMap : teamColorMap;
  const calendarTeamIds = isViewingPlayerSchedule ? activeScheduleTeamIdSet : myTeamIdSet;
  const getDots = useCalendarDots(calYear, calMonth, weekStart, mode, opDates, calendarTeamColorMap, theme, allSeasonGames, calendarTeamIds, teamData?.teamMap);

  // ── Notifications ──
  const notif = useNotifications(myTeams);
  const { rosters, status: rosterStatus } = useTeamRosters(
    teamData?.teams.map((team) => team.id) || [],
    mode === 'season' || mode === 'myteam' || mode === 'findsubs' || backgroundReady,
  );

  // ── Derived ──
  const myGamesToday = gameState.status === 'ok'
    ? gameState.grid.rows.reduce((n, r) => n + r.cells.filter((c) => c.myGame).length, 0)
    : 0;
  const openSummary = gameState.status === 'ok'
    ? countOpenSlots(gameState.grid, gameState.courts, gameState.vbStart)
    : { total: 0, likely: 0, warning: 0 };
  const tournamentSeason = gameState.status === 'ok' && openSummary.total > 0
    ? hasTbdMatch(gameState.rawGames, teamData?.teamMap)
    : false;
  const missingOtherCourts = gameState.status === 'ok'
    ? gameState.missing.filter((note) => note.reason === 'other_activity').map((note) => note.court)
    : [];
  const missingUnlistedCourts = gameState.status === 'ok'
    ? gameState.missing.filter((note) => note.reason === 'unlisted').map((note) => note.court)
    : [];

  const renderTeamSetupPrompt = (copy: string) => {
    if (teamLoading) return <Loading />;

    if (teamError || !teamData) {
      return (
        <div className="info-card error">
          <h2>Team list unavailable</h2>
          <p>My Teams and Season views need the DaySmart team directory before they can load.</p>
          <button className="retry-btn" onClick={() => void reloadTeams()}>
            Retry team list
          </button>
        </div>
      );
    }

    return (
      <div className="select-prompt">
        <p>{copy}</p>
        <button className="select-btn" onClick={() => setShowPicker(true)}>
          Select Your Teams
        </button>
      </div>
    );
  };

  // ── Team banner (shared between sidebar and tabs) ──
  const renderTeamBanner = (
    showEditBtn: boolean,
    teams = myTeamObjs,
    colors = teamColorMap,
  ) => (
    <div className="team-banner">
      <div className="tb-info">
        {teams.map((t) => {
          const ci = colors.get(t.id);
          const cc = ci !== undefined ? getTeamColor(ci, theme) : null;
          const rec = allSeasonGames ? computeRecord(allSeasonGames, t.id) : null;
          return (
            <div key={t.id}>
              <TeamRosterName
                teamId={t.id}
                name={t.name}
                rosters={rosters}
                className="tb-name"
                style={cc ? { color: cc.t } : {}}
              />{' '}
              <span className="tb-league">{t.leagueName}</span>
              {rec && <span className="tb-record">({rec.w}W-{rec.l}L)</span>}
            </div>
          );
        })}
      </div>
      {showEditBtn && (
        <button className="tb-change" onClick={() => setShowPicker(true)}>Edit</button>
      )}
    </div>
  );

  const backToFindSubs = () => {
    setViewedPlayer(null);
  };
  const navigateToMyTeam = (d: string) => { setDateStr(d); setMode('myteam'); };
  const navigateToActiveSchedule = (d: string) => {
    setDateStr(d);
    if (!isViewingPlayerSchedule) setMode('myteam');
  };
  const playerScheduleSwipeRef = useSwipe(() => {}, () => {
    if (isViewingPlayerSchedule) setViewedPlayer(null);
  });
  const sidebarTeamObjs = isViewingPlayerSchedule ? activeScheduleTeamObjs : myTeamObjs;
  const sidebarTeamIdSet = isViewingPlayerSchedule ? activeScheduleTeamIdSet : myTeamIdSet;
  const sidebarTeamColorMap = isViewingPlayerSchedule ? activeScheduleColorMap : teamColorMap;
  const sidebarTeamDateMap = isViewingPlayerSchedule ? activeScheduleDateMap : myTeamDateMap;

  return (
    <>
      <header>
        <Header
          theme={theme}
          onToggleTheme={toggleTheme}
          onShowMap={() => setShowMap(true)}
          onShare={share}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          copied={copied}
        />
        {showMap && <Suspense><CourtMapModal onClose={() => setShowMap(false)} /></Suspense>}
      </header>

      <ModeToggle mode={mode} onChange={setMode} />

      <div className="wide-layout">
        {/* ── Sidebar (desktop) ── */}
        <aside className="wide-sidebar">
          <div className="cal-collapse">
            <button onClick={() => setCalOpen((o) => !o)} aria-expanded={calOpen}>
              {calOpen ? 'Hide Calendar' : 'Show Calendar'}
            </button>
          </div>
          <div className={calOpen ? 'cal-wrap open' : 'cal-wrap'}>
            <Calendar
              selected={dateStr}
              onSelect={setDateStr}
              getDots={getDots}
              weekStart={weekStart}
              onWeekStartChange={handleWeekStart}
              viewYear={calYear}
              viewMonth={calMonth}
              onViewChange={handleViewChange}
              volleyballDates={scheduledGameDates}
            />
          </div>
          <DayNav dateStr={dateStr} onDateChange={setDateStr} volleyballDates={scheduledGameDates} />

          <div className="wide-sidebar-extra">
            {(mode === 'games' || ((mode === 'myteam' || isViewingPlayerSchedule) && showOpen)) && gameState.status === 'ok' && (
              <Summary openSummary={openSummary} hasCourts={gameState.courts.length > 0} isVbDay={isVbDay} tournamentSeason={tournamentSeason} />
            )}
            {sidebarTeamObjs.length > 0 && (
              <>
                {renderTeamBanner(!isViewingPlayerSchedule, sidebarTeamObjs, sidebarTeamColorMap)}
                <NextGameCard
                  myTeamDateMap={sidebarTeamDateMap}
                  allSeasonGames={allSeasonGames}
                  myTeamIds={sidebarTeamIdSet}
                  teamColorMap={sidebarTeamColorMap}
                  teamMap={teamData?.teamMap}
                  theme={theme}
                  dateStr={dateStr}
                  onGo={navigateToActiveSchedule}
                />
              </>
            )}
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="wide-main">

          {/* Games tab */}
          {mode === 'games' && (
            <>
              {myTeams.length === 0 && (
                <QuickStartCard
                  canPickTeams={!teamLoading && !!teamData}
                  onPickTeams={() => setShowPicker(true)}
                  onShowTonight={() => {
                    setDateStr(getDefaultDate(scheduledGameDates));
                    setMode('games');
                  }}
                  onOpenAlerts={() => setMode('notifications')}
                />
              )}
              {gameState.status === 'loading' && <Loading />}
              {gameState.status === 'ok' && (
                <>
                  <Summary openSummary={openSummary} hasCourts={gameState.courts.length > 0} isVbDay={isVbDay} tournamentSeason={tournamentSeason} />
                  {isVbDay && gameState.courts.length > 0 && (
                    <>
                      <ScheduleGrid
                        grid={gameState.grid}
                        courts={gameState.courts}
                        vbStart={gameState.vbStart}
                        showNow
                        dateStr={dateStr}
                        rawGames={gameState.rawGames}
                        allTeamMap={teamData?.teamMap}
                        rosters={rosters}
                        rosterStatus={rosterStatus}
                        allSeasonGames={allSeasonGames}
                        tournamentSeason={tournamentSeason}
                      />
                      <Callouts grid={gameState.grid} courts={gameState.courts} vbStart={gameState.vbStart} tournamentSeason={tournamentSeason} />
                      {missingOtherCourts.length > 0 && (
                        <div className="bb-note">
                          {formatCourtList(missingOtherCourts)} {missingOtherCourts.length === 1 ? 'is' : 'are'} booked for other activity, so volleyball is not listed there.
                        </div>
                      )}
                      {missingUnlistedCourts.length > 0 && (
                        <div className="bb-note">
                          {formatCourtList(missingUnlistedCourts)} {missingUnlistedCourts.length === 1 ? 'has' : 'have'} no posted volleyball or other activity; it may be open space, but it is not confirmed.
                        </div>
                      )}
                    </>
                  )}
                  <div className="status">
                    {gameState.source === 'cached' ? 'Saved data' : 'Live data'} &middot; updated {gameState.updatedAt}
                    {isToday(dateStr) && ' \u00b7 auto-refresh 3m'}
                  </div>
                </>
              )}
              {gameState.status === 'error' && (
                <div className="info-card error">
                  <h2>Schedule temporarily unavailable</h2>
                  <p>KEVA&apos;s DaySmart schedule is not responding right now.</p>
                  <button className="retry-btn" onClick={() => void handleRefresh()}>
                    Try again
                  </button>
                </div>
              )}
            </>
          )}

          {/* Open Play tab */}
          {mode === 'openplay' && (
            <>
              {opLoading && <Loading />}
              {opSessions && <OpenPlayView selectedDate={dateStr} sessions={todayOp} allSessions={opSessions} />}
              {!opLoading && opError && (
                <div className="info-card error">
                  <h2>Open play temporarily unavailable</h2>
                  <p>The open play feed did not load this time.</p>
                  <button className="retry-btn" onClick={() => void reloadOpenPlay()}>
                    Retry open play
                  </button>
                </div>
              )}
              {opSessions && (
                <div className="status">
                  {opSource === 'cached' ? 'Saved data' : 'Live data'} &middot; {opSessions.length} sessions loaded
                </div>
              )}
            </>
          )}

          {/* My Team(s) tab */}
          {mode === 'myteam' && (
            <>
              {!myTeamObjs.length && (
                renderTeamSetupPrompt('Pick your teams to see your game schedule highlighted on the court grid.')
              )}
              {myTeamObjs.length > 0 && (
                <>
                  {renderTeamBanner(true)}
                  <NextGameCard
                    myTeamDateMap={myTeamDateMap}
                    allSeasonGames={allSeasonGames}
                    myTeamIds={myTeamIdSet}
                    teamColorMap={teamColorMap}
                    teamMap={teamData?.teamMap}
                    theme={theme}
                    dateStr={dateStr}
                    onGo={navigateToMyTeam}
                  />
                  {gameState.status === 'loading' && <Loading />}
                  {gameState.status === 'ok' && (
                    <>
                      {isVbDay && gameState.courts.length > 0 ? (
                        <>
                          {myGamesToday > 0 ? (
                            <div className="summary has-my">
                              <span className="count">Game day!</span>
                              <span className="label">
                                {myGamesToday} game{myGamesToday > 1 ? 's' : ''} on this court sheet
                              </span>
                            </div>
                          ) : (
                            <div className="summary no-games">Your team doesn't play this day</div>
                          )}
                          {(() => {
                            const hasOpen = openSummary.total > 0;
                            return (
                              <div className="show-open-toggle">
                                <button
                                  className={showOpen && hasOpen ? 'on' : ''}
                                  disabled={!hasOpen}
                                  onClick={() => setShowOpen((o) => !o)}
                                >
                                  {!hasOpen ? 'No open courts' : showOpen ? 'Hide open courts' : 'Show open courts'}
                                </button>
                              </div>
                            );
                          })()}
                          <ScheduleGrid
                            grid={gameState.grid}
                            courts={gameState.courts}
                            teamMap={teamData?.teamMap}
                            hideOpen={!showOpen}
                            vbStart={gameState.vbStart}
                            teamColors={teamColorMap}
                            theme={theme}
                            showNow
                            dateStr={dateStr}
                            rawGames={gameState.rawGames}
                            allTeamMap={teamData?.teamMap}
                            rosters={rosters}
                            rosterStatus={rosterStatus}
                            allSeasonGames={allSeasonGames}
                            tournamentSeason={tournamentSeason}
                          />
                          {showOpen && (
                            <Callouts grid={gameState.grid} courts={gameState.courts} vbStart={gameState.vbStart} tournamentSeason={tournamentSeason} />
                          )}
                        </>
                      ) : (
                        <div className="summary no-games">Your team doesn't play this day</div>
                      )}
                      <div className="status">
                        {gameState.source === 'cached' ? 'Saved data' : 'Live data'} &middot; updated {gameState.updatedAt}
                        {isToday(dateStr) && ' \u00b7 auto-refresh 3m'}
                      </div>
                    </>
                  )}
                  {gameState.status === 'error' && (
                    <div className="info-card error">
                      <h2>My Teams schedule unavailable</h2>
                      <p>Team highlighting is ready, but the live court sheet did not load.</p>
                      <button className="retry-btn" onClick={() => void refetch()}>
                        Retry courts
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Season tab */}
          {mode === 'season' && (
            <>
              {!myTeamObjs.length && (
                renderTeamSetupPrompt('Pick your teams to see your full season schedule and standings.')
              )}
              {myTeamObjs.length > 0 && (
                <>
                  {renderTeamBanner(true)}
                  {seasonLoading && <Loading />}
                  {allSeasonGames ? (
                    <Suspense fallback={<Loading />}>
                      <SeasonSchedule
                        allGames={allSeasonGames}
                        myTeamIds={myTeamIdSet}
                        teamMap={teamData?.teamMap || {}}
                        teamColorMap={teamColorMap}
                        theme={theme}
                        onDateChange={navigateToMyTeam}
                        rosters={rosters}
                        rosterStatus={rosterStatus}
                      />
                      <StandingsView
                        allGames={allSeasonGames}
                        teamMap={teamData?.teamMap || {}}
                        myTeamObjs={myTeamObjs}
                        myTeamIds={myTeamIdSet}
                        rosters={rosters}
                        rosterStatus={rosterStatus}
                      />
                    </Suspense>
                  ) : seasonError ? (
                    <div className="info-card error">
                      <h2>Season data temporarily unavailable</h2>
                      <p>The season schedule and standings feed did not load this time.</p>
                      <button className="retry-btn" onClick={() => void reloadSeason()}>
                        Retry season data
                      </button>
                    </div>
                  ) : (
                    <Loading />
                  )}
                </>
              )}
            </>
          )}

          {/* Find Subs tab */}
          {mode === 'findsubs' && (
            <>
              {teamLoading && <Loading />}
              {!teamLoading && (teamError || !teamData) && (
                <div className="info-card error">
                  <h2>Sub list unavailable</h2>
                  <p>The team directory needs to load before players can be grouped by Epic level.</p>
                  <button className="retry-btn" onClick={() => void reloadTeams()}>
                    Retry team list
                  </button>
                </div>
              )}
              {teamData && (
                viewedPlayer ? (
                  <div className="player-schedule-drilldown" ref={playerScheduleSwipeRef}>
                    <div className="player-view-banner">
                      <button type="button" className="player-view-back" onClick={backToFindSubs}>
                        &larr; Back
                      </button>
                      <div>
                        <span>Viewing player schedule</span>
                        <strong>{viewedPlayer.name}</strong>
                        <p>Roster names use first name and last initial, so this may include matching players.</p>
                      </div>
                    </div>
                    {activeScheduleTeamObjs.length > 0 ? (
                      <>
                        {renderTeamBanner(false, activeScheduleTeamObjs, activeScheduleColorMap)}
                        <NextGameCard
                          myTeamDateMap={activeScheduleDateMap}
                          allSeasonGames={allSeasonGames}
                          myTeamIds={activeScheduleTeamIdSet}
                          teamColorMap={activeScheduleColorMap}
                          teamMap={teamData.teamMap}
                          theme={theme}
                          dateStr={dateStr}
                          onGo={setDateStr}
                        />
                        {gameState.status === 'loading' && <Loading />}
                        {gameState.status === 'ok' && (
                          <>
                            {isVbDay && gameState.courts.length > 0 ? (
                              <>
                                {myGamesToday > 0 ? (
                                  <div className="summary has-my">
                                    <span className="count">Game day!</span>
                                    <span className="label">
                                      {myGamesToday} game{myGamesToday > 1 ? 's' : ''} on this court sheet
                                    </span>
                                  </div>
                                ) : (
                                  <div className="summary no-games">{viewedPlayer.name} doesn't play this day</div>
                                )}
                                {(() => {
                                  const hasOpen = openSummary.total > 0;
                                  return (
                                    <div className="show-open-toggle">
                                      <button
                                        className={showOpen && hasOpen ? 'on' : ''}
                                        disabled={!hasOpen}
                                        onClick={() => setShowOpen((o) => !o)}
                                      >
                                        {!hasOpen ? 'No open courts' : showOpen ? 'Hide open courts' : 'Show open courts'}
                                      </button>
                                    </div>
                                  );
                                })()}
                                <ScheduleGrid
                                  grid={gameState.grid}
                                  courts={gameState.courts}
                                  teamMap={teamData.teamMap}
                                  hideOpen={!showOpen}
                                  vbStart={gameState.vbStart}
                                  teamColors={activeScheduleColorMap}
                                  theme={theme}
                                  showNow
                                  dateStr={dateStr}
                                  rawGames={gameState.rawGames}
                                  allTeamMap={teamData.teamMap}
                                  rosters={rosters}
                                  rosterStatus={rosterStatus}
                                  allSeasonGames={allSeasonGames}
                                  tournamentSeason={tournamentSeason}
                                />
                                {showOpen && (
                                  <Callouts grid={gameState.grid} courts={gameState.courts} vbStart={gameState.vbStart} tournamentSeason={tournamentSeason} />
                                )}
                              </>
                            ) : (
                              <div className="summary no-games">{viewedPlayer.name} doesn't play this day</div>
                            )}
                            <div className="status">
                              {gameState.source === 'cached' ? 'Saved data' : 'Live data'} &middot; updated {gameState.updatedAt}
                              {isToday(dateStr) && ' \u00b7 auto-refresh 3m'}
                            </div>
                          </>
                        )}
                        {gameState.status === 'error' && (
                          <div className="info-card error">
                            <h2>Player schedule unavailable</h2>
                            <p>Team highlighting is ready, but the live court sheet did not load.</p>
                            <button className="retry-btn" onClick={() => void refetch()}>
                              Retry courts
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="info-card error">
                        <h2>Player schedule unavailable</h2>
                        <p>No current teams were found for {viewedPlayer.name}.</p>
                        <button className="retry-btn" onClick={backToFindSubs}>
                          Back to search
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Suspense fallback={<Loading />}>
                    <FindSubsView
                      teams={teamData.teams}
                      teamMap={teamData.teamMap}
                      rosters={rosters}
                      rosterStatus={rosterStatus}
                      onViewPlayerSchedule={viewPlayerSchedule}
                    />
                  </Suspense>
                )
              )}
            </>
          )}

          {/* Notifications tab */}
          {mode === 'notifications' && (
            <Suspense fallback={<Loading />}>
              <NotificationsTab
                prefs={notif.prefs}
                setPrefs={notif.setPrefs}
                permission={notif.permission}
                requestPermission={notif.requestPermission}
                registerPush={notif.registerPush}
                supported={notif.supported}
                pushSupported={notif.pushSupported}
                hasTeams={myTeams.length > 0}
                pushSub={notif.pushSub}
                registering={notif.registering}
                setupError={notif.setupError}
              />
            </Suspense>
          )}
        </main>
      </div>

      {showPicker && teamData && (
        <Suspense><TeamPicker
          leagues={teamData.leagues}
          teams={teamData.teams}
          selectedIds={myTeams}
          selectedColors={teamColorMap}
          colorOverrides={teamColorOverrides}
          theme={theme}
          onDone={saveTeams}
          onClose={() => setShowPicker(false)}
        /></Suspense>
      )}
    </>
  );
}
