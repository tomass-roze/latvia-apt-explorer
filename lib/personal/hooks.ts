'use client';

// Personal-state localStorage hooks.
//
// Layout in localStorage:
//   apt-explorer:v1:personal       → PersonalState blob (status, saved, weights)
//   apt-explorer:v1:notes:<projId> → string note, one key per project
//
// Per-project keys for notes avoid the "every keystroke serializes the whole
// notes blob" failure mode.
//
// ePrivacy / "strictly necessary" exemption:
// `useLocalStorage` from usehooks-ts does NOT write on mount — it only writes
// when its setter is called. Setters here are only invoked from explicit user
// actions (click status, type note, click save), which satisfies the "storage
// triggered by a service the user requested" carve-out. No banner needed.
//
// Read-side recovery: schema-validate on first read; on Zod failure, wipe the
// corrupt key and log to console. The toast surface is owned by the consumer.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalStorage } from 'usehooks-ts';
import {
  PersonalStateSchema,
  type PersonalState,
  type ProjectId,
  type Status,
} from '@/lib/schema';

export const STORAGE_PREFIX = 'apt-explorer:v1';
const PERSONAL_KEY = `${STORAGE_PREFIX}:personal`;
const noteKey = (id: ProjectId) => `${STORAGE_PREFIX}:notes:${id}`;

const DEFAULT_PERSONAL: PersonalState = {
  version: 1,
  status: {},
  saved: [],
  weights: {},
};

// ─── Single combined state ────────────────────────────────────────────────

function deserializePersonal(raw: string): PersonalState {
  try {
    const parsed = PersonalStateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    console.warn('[personal] corrupt state, wiping:', parsed.error.issues.slice(0, 3));
    return DEFAULT_PERSONAL;
  } catch (err) {
    console.warn('[personal] failed to parse, wiping:', err);
    return DEFAULT_PERSONAL;
  }
}

export function usePersonalState() {
  const [state, setState] = useLocalStorage<PersonalState>(PERSONAL_KEY, DEFAULT_PERSONAL, {
    initializeWithValue: false,
    serializer: (v) => JSON.stringify(v),
    deserializer: deserializePersonal,
  });

  // Derived setters (atomic, type-safe).
  const setStatus = (id: ProjectId, status: Status | null) => {
    setState((prev) => {
      const next = { ...prev.status };
      if (status === null) delete next[id];
      else next[id] = status;
      return { ...prev, status: next };
    });
  };

  const toggleSaved = (id: ProjectId) => {
    setState((prev) =>
      prev.saved.includes(id)
        ? { ...prev, saved: prev.saved.filter((s) => s !== id) }
        : { ...prev, saved: [...prev.saved, id] },
    );
  };

  const wipeAll = () => {
    if (typeof window === 'undefined') return;
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(`${STORAGE_PREFIX}:`)) window.localStorage.removeItem(key);
    }
    setState(DEFAULT_PERSONAL);
  };

  return { state, setStatus, toggleSaved, wipeAll };
}

// ─── Per-project notes with debounced writes ──────────────────────────────

const NOTE_DEBOUNCE_MS = 500;

export function useNote(projectId: ProjectId | null) {
  const [value, setValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadedFor = useRef<string | null>(null);

  // Hydrate from localStorage when the projectId changes.
  useEffect(() => {
    if (!projectId) {
      setValue('');
      initialLoadedFor.current = null;
      return;
    }
    if (initialLoadedFor.current === projectId) return;
    initialLoadedFor.current = projectId;
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(noteKey(projectId));
    setValue(raw ?? '');
  }, [projectId]);

  // Debounced write — single setItem per 500ms regardless of keystroke rate.
  useEffect(() => {
    if (!projectId) return;
    if (initialLoadedFor.current !== projectId) return;
    if (typeof window === 'undefined') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (value === '') window.localStorage.removeItem(noteKey(projectId));
      else window.localStorage.setItem(noteKey(projectId), value);
    }, NOTE_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, projectId]);

  return [value, setValue] as const;
}

// ─── Export all personal data as JSON ─────────────────────────────────────

export function exportPersonalData(): string {
  if (typeof window === 'undefined') return '{}';
  const out: Record<string, unknown> = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(`${STORAGE_PREFIX}:`)) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      out[key] = JSON.parse(raw);
    } catch {
      out[key] = raw;
    }
  }
  return JSON.stringify(out, null, 2);
}

export function useSavedSet(): Set<ProjectId> {
  const { state } = usePersonalState();
  return useMemo(() => new Set(state.saved), [state.saved]);
}
