'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toast } from '@/components/Toast';
import {
  clearLeaguePlayerPool,
  createLeague,
  getLeague,
  seedPlayers,
  type CreateLeagueBody,
  type League,
} from '@/api/leagues';
import { getTeams, createTeam, updateTeam, deleteTeam, type Team, type CreateTeamBody } from '@/api/teams';
import { getPlayers, importPlayers, type Player, type ImportPlayerBody } from '@/api/players';
import {
  submitKeeper,
  getDraftHistory,
  undoLastPick,
  finalizeKeepers,
  reopenKeepers,
  type DraftHistoryEntry,
} from '@/api/draft';

const ROSTER_SLOT_KEYS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL', 'P'] as const;
const DEFAULT_ROSTER: Record<string, number> = {
  C: 2, '1B': 1, '2B': 1, '3B': 1, SS: 1, OF: 5, UTIL: 1, P: 9,
};
const DEFAULT_BENCH_SLOTS = 6;
const SCORING_OPTIONS = ['HR', 'RBI', 'SB', 'AVG', 'R', 'W', 'SV', 'K', 'ERA', 'WHIP'];
const MOCK_POOL_TARGET_LABEL = '100+';
const IMPORT_HELP_TEXT = 'Accepted formats: .csv, .tsv, .txt (Excel/Google Sheets export)';

const COLUMN_ALIASES = {
  name: ['name', 'player', 'playername', 'fullname'],
  mlbTeam: ['team', 'mlbteam', 'club', 'teamcode'],
  eligiblePositions: ['position', 'positions', 'pos', 'eligiblepositions', 'rosterposition'],
  projectedValue: ['projectedvalue', 'projvalue', 'proj', 'value', 'auctionvalue', 'dollarvalue'],
  adp: ['adp', 'avgdraftposition', 'draftposition'],
} as const;

const POSITION_ALIAS: Record<string, string> = {
  SP: 'P',
  RP: 'P',
  LF: 'OF',
  CF: 'OF',
  RF: 'OF',
  DH: 'UTIL',
};

function normalizeHeaderKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseNumberish(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const cleaned = String(value).replace(/[$,%]/g, '').trim();
  if (!cleaned) return undefined;
  const numericValue = Number(cleaned);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function parsePositions(raw: unknown): string[] {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[\s,;/|]+/)
      : [];
  const normalized = values
    .map((value) => String(value).trim().toUpperCase())
    .filter(Boolean)
    .map((value) => POSITION_ALIAS[value] || value);
  if (normalized.length === 0) return ['UTIL'];
  return Array.from(new Set(normalized));
}

function detectDelimiter(input: string): string {
  const firstLine = input.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', '\t', ';', '|'];
  let bestDelimiter = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
      bestDelimiter = candidate;
    }
  }
  return bestDelimiter;
}

function parseDelimitedText(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  const pushCell = () => {
    currentRow.push(currentValue.trim());
    currentValue = '';
  };

  const pushRow = () => {
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
    currentRow = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = index + 1 < input.length ? input[index + 1] : '';

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === delimiter) {
      pushCell();
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      pushCell();
      pushRow();
      continue;
    }

    currentValue += char;
  }

  pushCell();
  pushRow();
  return rows;
}

function resolveFieldValue(record: Record<string, unknown>, aliases: readonly string[]) {
  for (const alias of aliases) {
    if (record[alias] != null && record[alias] !== '') {
      return record[alias];
    }
  }
  return undefined;
}

function normalizePlayerRecord(record: Record<string, unknown>): ImportPlayerBody | null {
  const name = String(resolveFieldValue(record, COLUMN_ALIASES.name) ?? '').trim();
  if (!name) return null;

  const mlbTeam = String(resolveFieldValue(record, COLUMN_ALIASES.mlbTeam) ?? '').trim().toUpperCase();
  const eligiblePositions = parsePositions(resolveFieldValue(record, COLUMN_ALIASES.eligiblePositions));
  const projectedValue = parseNumberish(resolveFieldValue(record, COLUMN_ALIASES.projectedValue));
  const adp = parseNumberish(resolveFieldValue(record, COLUMN_ALIASES.adp));

  const ignored = new Set(
    Object.values(COLUMN_ALIASES).flat().map((value) => normalizeHeaderKey(value))
  );

  const projections = Object.fromEntries(
    Object.entries(record)
      .filter(([key, value]) => {
        if (!key || ignored.has(key)) return false;
        return value != null && value !== '';
      })
      .map(([key, value]) => {
        const numericValue = parseNumberish(value);
        return [key.toUpperCase(), numericValue != null ? numericValue : String(value).trim()];
      })
  );

  return {
    name,
    mlbTeam,
    eligiblePositions,
    projectedValue,
    adp,
    projections,
  };
}

