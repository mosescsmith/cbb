// Core types for CBB Predictor

export type LocationType = 'home' | 'away' | 'neutral';

export interface TeamRatings {
  kenPom?: number;           // KenPom adjusted efficiency margin
  net?: number;              // NCAA NET ranking
  bpi?: number;              // ESPN BPI
  sagarin?: number;          // Sagarin rating
  massey?: number;           // Massey rating
  kpi?: number;              // KPI (KPI Sports)
  srs?: number;              // Simple Rating System
  tRank?: number;            // T-Rank (Bartovik)
  lastUpdated?: string;      // When ratings were last fetched
}

export interface Team {
  id: string;
  name: string;
  shortName?: string;
  rank?: number;
  // Advanced Ratings
  ratings?: TeamRatings;
  // KenPom metrics (legacy - kept for compatibility)
  kenPomRating?: number;
  offensiveEfficiency?: number;
  defensiveEfficiency?: number;
  tempo?: number;
  // Season stats
  avgPoints?: number;
  avgPointsAllowed?: number;
  wins?: number;
  losses?: number;
}

export interface Game {
  id: string;
  date: string; // ISO format
  startTimeEpoch?: number; // Unix timestamp for sorting
  homeTeam: Team;
  awayTeam: Team;
  location: LocationType;
  status: 'scheduled' | 'in_progress' | 'halftime' | 'final';
  currentPeriod?: string; // "1st", "2nd", "HALFTIME", "FINAL"
  // Live scores (if available)
  homeScore?: number;
  awayScore?: number;
  halftimeHomeScore?: number;
  halftimeAwayScore?: number;
}

export interface PredictionRequest {
  gameId: string;
  half: '1st' | '2nd';
  // For 2nd half predictions
  halftimeHomeScore?: number;
  halftimeAwayScore?: number;
  // Debug mode flag
  debug?: boolean;
}

export interface PredictionResponse {
  homeScore: number;
  awayScore: number;
  confidence?: number; // 0-1
  reasoning?: string;
  _meta?: {
    model: string;           // Display name (e.g., "DeepSeek V3")
    modelName: string;       // API name (e.g., "deepseek-chat")
    totalTime: string;       // Time taken (e.g., "1.23s")
    stats?: {
      home: { matched: string; confidence: number } | null;
      away: { matched: string; confidence: number } | null;
    };
  };
}

export interface NCAAPIGame {
  game: {
    gameID: string;
    gameState: string;
    startDate: string;
    startTime: string;
    startTimeEpoch: number;
    currentPeriod: string;
    home: {
      names: {
        char6: string;
        full: string;
        seo: string;
        short: string;
      };
      score: number;
      rank?: string;
      currentRank?: number;
    };
    away: {
      names: {
        char6: string;
        full: string;
        seo: string;
        short: string;
      };
      score: number;
      rank?: string;
      currentRank?: number;
    };
  };
}

// Team Stats Cache Types
export interface HalfStats {
  scored: number;
  allowed: number;
  gamesPlayed: number;
}

export interface GameStats {
  gameId: string;
  date: string;
  opponent: string;
  opponentId: string;
  isHome: boolean;
  opponentRating?: number;  // Primary rating (KenPom or NET) for SoS calculations
  firstHalf: {
    scored: number;
    allowed: number;
  };
  secondHalf: {
    scored: number;
    allowed: number;
  };
}

export interface TeamStatsCache {
  teamId: string;
  teamName: string;
  lastUpdated: string; // ISO timestamp
  games: GameStats[];
  seasonAverages: {
    firstHalf: HalfStats;
    secondHalf: HalfStats;
  };
  last5Averages: {
    firstHalf: HalfStats;
    secondHalf: HalfStats;
  };
  strengthOfSchedule?: {
    average: number;        // Average opponent rating
    weightedAverage: number; // Weighted by recency
    gamesWithRatings: number; // How many games had opponent ratings
  };
}

export interface TeamStatsResult {
  cache: TeamStatsCache;
  stale: boolean;
  matched: boolean; // Whether team was successfully matched
  suggestions?: Array<{
    teamId: string;
    teamName: string;
    similarity: number;
    gamesCount: number;
  }>;
}

export interface NCAAPIGameDetail {
  contests: Array<{
    id: string;
    startDate?: string;
    linescores: Array<{
      period: string;
      home: string;
      visit: string;
    }>;
    teams: Array<{
      teamId: string;
      isHome: boolean;
      nameFull: string;
      nameShort: string;
      seoname: string;
    }>;
  }>;
}

// Chat Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatRequest {
  message: string;
  gameId: string;
  gameContext?: {
    homeTeam: string;
    awayTeam: string;
    prediction?: PredictionResponse;
    halftimeScore?: {
      home: number;
      away: number;
    };
    currentScore?: {
      home: number;
      away: number;
    };
  };
  conversationHistory: ChatMessage[];
}

export interface ChatResponse {
  message: string;
  timestamp: string;
}
