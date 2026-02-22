'use client';

type DraftHeaderBarProps = {
  playersDrafted: number;
  totalSlots: number;
  playersRemaining: number;
  currentInflationPct: number;
  leagueMaxBid: number;
  draftPhase: 'MAIN' | 'TAXI';
};

export function DraftHeaderBar({
  playersDrafted,
  totalSlots,
  playersRemaining,
  currentInflationPct,
  leagueMaxBid,
  draftPhase,
}: DraftHeaderBarProps) {
  const inflationText =
    currentInflationPct > 0
      ? `+${currentInflationPct.toFixed(1)}%`
      : currentInflationPct < 0
        ? `${currentInflationPct.toFixed(1)}%`
        : '0%';

  return (
    <header className="flex flex-wrap items-center gap-4 py-2 px-3 bg-app-panel border-b border-app-border text-text-primary text-sm">
      <span className="text-text-secondary">
        {draftPhase === 'TAXI' ? 'Taxi Picks:' : 'Players Drafted:'}{' '}
        <span className="font-medium text-text-primary">
          {playersDrafted} / {totalSlots}
        </span>
      </span>
      <span className="text-text-secondary">
        Players Remaining:{' '}
        <span className="font-medium text-text-primary">{playersRemaining}</span>
      </span>
      {draftPhase === 'MAIN' ? (
        <>
          <span className="text-text-secondary">
            Current Inflation:{' '}
            <span
              className={
                currentInflationPct > 0
                  ? 'text-budget-caution'
                  : currentInflationPct < 0
                    ? 'text-budget-safe'
                    : 'text-text-primary'
              }
            >
              {inflationText}
            </span>
          </span>
          <span className="text-text-secondary">
            League Max Bid:{' '}
            <span className="font-medium text-budget-safe">${leagueMaxBid}</span>
          </span>
        </>
      ) : (
        <span className="text-budget-critical font-medium">Taxi Round Active · Free bench picks</span>
      )}
    </header>
  );
}