function rowsToNormalizedRecords(rows: Array<Record<string, unknown>>): ImportPlayerBody[] {
  return rows
    .map((row) => {
      const normalizedRow = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [normalizeHeaderKey(key), value])
      );
      return normalizePlayerRecord(normalizedRow);
    })
    .filter((row): row is ImportPlayerBody => Boolean(row));
}

async function parsePlayerUploadFile(file: File): Promise<ImportPlayerBody[]> {
  const isTextTable =
    file.type.includes('csv') ||
    file.type.includes('text/plain') ||
    file.name.toLowerCase().endsWith('.csv') ||
    file.name.toLowerCase().endsWith('.tsv') ||
    file.name.toLowerCase().endsWith('.txt');

  if (!isTextTable) {
    throw new Error('Unsupported file type. Export your spreadsheet as CSV/TSV, then upload.');
  }

  const rawText = await file.text();
  if (!rawText.trim()) {
    throw new Error('The uploaded file is empty.');
  }

  const delimiter = file.name.toLowerCase().endsWith('.tsv') ? '\t' : detectDelimiter(rawText);
  const rows = parseDelimitedText(rawText, delimiter);
  if (rows.length < 2) {
    throw new Error('File must include a header row and at least one player row.');
  }

  const headers = rows[0].map((header) => normalizeHeaderKey(String(header || '')));
  const records = rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
  return rowsToNormalizedRecords(records);
}

