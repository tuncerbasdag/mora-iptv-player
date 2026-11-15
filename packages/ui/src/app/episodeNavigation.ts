import type { MediaItem, Show } from '../../../core/src/types.ts';

/** The location of an episode within a show (season and episode index). */
export interface EpisodePosition {
  seasonIndex: number;
  episodeIndex: number;
}

export interface EpisodeRef {
  episode: MediaItem;
  pos: EpisodePosition;
}

/** Pure episode navigation within a show: previous/next episode, crossing season boundaries too; null if none. */
export class EpisodeNavigator {
  private readonly show: Show;

  constructor(show: Show) {
    this.show = show;
  }

  previous(pos: EpisodePosition): EpisodeRef | null {
    const { seasons } = this.show;
    if (pos.episodeIndex > 0) {
      const episodeIndex = pos.episodeIndex - 1;
      return { episode: seasons[pos.seasonIndex].episodes[episodeIndex], pos: { seasonIndex: pos.seasonIndex, episodeIndex } };
    }
    const prevSeason = seasons[pos.seasonIndex - 1];
    if (prevSeason && prevSeason.episodes.length > 0) {
      const episodeIndex = prevSeason.episodes.length - 1;
      return { episode: prevSeason.episodes[episodeIndex], pos: { seasonIndex: pos.seasonIndex - 1, episodeIndex } };
    }
    return null;
  }

  next(pos: EpisodePosition): EpisodeRef | null {
    const { seasons } = this.show;
    const season = seasons[pos.seasonIndex];
    if (season && pos.episodeIndex + 1 < season.episodes.length) {
      const episodeIndex = pos.episodeIndex + 1;
      return { episode: season.episodes[episodeIndex], pos: { seasonIndex: pos.seasonIndex, episodeIndex } };
    }
    const nextSeason = seasons[pos.seasonIndex + 1];
    if (nextSeason && nextSeason.episodes.length > 0) {
      return { episode: nextSeason.episodes[0], pos: { seasonIndex: pos.seasonIndex + 1, episodeIndex: 0 } };
    }
    return null;
  }
}
