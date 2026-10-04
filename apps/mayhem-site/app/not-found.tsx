import { Problem } from './ui/bits';

// Any unknown address: the same card as a missing player or game, in German, with the way back.
export default function NotFound() {
  return <Problem message="Seite nicht gefunden" missing />;
}
