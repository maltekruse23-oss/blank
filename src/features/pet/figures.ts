import type { ComponentType } from 'react';
import { Blob } from './Blob';
import { Cat } from './Cat';
import { Minimal } from './Minimal';
import { Robo } from './Robo';

/** Mood of the pet: nobody live, someone live, a channel just went live, a warning, a mix plays. */
export type Mood = 'sleepy' | 'awake' | 'excited' | 'worried' | 'music';
export type FigureProps = { mood: Mood; blinking: boolean };

/** Selectable pet figures (Settings → Darstellung); own drawings in the scheme's colours. */
export const petFigures = [
  { id: 'minimal', name: 'Minimal', Figure: Minimal },
  { id: 'blob', name: 'Blob', Figure: Blob },
  { id: 'cat', name: 'Katze', Figure: Cat },
  { id: 'robo', name: 'Robo', Figure: Robo },
] as const satisfies readonly { id: string; name: string; Figure: ComponentType<FigureProps> }[];

export type PetFigureId = (typeof petFigures)[number]['id'];

export function isPetFigureId(value: unknown): value is PetFigureId {
  return petFigures.some((f) => f.id === value);
}

export function petFigure(id: PetFigureId) {
  return petFigures.find((f) => f.id === id) ?? petFigures[0];
}
