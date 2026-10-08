'use client';
// The period (all time or this season), shared by the records and champions pages.
import { useState } from 'react';
import { Tabs } from './bits';

export type Scope = 'all' | 'season';

export function useFilters() {
  const [scope, setScope] = useState<Scope>('all');
  const query = new URLSearchParams({ scope }).toString();
  return { scope, setScope, query };
}

export function Filters({ scope, setScope }: Omit<ReturnType<typeof useFilters>, 'query'>) {
  return (
    <Tabs<Scope>
      label="Period"
      value={scope}
      onChange={setScope}
      options={[
        { id: 'all', label: 'All time' },
        { id: 'season', label: 'This season' },
      ]}
    />
  );
}