function downloadPlayerTemplate() {
  const headers = ['name', 'team', 'positions', 'projectedValue', 'adp', 'HR', 'RBI', 'SB', 'AVG', 'W', 'SV', 'K', 'ERA', 'WHIP'];
  const examples = [
    ['Shohei Ohtani', 'LAD', 'P,UTIL', '52', '1', '42', '100', '18', '.298', '13', '3', '176', '3.10', '1.03'],
    ['Corbin Burnes', 'BAL', 'P', '28', '12', '', '', '', '', '15', '0', '217', '3.15', '1.07'],
    ['Julio Rodriguez', 'SEA', 'OF', '34', '17', '31', '96', '29', '.279', '', '', '', '', ''],
  ];
  const lines = [headers, ...examples]
    .map((row) =>
      row.map((value) => {
        const cell = String(value ?? '');
        if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
        return cell;
      }).join(',')
    )
    .join('\n');
  const blob = new Blob([lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'player-import-template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

export default function ConfigPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leagueId = searchParams.get('leagueId');
  const stepParam = searchParams.get('step');

  const [toast, setToast] = useState<string | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [playerPoolCount, setPlayerPoolCount] = useState(0);
  const [playerPreview, setPlayerPreview] = useState<Player[]>([]);
  const [draftHistory, setDraftHistory] = useState<DraftHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStep1 = !leagueId;
  const isStep2 = !!leagueId && stepParam !== 'keepers';
  const isStep3 = !!leagueId && stepParam === 'keepers';

  const fetchLeague = useCallback(async (id: string) => {
    try {
      const { data } = await getLeague(id);
      setLeague(data);
      return data;
    } catch {
      setError('Failed to load league');
      return null;
    }
  }, []);

  const fetchTeams = useCallback(async (id: string) => {
    try {
      const { data } = await getTeams(id);
      setTeams(Array.isArray(data) ? data : []);
    } catch {
      setError('Failed to load teams');
    }
  }, []);

  const fetchDraftHistory = useCallback(async (id: string) => {
    try {
      const { data } = await getDraftHistory(id);
      setDraftHistory(Array.isArray(data) ? data : []);
    } catch {
      setDraftHistory([]);
    }
  }, []);

  const fetchPlayerPoolStatus = useCallback(async (id: string) => {
    try {
      const { data } = await getPlayers(id, { limit: 2000 });
      const players = Array.isArray(data) ? data : [];
      setPlayerPoolCount(players.length);
      setPlayerPreview(players.slice(0, 6));
    } catch {
      setPlayerPoolCount(0);
      setPlayerPreview([]);
    }
  }, []);

  useEffect(() => {
    if (!leagueId) return;
    fetchLeague(leagueId);
  }, [leagueId, fetchLeague]);

  useEffect(() => {
    if (!leagueId) return;
    fetchTeams(leagueId);
  }, [leagueId, fetchTeams]);

  useEffect(() => {
    if (!leagueId || !isStep3) return;
    fetchDraftHistory(leagueId);
  }, [leagueId, isStep3, fetchDraftHistory]);

  useEffect(() => {
    if (!leagueId || !isStep2) return;
    fetchPlayerPoolStatus(leagueId);
  }, [leagueId, isStep2, fetchPlayerPoolStatus]);

  return (
    <div className="min-h-screen bg-app-dark text-text-primary p-6">
      <div className={`${isStep2 ? 'max-w-6xl' : 'max-w-2xl'} mx-auto`}>
        <Link href="/dashboard" className="text-primary hover:underline mb-4 inline-block">
          ← Back to Dashboard
        </Link>

        {isStep1 && (
          <Step1LeagueBasics
            onCreated={(id) => router.push(`/config?leagueId=${id}`)}
            setError={setError}
            setLoading={setLoading}
            setToast={setToast}
            loading={loading}
            error={error}
          />
        )}

        {isStep2 && leagueId && (
          <Step2TeamManager
            leagueId={leagueId}
            league={league}
            teams={teams}
            playerPoolCount={playerPoolCount}
            playerPreview={playerPreview}
            onRefreshTeams={() => fetchTeams(leagueId)}
            onMarkMyTeam={async (teamId) => {
              setLoading(true);
              setError(null);
              try {
                for (const t of teams) {
                  await updateTeam(t._id, { isMyTeam: t._id === teamId });
                }
                await fetchTeams(leagueId);
                setToast('Team marked as yours.');
              } catch {
                setError('Failed to update team');
              } finally {
                setLoading(false);
              }
            }}
            onSeedPlayers={async () => {
              setLoading(true);
              setError(null);
              try {
                await seedPlayers(leagueId);
                await Promise.all([fetchTeams(leagueId), fetchPlayerPoolStatus(leagueId)]);
                setToast(`Seeded sample players (${MOCK_POOL_TARGET_LABEL}).`);
              } catch {
                setError('League already has players');
              } finally {
                setLoading(false);
              }
            }}
            onClearPlayerPool={async () => {
              const confirmed = window.confirm('Clear all undrafted players from this league player pool?');
              if (!confirmed) return;
              setLoading(true);
              setError(null);
              try {
                const { data } = await clearLeaguePlayerPool(leagueId);
                await Promise.all([fetchTeams(leagueId), fetchPlayerPoolStatus(leagueId)]);
                setToast(`${data.message}. Removed ${data.deleted} players.`);
              } catch {
                setError('Unable to clear player pool after draft or keeper activity.');
              } finally {
                setLoading(false);
              }
            }}
            onImportPlayers={async (players) => {
              setLoading(true);
              setError(null);
              try {
                const { data } = await importPlayers(leagueId, players);
                await Promise.all([fetchTeams(leagueId), fetchPlayerPoolStatus(leagueId)]);
                setToast(
                  `${data.message} ${data.skippedCount > 0 ? `Skipped ${data.skippedCount} duplicate/invalid row(s).` : ''}`
                );
              } catch {
                setError('Failed to import players. Confirm CSV columns and try again.');
              } finally {
                setLoading(false);
              }
            }}
            onDeleteTeam={async (teamId) => {
              const confirmed = window.confirm('Delete this team? This only works before any players are assigned.');
              if (!confirmed) return;
              setLoading(true);
              setError(null);
              try {
                await deleteTeam(teamId);
                await fetchTeams(leagueId);
                setToast('Team deleted.');
              } catch {
                setError('Failed to delete team');
              } finally {
                setLoading(false);
              }
            }}
            loading={loading}
            error={error}
          />
        )}

        {isStep3 && leagueId && (
          <Step3KeeperEntry
            leagueId={leagueId}
            league={league}
            teams={teams}
            draftHistory={draftHistory}
            onRefreshDraftHistory={() => fetchDraftHistory(leagueId)}
            onRefreshTeams={() => fetchTeams(leagueId)}
            setToast={setToast}
            setError={setError}
            setLoading={setLoading}
            onUndoLastKeeper={async () => {
              setLoading(true);
              setError(null);
              try {
                await undoLastPick(leagueId);
                await Promise.all([fetchDraftHistory(leagueId), fetchTeams(leagueId)]);
                setToast('Last keeper undone.');
              } catch {
                setError('Failed to undo last keeper');
              } finally {
                setLoading(false);
              }
            }}
            onFinalizeKeepers={async () => {
              const confirmed = window.confirm('Finalize keeper period? Keeper edits will be locked until reopened.');
              if (!confirmed) return;
              setLoading(true);
              setError(null);
              try {
                const { data } = await finalizeKeepers(leagueId);
                setToast(
                  `${data.message}. ${data.summary.totalKeepers} keepers, $${data.summary.totalKeeperSpend} total value.`
                );
                await Promise.all([
                  fetchLeague(leagueId),
                  fetchTeams(leagueId),
                  fetchDraftHistory(leagueId),
                ]);
              } catch {
                setError('Failed to finalize keeper period');
              } finally {
                setLoading(false);
              }
            }}
            onReopenKeepers={async () => {
              const confirmed = window.confirm('Reopen keeper period for edits?');
              if (!confirmed) return;
              setLoading(true);
              setError(null);
              try {
                const { data } = await reopenKeepers(leagueId);
                setToast(data.message);
                await Promise.all([
                  fetchLeague(leagueId),
                  fetchTeams(leagueId),
                  fetchDraftHistory(leagueId),
                ]);
              } catch {
                setError('Failed to reopen keeper period');
              } finally {
                setLoading(false);
              }
            }}
          />
        )}
      </div>
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function Step1LeagueBasics({
  onCreated,
  setError,
  setLoading,
  setToast,
  loading,
  error,
}: {
  onCreated: (leagueId: string) => void;
  setError: (e: string | null) => void;
  setLoading: (v: boolean) => void;
  setToast: (t: string | null) => void;
  loading: boolean;
  error: string | null;
}) {
  const [name, setName] = useState('');
  const [totalBudget, setTotalBudget] = useState(260);
  const [benchSlots, setBenchSlots] = useState(DEFAULT_BENCH_SLOTS);
  const [rosterSlots, setRosterSlots] = useState<Record<string, number>>(() => ({ ...DEFAULT_ROSTER }));
  const [scoringCategories, setScoringCategories] = useState<string[]>(() => [...SCORING_OPTIONS]);

  const toggleScoring = (cat: string) => {
    setScoringCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('League name is required');
      return;
    }
    if (scoringCategories.length < 4) {
      setError('Please select at least 4 scoring categories.');
      return;
    }
    setLoading(true);
    try {
      const body: CreateLeagueBody = {
        name: name.trim(),
        totalBudget,
        benchSlots,
        rosterSlots,
        scoringCategories,
      };
      const { data } = await createLeague(body);
      setToast('League created.');
      const id = (data as { id?: string }).id ?? (data as { _id?: string })._id;
      if (id) onCreated(id);
    } catch {
      setError('Failed to create league');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold mb-6">League basics</h1>
      {error && (
        <p className="text-budget-critical mb-4" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-1">League Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg bg-app-panel border border-app-border px-3 py-2 text-text-primary"
            placeholder="My League"
          />
        </div>
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-1">Total Budget</label>
          <input
            type="number"
            min={1}
            value={totalBudget}
            onChange={(e) => setTotalBudget(Number(e.target.value) || 260)}
            className="w-full rounded-lg bg-app-panel border border-app-border px-3 py-2 text-text-primary"
          />
        </div>
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-1">Bench Slots (Taxi Round)</label>
          <input
            type="number"
            min={0}
            value={benchSlots}
            onChange={(e) => setBenchSlots(Math.max(0, Number(e.target.value) || 0))}
            className="w-full rounded-lg bg-app-panel border border-app-border px-3 py-2 text-text-primary"
          />
        </div>
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-2">Roster slots</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {ROSTER_SLOT_KEYS.map((key) => (
              <div key={key}>
                <label className="block text-text-secondary text-xs mb-0.5">{key}</label>
                <input
                  type="number"
                  min={0}
                  value={rosterSlots[key] ?? 0}
                  onChange={(e) =>
                    setRosterSlots((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))
                  }
                  className="w-full rounded bg-app-panel border border-app-border px-2 py-1 text-text-primary text-sm"
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-text-secondary text-sm font-medium mb-2">Scoring categories</label>
          <div className="flex flex-wrap gap-3">
            {SCORING_OPTIONS.map((cat) => (
              <label key={cat} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scoringCategories.includes(cat)}
                  onChange={() => toggleScoring(cat)}
                  className="rounded border-app-border text-primary"
                />
                <span className="text-text-primary">{cat}</span>
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary hover:bg-primary-hover text-white font-medium py-2 px-4 disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create league'}
        </button>
      </form>
    </>
  );
}

function Step2TeamManager({
  leagueId,
  league,
  teams,
  playerPoolCount,
  playerPreview,
  onRefreshTeams,
  onMarkMyTeam,
  onSeedPlayers,
  onClearPlayerPool,
  onImportPlayers,
  onDeleteTeam,
  loading,
  error,
}: {
  leagueId: string;
  league: League | null;
  teams: Team[];
  playerPoolCount: number;
  playerPreview: Player[];
  onRefreshTeams: () => void;
  onMarkMyTeam: (teamId: string) => void;
  onSeedPlayers: () => void;
  onClearPlayerPool: () => Promise<void>;
  onImportPlayers: (players: ImportPlayerBody[]) => Promise<void>;
  onDeleteTeam: (teamId: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}) {
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [startingBudget, setStartingBudget] = useState(league?.totalBudget ?? 260);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploadedFile, setLastUploadedFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setStartingBudget(league?.totalBudget ?? 260);
  }, [league?.totalBudget]);

  const totalRosterSlotsPerTeam = useMemo(
    () => {
      const rosterSlots = (league?.rosterSlots ?? {}) as Record<string, unknown>;
      return ROSTER_SLOT_KEYS.reduce((sum, position) => {
        const parsed = Number(rosterSlots[position]);
        return sum + (Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
      }, 0);
    },
    [league?.rosterSlots]
  );
  const myTeam = useMemo(() => teams.find((team) => team.isMyTeam), [teams]);
  const teamCountLabel = teams.length === 1 ? '1 team' : `${teams.length} teams`;
  const poolCountLabel = playerPoolCount === 1 ? '1 player' : `${playerPoolCount} players`;

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim() || !teamName.trim()) return;
    setSubmitting(true);
    try {
      const body: CreateTeamBody = {
        leagueId,
        ownerName: ownerName.trim(),
        teamName: teamName.trim(),
        budgetTotal: startingBudget,
      };
      await createTeam(body);
      onRefreshTeams();
      setShowAddTeam(false);
      setOwnerName('');
      setTeamName('');
      setStartingBudget(league?.totalBudget ?? 260);
    } catch {
      // error state could be set by parent
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setLastUploadedFile(file.name);
    try {
      const normalizedPlayers = await parsePlayerUploadFile(file);
      if (normalizedPlayers.length === 0) {
        setUploadError('No valid player rows were found in the uploaded file.');
        return;
      }
      await onImportPlayers(normalizedPlayers);
      setLastUploadedFile(file.name);
    } catch (uploadErr) {
      setUploadError(
        uploadErr instanceof Error
          ? uploadErr.message
          : 'Failed to parse upload. Please check headers and file format.'
      );
    } finally {
      event.target.value = '';
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Team Manager</h1>
        <p className="text-text-secondary">
          Build teams, seed a larger player pool, or import your own spreadsheet export before keeper entry.
        </p>
      </div>
      {error && (
        <p className="text-budget-critical mb-4" role="alert">
          {error}
        </p>
      )}
      {uploadError && (
        <p className="text-budget-critical mb-4" role="alert">
          {uploadError}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-app-border bg-app-panel px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Teams configured</p>
          <p className="text-xl font-semibold">{teamCountLabel}</p>
          <p className="text-xs text-text-secondary">
            {myTeam ? `My team: ${myTeam.teamName}` : 'Mark one team as your own for drafting defaults.'}
          </p>
        </div>
        <div className="rounded-lg border border-app-border bg-app-panel px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Player pool</p>
          <p className="text-xl font-semibold">{poolCountLabel}</p>
          <p className="text-xs text-text-secondary">
            Seed target includes {MOCK_POOL_TARGET_LABEL} players with projections and ADP.
          </p>
        </div>
        <div className="rounded-lg border border-app-border bg-app-panel px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-text-secondary">Roster shape</p>
          <p className="text-xl font-semibold">{totalRosterSlotsPerTeam || 23} slots/team</p>
          <p className="text-xs text-text-secondary">
            Budget baseline: ${league?.totalBudget ?? 260} · Bench: {Math.max(0, Number(league?.benchSlots ?? DEFAULT_BENCH_SLOTS))} slots
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <section className="rounded-xl border border-app-border bg-app-panel/80 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Teams</h2>
            {!showAddTeam && (
              <button
                type="button"
                onClick={() => setShowAddTeam(true)}
                className="rounded-lg border border-app-border bg-app-dark px-4 py-2 text-text-primary hover:bg-app-border"
              >
                Add Team
              </button>
            )}
          </div>

          <div className="space-y-3 mb-4">
            {teams.length === 0 && !loading && (
              <p className="rounded-md border border-app-border bg-app-dark/60 px-3 py-2 text-text-secondary">
                No teams yet. Add at least one team to continue.
              </p>
            )}
            {teams.map((team) => (
              <div
                key={team._id}
                className="rounded-lg border border-app-border bg-app-dark/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="font-medium">{team.teamName}</span>
                  <span className="text-text-secondary ml-2">({team.ownerName})</span>
                  <span className="text-text-secondary ml-2">
                    Budget: {team.budget?.remaining ?? 0} / {team.budget?.total ?? 0}
                  </span>
                  {team.isMyTeam && (
                    <span className="ml-2 text-primary text-sm">(My team)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onMarkMyTeam(team._id)}
                    disabled={loading || team.isMyTeam}
                    className="rounded bg-app-dark border border-app-border px-3 py-1 text-sm hover:bg-app-border disabled:opacity-50"
                  >
                    Mark as My Team
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTeam(team._id)}
                    disabled={loading || (team.roster?.length ?? 0) > 0}
                    className="rounded border border-budget-critical/70 bg-budget-critical/10 px-3 py-1 text-sm text-text-primary hover:bg-budget-critical/20 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showAddTeam && (
            <form onSubmit={handleAddTeam} className="bg-app-dark/70 border border-app-border rounded-lg p-4 space-y-3">
              <h3 className="font-medium">Add Team</h3>
              <div>
                <label className="block text-text-secondary text-sm mb-1">Owner Name</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full rounded bg-app-dark border border-app-border px-3 py-2 text-text-primary"
                />
              </div>
              <div>
                <label className="block text-text-secondary text-sm mb-1">Team Name</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full rounded bg-app-dark border border-app-border px-3 py-2 text-text-primary"
                />
              </div>
              <div>
                <label className="block text-text-secondary text-sm mb-1">Starting Budget</label>
                <input
                  type="number"
                  min={0}
                  value={startingBudget}
                  onChange={(e) => setStartingBudget(Number(e.target.value) || 0)}
                  className="w-full rounded bg-app-dark border border-app-border px-3 py-2 text-text-primary"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-primary hover:bg-primary-hover text-white py-2 px-4 disabled:opacity-50"
                >
                  {submitting ? 'Adding…' : 'Add Team'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTeam(false)}
                  className="rounded-lg border border-app-border px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-app-border bg-app-panel/80 p-4">
            <h2 className="text-lg font-semibold mb-3">Player Pool Setup</h2>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={onSeedPlayers}
                disabled={loading}
                className="rounded-lg border border-app-border bg-app-dark px-4 py-2 text-left hover:bg-app-border disabled:opacity-50"
              >
                {loading ? 'Seeding…' : 'Load sample players'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="rounded-lg border border-app-border bg-app-dark px-4 py-2 text-left hover:bg-app-border disabled:opacity-50"
              >
                Upload player file
              </button>
              <button
                type="button"
                onClick={onClearPlayerPool}
                disabled={loading || playerPoolCount === 0}
                className="rounded-lg border border-budget-critical/70 bg-budget-critical/10 px-4 py-2 text-left font-medium text-budget-critical hover:bg-budget-critical/20 disabled:opacity-50"
              >
                Clear Player Pool
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={handleUpload}
              />
            </div>
            <p className="mt-2 text-xs text-text-secondary">{IMPORT_HELP_TEXT}</p>
            {lastUploadedFile && (
              <p className="mt-1 text-xs text-text-secondary">Last file: {lastUploadedFile}</p>
            )}
            <button
              type="button"
              onClick={downloadPlayerTemplate}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Download CSV template
            </button>
          </section>

          <section className="rounded-xl border border-app-border bg-app-panel/80 p-4">
            <h3 className="font-semibold mb-2">Top Player Preview</h3>
            {playerPreview.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Load sample players or upload a player file to preview your pool here.
              </p>
            ) : (
              <ul className="space-y-2">
                {playerPreview.map((player) => (
                  <li key={player._id} className="flex items-center justify-between text-sm">
                    <span className="truncate pr-3">
                      {player.name} <span className="text-text-secondary">({(player.eligiblePositions || []).join(', ')})</span>
                    </span>
                    <span className="text-text-secondary">${player.projectedValue ?? '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-primary/60 bg-primary/10 p-4">
            <h3 className="font-semibold mb-1">Next Step</h3>
            <p className="text-sm text-text-secondary mb-3">
              After teams and players are ready, move to keeper entry.
            </p>
            <Link
              href={`/config?leagueId=${leagueId}&step=keepers`}
              className="block rounded-lg bg-primary hover:bg-primary-hover text-white font-medium py-2 px-4 text-center"
            >
              Continue to Keeper Entry
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}

function Step3KeeperEntry({
  leagueId,
  league,
  teams,
  draftHistory,
  onRefreshDraftHistory,
  onRefreshTeams,
  setToast,
  setError,
  setLoading,
  onUndoLastKeeper,
  onFinalizeKeepers,
  onReopenKeepers,
}: {
  leagueId: string;
  league: League | null;
  teams: Team[];
  draftHistory: DraftHistoryEntry[];
  onRefreshDraftHistory: () => void;
  onRefreshTeams: () => void;
  setToast: (t: string | null) => void;
  setError: (e: string | null) => void;
  setLoading: (v: boolean) => void;
  onUndoLastKeeper: () => Promise<void>;
  onFinalizeKeepers: () => Promise<void>;
  onReopenKeepers: () => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [playerResults, setPlayerResults] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [teamId, setTeamId] = useState('');
  const [keeperPrice, setKeeperPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setPlayerResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    getPlayers(leagueId, { q: debouncedQuery, drafted: false })
      .then(({ data }) => {
        if (!cancelled) setPlayerResults(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setPlayerResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, debouncedQuery]);

  const keepers = useMemo(
    () => draftHistory.filter((p) => p.phase === 'KEEPER'),
    [draftHistory]
  );
  const visiblePlayerResults = useMemo(() => {
    if (!selectedPlayer?._id) return playerResults;
    return playerResults.filter((player) => player._id !== selectedPlayer._id);
  }, [playerResults, selectedPlayer?._id]);
  const normalizedSelectedName = (selectedPlayer?.name ?? '').trim().toLowerCase();
  const normalizedDebouncedQuery = debouncedQuery.trim().toLowerCase();
  const shouldShowSearchDropdown = Boolean(normalizedDebouncedQuery) && !searchLoading && (
    normalizedSelectedName !== normalizedDebouncedQuery || visiblePlayerResults.length > 0
  );
  const totalKeeperSpend = useMemo(
    () => keepers.reduce((sum, keeper) => sum + (keeper.amount ?? 0), 0),
    [keepers]
  );
  const keeperFinalized = Boolean((league as { keeperFinalized?: boolean } | null)?.keeperFinalized);

  const handleAddKeeper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayer || !teamId || keeperPrice === '') {
      setError('Select a player, team, and enter keeper cost.');
      return;
    }
    const price = Number(keeperPrice);
    if (Number.isNaN(price) || price < 0) {
      setError('Invalid keeper cost.');
      return;
    }
    setError(null);
    setSubmitting(true);
    setLoading(true);
    try {
      await submitKeeper(selectedPlayer._id, teamId, price);
      setToast('Keeper added.');
      onRefreshDraftHistory();
      onRefreshTeams();
      setSelectedPlayer(null);
      setSearchQuery('');
      setTeamId('');
      setKeeperPrice('');
    } catch {
      setError('Failed to add keeper');
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Keeper Entry</h1>
      {keeperFinalized ? (
        <p className="mb-4 rounded-md border border-budget-safe/80 bg-budget-safe/10 px-3 py-2 text-sm">
          Keeper period cannot be reopened after main draft picks have been logged.
        </p>
      ) : (
        <p className="mb-4 text-text-secondary text-sm">
          Enter keeper picks before starting the main draft. You can undo the latest keeper until finalized.
        </p>
      )}

      <div className="mb-6">
        <label className="block text-text-secondary text-sm font-medium mb-1">Search players</label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            const value = e.target.value;
            setSearchQuery(value);
            if (
              selectedPlayer &&
              value.trim().toLowerCase() !== (selectedPlayer.name ?? '').trim().toLowerCase()
            ) {
              setSelectedPlayer(null);
            }
          }}
          placeholder="Type to search…"
          className="w-full rounded-lg bg-app-panel border border-app-border px-3 py-2 text-text-primary"
          disabled={keeperFinalized}
        />
        {searchLoading && <p className="text-text-secondary text-sm mt-1">Searching…</p>}
        {shouldShowSearchDropdown && (
          <ul className="mt-1 border border-app-border rounded-lg bg-app-panel max-h-48 overflow-auto">
            {visiblePlayerResults.length === 0 ? (
              <li className="px-3 py-2 text-text-secondary">No players found</li>
            ) : (
              visiblePlayerResults.map((p) => (
                <li key={p._id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlayer(p);
                      setSearchQuery(p.name ?? '');
                      setPlayerResults([]);
                    }}
                    disabled={keeperFinalized}
                    className="w-full text-left px-3 py-2 hover:bg-app-dark border-b border-app-border last:border-b-0"
                  >
                    {p.name}{' '}
                    {Array.isArray(p.eligiblePositions) && p.eligiblePositions.length > 0
                      ? `(${p.eligiblePositions.join('/')})`
                      : ''}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <form onSubmit={handleAddKeeper} className="bg-app-panel border border-app-border rounded-lg p-4 mb-6 space-y-3">
        <div>
          <label className="block text-text-secondary text-sm mb-1">Selected player</label>
          <div className="text-text-primary py-1">
            {selectedPlayer ? selectedPlayer.name : '—'}
          </div>
        </div>
        <div>
          <label className="block text-text-secondary text-sm mb-1">Team</label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full rounded bg-app-dark border border-app-border px-3 py-2 text-text-primary"
            disabled={keeperFinalized}
          >
            <option value="">Select team</option>
            {teams.map((t) => (
              <option key={t._id} value={t._id}>
                {t.teamName} ({t.ownerName})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-text-secondary text-sm mb-1">Keeper cost</label>
          <input
            type="number"
            min={0}
            value={keeperPrice}
            onChange={(e) => setKeeperPrice(e.target.value)}
            className="w-full rounded bg-app-dark border border-app-border px-3 py-2 text-text-primary"
            disabled={keeperFinalized}
          />
        </div>
        <button
          type="submit"
          disabled={keeperFinalized || submitting || !selectedPlayer || !teamId || keeperPrice === ''}
          className="rounded-lg bg-primary hover:bg-primary-hover text-white py-2 px-4 disabled:opacity-50"
        >
          {submitting ? 'Adding…' : 'Add Keeper'}
        </button>
      </form>

      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Keepers entered</h2>
          <span className="text-text-secondary text-sm">
            {keepers.length} keepers, ${totalKeeperSpend} total
          </span>
        </div>
        {keepers.length === 0 ? (
          <p className="text-text-secondary">No keepers yet.</p>
        ) : (
          <ul className="space-y-1">
            {keepers.map((pick) => (
              <li key={pick._id} className="bg-app-panel border border-app-border rounded px-3 py-2 text-sm">
                {typeof pick.playerId === 'object' && pick.playerId?.name != null
                  ? pick.playerId.name
                  : 'Player'}{' '}
                — Team:{' '}
                {typeof pick.teamId === 'object' && pick.teamId != null
                  ? (pick.teamId as { teamName?: string }).teamName ?? (pick.teamId as { _id: string })._id
                  : String(pick.teamId)}{' '}
                — ${pick.amount ?? '—'}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => onUndoLastKeeper()}
        disabled={keeperFinalized || keepers.length === 0 || submitting}
        className="mb-4 rounded-lg border border-app-border bg-app-panel px-4 py-2 text-text-primary hover:bg-app-dark disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Undo Last Keeper
      </button>

      <div className="mb-4 flex flex-wrap gap-2">
        {!keeperFinalized ? (
          <button
            type="button"
            onClick={() => onFinalizeKeepers()}
            disabled={keepers.length === 0 || submitting}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            Finalize Keeper Period
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onReopenKeepers()}
            disabled={submitting}
            className="rounded-lg border border-app-border bg-app-panel px-4 py-2 text-text-primary hover:bg-app-dark disabled:opacity-50"
          >
            Reopen Keeper Period
          </button>
        )}
      </div>

      <Link
        href={`/draft?leagueId=${leagueId}`}
        className="inline-block rounded-lg bg-primary hover:bg-primary-hover text-white font-medium py-2 px-4"
      >
        Go to Draft War Room
      </Link>
    </>
  );
}
