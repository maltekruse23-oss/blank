import { describe, expect, it } from 'vitest';
import { serverName, serverParam, serversIn } from '../../../apps/mayhem-site/src/servers';

describe('website servers', () => {
  it('names the platforms as players know them', () => {
    expect(serverName('EUW1')).toBe('EUW');
    expect(serverName('EUN1')).toBe('EUNE');
    expect(serverName('NA1')).toBe('NA');
    expect(serverName('KR')).toBe('KR');
    expect(serverName('LA2')).toBe('LAS');
    expect(serverName('OC1')).toBe('OCE');
    expect(serverName('XY3')).toBe('XY');
  });

  it('reads the filter from the address', () => {
    expect(serverParam('euw')).toBe('EUW');
    expect(serverParam('EUNE')).toBe('EUNE');
    expect(serverParam(null)).toBeNull();
    expect(serverParam('')).toBeNull();
    expect(serverParam('eu w')).toBeNull();
    expect(serverParam('x')).toBeNull();
  });

  it('lists the servers present, most players first', () => {
    expect(
      serversIn([
        { server: 'NA' },
        { server: 'EUW' },
        { server: null },
        { server: 'EUW' },
        {},
        { server: 'KR' },
      ]),
    ).toEqual([
      { server: 'EUW', players: 2 },
      { server: 'KR', players: 1 },
      { server: 'NA', players: 1 },
    ]);
  });
});
