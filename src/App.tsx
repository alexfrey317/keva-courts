import { useState, useCallback } from 'react';
import type { Mode, Theme } from './types';
import { getDefaultDate, isVbDay as checkVbDay, isToday } from './utils/dates';
import { computeRecord } from './utils/courts';
import { getPref, setPref, applyTheme, getTeamColor } from './utils/theme';

import { useTeams } from './hooks/useTeams';
import { useGameData } from './hooks/useGameData';
import { useOpenPlay } from './hooks/useOpenPlay';
import { useSeasonData } from './hooks/useSeasonData';
import { useCalendarDots } from './hooks/useCalendarDots';
import { usePullToRefresh } from './hooks/usePullToRefresh';

import { Header } from './components/Layout/Header';
import { ModeToggle } from './components/Layout/ModeToggle';
import { Calendar } from './components/Calendar/Calendar';
import { DayNav } from './components/Calendar/DayNav';
import { Summary } from './components/GameGrid/Summary';
import { ScheduleGrid } from './components/GameGrid/ScheduleGrid';
import { Callouts } from './components/GameGrid/Callouts';
import { OpenPlayView } from './components/OpenPlay/OpenPlayView';
import { SeasonSchedule } from './components/Season/SeasonSchedule';
import { StandingsView } from './components/Season/StandingsView';
import { TeamPicker } from './components/TeamPicker/TeamPicker';
import { CourtMapModal } from './components/CourtMap/CourtMapModal';
import { NextGameCard } from './components/Common/NextGameCard';
import { Loading } from './components/Common/Loading';

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

  const share = () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };

  // ── Teams ──
  const {
    teamData, teamLoading, showPicker, setShowPicker,
    myTeams, saveTeams, myTeamObjs, myTeamIdSet, teamColorMap, myTeamDateMap,
  } = useTeams();

  // ── Game data ──
  const isVbDay = checkVbDay(dateStr);
  const myIds = mode === 'myteam' && myTeamIdSet.size > 0 ? myTeamIdSet : null;
  const { gameState, refetch } = useGameData(dateStr, myIds);

  // ── Open play ──
  const { sessions: opSessions, loading: opLoading, opDates, todaySessions: todayOp } = useOpenPlay(dateStr);

  // ── Season data ──
  const allSeasonGames = useSeasonData(myTeams.length > 0);

  // ── Calendar dots ──
  const getDots = useCalendarDots(calYear, calMonth, weekStart, mode, opDates, myTeamDateMap, teamColorMap, theme);

  // ── Pull to refresh ──
  const pulling = usePullToRefresh(refetch);

  // ── Derived ──
  const myGamesToday = gameState.status === 'ok'
    ? gameState.grid.rows.reduce((n, r) => n + r.cells.filter((c) => c.myGame).length, 0)
    : 0;

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
              <span className="tb-name" style={cc ? { color: cc.t } : {}}>{t.name}</span>{' '}
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
      {pulling && <div className="ptr-indicator">Release to refresh...</div>}

      <header>
        <Header
          theme={theme}
          onToggleTheme={toggleTheme}
          onShowMap={() => setShowMap(true)}
          onShare={share}
          copied={copied}
        />
        {showMap && <CourtMapModal onClose={() => setShowMap(false)} />}
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
                    Live data &middot; updated {gameState.updatedAt}
                    {isToday(dateStr) && ' \u00b7 auto-refresh 3m'}
                  </div>
                </>
              )}
              {gameState.status === 'error' && (
                <div className="summary not-scheduled">
                  <span className="count">Temporarily unavailable</span>
                  <span className="label">
                    KEVA's scheduling servers (DaySmart) appear to be down. This usually resolves on its own — try again in a few minutes.
                  </span>
                </div>
              )}
            </>
          )}

          {/* Open Play tab */}
          {mode === 'openplay' && (
            <>
              {opLoading && <Loading />}
              {opSessions && <OpenPlayView sessions={todayOp} allSessions={opSessions} />}
              {opSessions && (
                <div className="status">Live data &middot; {opSessions.length} sessions loaded</div>
              )}
            </>
          )}

          {/* My Team(s) tab */}
          {mode === 'myteam' && (
            <>
              {!myTeamObjs.length && (
                <div className="select-prompt">
                  <p>Pick your teams to see your game schedule highlighted on the court grid</p>
                  <button
                    className="select-btn"
                    onClick={() => setShowPicker(true)}
                    disabled={teamLoading}
                  >
                    {teamLoading ? 'Loading teams...' : 'Select Your Teams'}
                  </button>
                </div>
              )}
              {myTeamObjs.length > 0 && (
                <>
                  {renderTeamBanner(true)}
                  <NextGameCard
                    myTeamDateMap={myTeamDateMap}
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
                          />
                          {showOpen && (
                            <Callouts grid={gameState.grid} courts={gameState.courts} vbStart={gameState.vbStart} />
                          )}
                        </>
                      ) : (
                        <div className="summary no-games">Your team doesn't play this day</div>
                      )}
                      <div className="status">
                        Live data &middot; updated {gameState.updatedAt}
                        {isToday(dateStr) && ' \u00b7 auto-refresh 3m'}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* Season tab */}
          {mode === 'season' && (
            <>
              {!myTeamObjs.length && (
                <div className="select-prompt">
                  <p>Pick your teams to see season schedule and standings</p>
                  <button
                    className="select-btn"
                    onClick={() => setShowPicker(true)}
                    disabled={teamLoading}
                  >
                    {teamLoading ? 'Loading teams...' : 'Select Your Teams'}
                  </button>
                </div>
              )}
              {myTeamObjs.length > 0 && (
                <>
                  {renderTeamBanner(true)}
                  {allSeasonGames ? (
                    <>
                      <SeasonSchedule
                        allGames={allSeasonGames}
                        myTeamIds={myTeamIdSet}
                        teamMap={teamData?.teamMap || {}}
                        teamColorMap={teamColorMap}
                        theme={theme}
                        onDateChange={navigateToMyTeam}
                      />
                      <StandingsView
                        allGames={allSeasonGames}
                        teamMap={teamData?.teamMap || {}}
                        myTeamObjs={myTeamObjs}
                        myTeamIds={myTeamIdSet}
                      />
                    </>
                  ) : (
                    <Loading />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {showPicker && teamData && (
        <TeamPicker
          leagues={teamData.leagues}
          teams={teamData.teams}
          selectedIds={myTeams}
          onDone={saveTeams}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
