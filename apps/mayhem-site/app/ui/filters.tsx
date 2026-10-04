'use client';
// The period (all time or this season) and the group code, shared by the records and champions
// pages.
import { useState } from 'react';
import { Tabs } from './bits';

export type Scope = 'all' | 'season';

export function useFilters() {
  const [scope, setScope] = useState<Scope>('all');
  const [group, setGroup] = useState('');
  const query = new URLSearchParams({ scope, ...(group ? { group } : {}) }).toString();
  return { scope, setScope, group, setGroup, query };
}

export function Filters({ scope, setScope, group, setGroup }: Omit<ReturnType<typeof useFilters>, 'query'>) {
  const [input, setInput] = useState('');
  return (
    <>
      <Tabs<Scope>
        label="Zeitraum"
        value={scope}
        onChange={setScope}
        options={[
          { id: 'all', label: 'Alle Zeiten' },
          { id: 'season', label: 'Diese Saison' },
        ]}
      />
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          setGroup(input.trim());
        }}
      >
        <input
          aria-label="Gruppencode"
          placeholder="Gruppencode"
          value={input}
          maxLength={12}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="button">{group ? 'Wechseln' : 'Gruppe'}</button>
        {group && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setGroup('');
              setInput('');
            }}
          >
            Alle
          </button>
        )}
      </form>
    </>
  );
}
