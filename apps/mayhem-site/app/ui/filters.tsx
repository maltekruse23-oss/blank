'use client';
// The period (all time or this season), shared by the records and champions pages.
import { useState } from 'react';
import { Tabs } from './bits';
import { useLang } from './i18n';

export type Scope = 'all' | 'season';

export function useFilters() {
  const [scope, setScope] = useState<Scope>('all');
  const query = new URLSearchParams({ scope }).toString();
  return { scope, setScope, query };
}

export function Filters({ scope, setScope }: Omit<ReturnType<typeof useFilters>, 'query'>) {
  const { t } = useLang();
  return (
    <Tabs<Scope>
      label={t('Period', 'Zeitraum')}
      value={scope}
      onChange={setScope}
      options={[
        { id: 'all', label: t('All time', 'Alle Zeiten') },
        { id: 'season', label: t('This season', 'Diese Saison') },
      ]}
    />
  );
}
