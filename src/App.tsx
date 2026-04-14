import { useState, useCallback, lazy, Suspense } from 'react';
import type { Mode, Theme } from './types';
import { getDefaultDate, isVbDay as checkVbDay, isToday } from './utils/dates';
import { computeRecord } from './utils/courts';
import { getPref, setPref, applyTheme, getTeamColor } from './utils/theme';

import { useTeams } from './hooks/useTeams';
import { useGameData } from './hooks/useGameData';
import { useOpenPlay } from './hooks/useOpenPlay';
import { useSeasonData } from './hooks/useSeasonData';
import { useCalendarDots } from './hooks/useCalendarDots';
import { useNotifications } from './hooks/useNotifications';
import { useTeamRosters } from './hooks/useTeamRosters';

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
import { SourceBanner } from './components/Common/SourceBanner';
import { QuickStartCard } from './components/Common/QuickStartCard';
import { TeamRosterName } from './components/Common/TeamRosterName';

// Lazy-loaded components (not needed on initial render)
const SeasonSchedule = lazy(() => import('./components/Season/SeasonSchedule').then(m => ({ default: m.SeasonSchedule })));
const StandingsView = lazy(() => import('./components/Season/StandingsView').then(m => ({ default: m.StandingsView })));
const TeamPicker = lazy(() => import('./components/TeamPicker/TeamPicker').then(m => ({ default: m.TeamPicker })));
const CourtMapModal = lazy(() => import('./components/CourtMap/CourtMapModal').then(m => ({ default: m.CourtMapModal })));
const NotificationsTab = lazy(() => import('./components/Notifications/NotificationsTab').then(m => ({ default: m.NotificationsTab })));

