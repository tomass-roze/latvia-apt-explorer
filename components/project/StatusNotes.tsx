'use client';

import { type ProjectId, STATUSES, type Status } from '@/lib/schema';
import { useNote, usePersonalState } from '@/lib/personal/hooks';

interface StatusNotesProps {
  projectId: ProjectId;
}

const STATUS_LABELS: Record<Status, string> = {
  new: 'Jauns',
  interested: 'Interesē',
  visited: 'Apmeklēts',
  passed: 'Noraidīts',
};

const STATUS_COLORS: Record<Status, string> = {
  new: 'var(--status-new)',
  interested: 'var(--status-interested)',
  visited: 'var(--status-visited)',
  passed: 'var(--status-passed)',
};

export function StatusNotes({ projectId }: StatusNotesProps) {
  const { state, setStatus } = usePersonalState();
  const current = state.status[projectId] ?? null;
  const [note, setNote] = useNote(projectId);

  return (
    <section className="px-6 py-5 border-t border-[var(--line)] space-y-3">
      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-2">
          Statuss
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const active = current === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(projectId, active ? null : s)}
                className={`flex items-center gap-1.5 h-7 px-2 rounded-md border text-xs transition-colors ${
                  active
                    ? 'border-[var(--ink-2)] bg-[var(--paper-2)] text-[var(--ink)]'
                    : 'border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--ink-3)]'
                }`}
                aria-pressed={active}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${active ? '' : 'border'}`}
                  style={{
                    backgroundColor: active ? STATUS_COLORS[s] : 'transparent',
                    borderColor: STATUS_COLORS[s],
                  }}
                />
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] mb-2">
          Piezīmes
        </h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Piezīmes par šo projektu… (saglabājas tikai tavā pārlūkā)"
          className="w-full min-h-[96px] resize-y bg-[var(--paper)] border-0 border-l-2 border-[var(--line)] focus:border-[var(--accent)] px-4 py-3 text-sm leading-relaxed italic placeholder:text-[var(--ink-3)] focus:outline-none"
          style={{ fontFamily: 'var(--font-display)' }}
        />
        {note ? (
          <div className="text-[11px] text-[var(--ink-3)] mt-1">Saglabāts</div>
        ) : null}
      </div>
    </section>
  );
}
