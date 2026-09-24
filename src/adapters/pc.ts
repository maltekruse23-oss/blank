// Real PC status and background warnings, measured in Rust (src-tauri/src/pc.rs). Desktop app
// only; the browser preview has no access to the system.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { BatteryDevice } from './devices';

export type Specs = {
  cpu: string;
  threads: number;
  memoryInstalledBytes: number | null;
  gpu: string | null;
  gpuMemoryBytes: number | null;
  os: string;
};

/** A program (all its processes) and its share: percent for CPU/GPU, bytes for memory. */
export type AppLoad = {
  name: string;
  /** Executable, e.g. "chrome.exe". */
  exe: string;
  /** Has its own window and is not part of Windows: may be closed from a warning. */
  closable: boolean;
  value: number;
};

export type PcSample = {
  /** null until two readings exist. */
  cpuPercent: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  /** null without readable GPU counters. */
  gpuPercent: number | null;
  diskName: string;
  diskUsedBytes: number | null;
  diskTotalBytes: number | null;
  topCpu: AppLoad[];
  topMemory: AppLoad[];
  topGpu: AppLoad[];
};

export type PcStatus = { specs: Specs; sample: PcSample | null };

export type PcWarning = { resource: 'cpu' | 'memory' | 'gpu'; percent: number; apps: AppLoad[] };

/** Also keeps measuring every `seconds` for a few seconds (PC page 2, Home 5). */
export const readPcStatus = isTauri()
  ? (seconds: number) => invoke<PcStatus>('pc_status', { seconds })
  : null;

/**
 * Closes a program: normally like its window's X (it may ask about unsaved work), or `force`d
 * for one that does not react. Resolves to the number of windows/processes addressed.
 */
export const closeProgram = isTauri()
  ? (exe: string, force: boolean) => invoke<number>('close_program', { exe, force })
  : null;

export type CleanedMemory = {
  usedBefore: number;
  usedAfter: number;
  freedBytes: number;
  /** Windows did not allow every step. */
  incomplete: boolean;
};

/**
 * RAM cleaning like Mem Reduct (src-tauri/src/memory.rs). Windows asks for administrator rights
 * each time; rejects with a German message when declined or refused.
 */
export const cleanMemory = isTauri() ? () => invoke<CleanedMemory>('clean_memory') : null;

/** Running processes of a program (0 = closed). */
export const programRunning = isTauri()
  ? (exe: string) => invoke<number>('program_running', { exe })
  : null;

export const onPcWarning = isTauri()
  ? (handler: (warning: PcWarning) => void) =>
      listen<PcWarning>('pc-warning', (event) => handler(event.payload))
  : null;

export const onBatteryLow = isTauri()
  ? (handler: (device: BatteryDevice) => void) =>
      listen<BatteryDevice>('battery-low', (event) => handler(event.payload))
  : null;

const GB = 1024 ** 3;

export function formatGb(bytes: number) {
  const gb = bytes / GB;
  return gb.toLocaleString('de-DE', { maximumFractionDigits: gb < 10 ? 1 : 0 });
}

/** Sizes of drives and installed memory as sold (1 TB, 32 GB). */
export function formatSize(bytes: number) {
  return bytes >= 1000 * GB
    ? `${(bytes / 1024 ** 4).toLocaleString('de-DE', { maximumFractionDigits: 1 })} TB`
    : `${Math.round(bytes / GB)} GB`;
}

export function formatPercent(value: number) {
  return Math.round(value).toString();
}