export function App() {
  // ── Date & navigation ──
  const [dateStr, setDateStr] = useState(getDefaultDate);

  // ── Mode / tab ──
  const [mode, setModeRaw] = useState<Mode>(() => (getPref('keva-tab', 'games') as Mode) || 'games');
  const setMode = useCallback((m: Mode) => { setModeRaw(m); setPref('keva-tab', m); }, []);

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

  // ── Game data ──
  const isVbDay = checkVbDay(dateStr);
  const myIds = mode === 'myteam' && myTeamIdSet.size > 0 ? myTeamIdSet : null;
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
  } = useOpenPlay(dateStr);

  // ── Season data ──
  const {
    allSeasonGames,
    loading: seasonLoading,
    error: seasonError,
    source: seasonSource,
    fetchedAt: seasonFetchedAt,
    reload: reloadSeason,
  } = useSeasonData(myTeams.length > 0);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    const startedAt = Date.now();
    setRefreshing(true);

    try {
      const jobs: Promise<unknown>[] = [reloadTeams()];
      if (mode === 'games' || mode === 'myteam') jobs.push(refetch());
      if (mode === 'openplay') jobs.push(reloadOpenPlay());
      if (mode === 'season' && myTeams.length > 0) jobs.push(reloadSeason());
      await Promise.allSettled(jobs);
    } finally {
      const minVisibleMs = 650;
      const remainingMs = Math.max(0, minVisibleMs - (Date.now() - startedAt));
      window.setTimeout(() => setRefreshing(false), remainingMs);
    }
  }, [mode, myTeams.length, refetch, refreshing, reloadOpenPlay, reloadSeason, reloadTeams]);

  // ── Calendar dots ──
  const getDots = useCalendarDots(calYear, calMonth, weekStart, mode, opDates, teamColorMap, theme, allSeasonGames, myTeamIdSet);

  // ── Notifications ──
  const notif = useNotifications(myTeams);
  const rosters = useTeamRosters(teamData?.teams.map((team) => team.id) || []);

  // ── Derived ──
  const myGamesToday = gameState.status === 'ok'
    ? gameState.grid.rows.reduce((n, r) => n + r.cells.filter((c) => c.myGame).length, 0)
    : 0;

  type BannerState = { kind: 'live' | 'cached' | 'unavailable'; fetchedAt?: string };

  const combineBanners = (items: Array<BannerState | null>): BannerState | null => {
    const active = items.filter(Boolean) as BannerState[];
    if (!active.length) return null;
    if (active.some((item) => item.kind === 'unavailable')) return { kind: 'unavailable' };
    const stamps = active
      .map((item) => item.fetchedAt)
      .filter(Boolean)
      .sort();
    return {
      kind: active.some((item) => item.kind === 'cached') ? 'cached' : 'live',
      fetchedAt: stamps[stamps.length - 1],
    };
  };

  const teamBannerState: BannerState | null = teamData
    ? { kind: teamSource === 'cached' ? 'cached' : 'live', fetchedAt: teamFetchedAt }
    : teamError
      ? { kind: 'unavailable' }
      : null;

  const gameBannerState: BannerState | null = gameState.status === 'ok'
    ? { kind: gameState.source === 'cached' ? 'cached' : 'live', fetchedAt: gameState.fetchedAt }
    : gameState.status === 'error'
      ? { kind: 'unavailable' }
      : null;

  const openPlayBannerState: BannerState | null = opSessions
    ? { kind: opSource === 'cached' ? 'cached' : 'live', fetchedAt: opFetchedAt }
    : opError
      ? { kind: 'unavailable' }
      : null;

  const seasonBannerState: BannerState | null = allSeasonGames
    ? { kind: seasonSource === 'cached' ? 'cached' : 'live', fetchedAt: seasonFetchedAt }
    : seasonError
      ? { kind: 'unavailable' }
      : null;

  const activeBanner = (() => {
    if (mode === 'games') return gameBannerState;
    if (mode === 'openplay') return openPlayBannerState;
    if (mode === 'myteam') return myTeamObjs.length > 0 ? combineBanners([teamBannerState, gameBannerState]) : teamBannerState;
    if (mode === 'season') return myTeamObjs.length > 0 ? combineBanners([teamBannerState, seasonBannerState]) : teamBannerState;
    if (mode === 'notifications') return myTeams.length > 0 ? teamBannerState : null;
    return null;
  })();

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
  const renderTeamBanner = (showEditBtn: boolean) => (
    <div className="team-banner">
      <div className="tb-info">
        {myTeamObjs.map((t) => {
          const ci = teamColorMap.get(t.id);
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

  const navigateToMyTeam = (d: string) => { setDateStr(d); setMode('myteam'); };

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
      {activeBanner && <SourceBanner kind={activeBanner.kind} fetchedAt={activeBanner.fetchedAt} />}

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
            />
          </div>
          <DayNav dateStr={dateStr} onDateChange={setDateStr} />

          <div className="wide-sidebar-extra">
            {(mode === 'games' || (mode === 'myteam' && showOpen)) && gameState.status === 'ok' && (
              <Summary openTotal={gameState.grid.openTotal} hasCourts={gameState.courts.length > 0} isVbDay={isVbDay} />
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
                    setDateStr(getDefaultDate());
                    setMode('games');
                  }}
                  onOpenAlerts={() => setMode('notifications')}
                />
              )}
              {gameState.status === 'loading' && <Loading />}
              {gameState.status === 'ok' && (
                <>
                  <Summary openTotal={gameState.grid.openTotal} hasCourts={gameState.courts.length > 0} isVbDay={isVbDay} />
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
                      />
                      <Callouts grid={gameState.grid} courts={gameState.courts} vbStart={gameState.vbStart} />
                      {gameState.missing.length > 0 && !gameState.ct3bb && (
                        <div className="bb-note">
                          {gameState.missing.join(', ')} not scheduled for volleyball tonight
                        </div>
                      )}
                      {gameState.ct3bb && gameState.missing.filter((c) => c !== 'Court 3').length > 0 && (
                        <div className="bb-note">
                          {gameState.missing.filter((c) => c !== 'Court 3').join(', ')} not scheduled for volleyball tonight
                        </div>
                      )}
                      {gameState.ct3bb && <div className="bb-note">Court 3 is basketball on Sundays</div>}
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
                            const hasOpen = gameState.grid.openTotal > 0;
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
                          />
                          {showOpen && (
                            <Callouts grid={gameState.grid} courts={gameState.courts} vbStart={gameState.vbStart} />
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
                      />
                      <StandingsView
                        allGames={allSeasonGames}
                        teamMap={teamData?.teamMap || {}}
                        myTeamObjs={myTeamObjs}
                        myTeamIds={myTeamIdSet}
                        rosters={rosters}
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

          {/* Notifications tab */}
          {mode === 'notifications' && (
            <Suspense fallback={<Loading />}>
              <NotificationsTab
                prefs={notif.prefs}
                setPrefs={notif.setPrefs}
                permission={notif.permission}
                requestPermission={notif.requestPermission}
                supported={notif.supported}
                hasTeams={myTeams.length > 0}
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
