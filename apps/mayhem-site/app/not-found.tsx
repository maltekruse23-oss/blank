'use client';
import { Problem } from './ui/bits';

// Any unknown address: the same card as a missing player or game, with the way back.
export default function NotFound() {
  return <Problem message="Page not found" missing />;
}
