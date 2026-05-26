export interface Player {
  id: string;
  name: string;
  score: number;
  eliminated?: boolean;
}

export type GameType = 'lieDetector' | 'talentShow' | 'standOut' | 'numberGuessor' | 'pieCharts' | 'dealOrSteal' | 'shadowProtocol' | 'potLuck' | 'chainLink' | 'plotTwist';

export interface GameState {
  players: Player[];
  selectedGame: GameType | null;
  currentPlayerIndex: number;
  currentRound: number;
}
