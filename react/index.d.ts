import type { FC, CSSProperties } from 'react';
import type { Storyboard, StageOptions, StageBeatEvent, StagePhaseEvent } from 'aurora-field';
export interface AuroraStageProps {
  /** A storyboard to play now (validated; an invalid one calls onError). */
  storyboard?: Storyboard;
  /** A URL that returns a storyboard as JSON; ETag-aware. */
  src?: string;
  /** Played when src fails or takes longer than `timeout` ms the first time. */
  fallback?: Storyboard;
  /** A trade to show and hold (a headline hover); null lets the story carry on. */
  focus?: string | null;
  /** Seconds between polls of src while the page is visible; 0 polls never. A changed board takes over at the next beat. */
  live?: number;
  timeout?: number;
  options?: StageOptions;
  className?: string;
  style?: CSSProperties;
  onBeat?: (e: StageBeatEvent) => void;
  onPhase?: (e: StagePhaseEvent) => void;
  onLoad?: (board: Storyboard) => void;
  onError?: (e: Error) => void;
}
export const AuroraStage: FC<AuroraStageProps>;
export default AuroraStage;
