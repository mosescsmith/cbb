import { TeamRatings } from './types';
import ratingsData from './data/ratings.json';

interface RatingsDatabase {
  lastUpdated: string;
  teams: {
    [teamId: string]: {
      name: string;
      kenPom?: number;
      net?: number;
      bpi?: number;
      sagarin?: number;
      massey?: number;
      kpi?: number;
      srs?: number;
      tRank?: number;
    };
  };
}

const ratings = ratingsData as RatingsDatabase;

/**
 * Get ratings for a specific team by ID
 */
export function getTeamRatings(teamId: string): TeamRatings | undefined {
  const teamData = ratings.teams[teamId];

  if (!teamData) {
    return undefined;
  }

  return {
    kenPom: teamData.kenPom,
    net: teamData.net,
    bpi: teamData.bpi,
    sagarin: teamData.sagarin,
    massey: teamData.massey,
    kpi: teamData.kpi,
    srs: teamData.srs,
    tRank: teamData.tRank,
    lastUpdated: ratings.lastUpdated,
  };
}

/**
 * Get primary rating for opponent (used for SoS calculations)
 * Priority: KenPom > NET > BPI > T-Rank
 */
export function getPrimaryRating(teamId: string): number | undefined {
  const teamData = ratings.teams[teamId];

  if (!teamData) {
    return undefined;
  }

  return teamData.kenPom ||
         (teamData.net ? 100 - teamData.net : undefined) || // Convert NET rank to rating-like score
         teamData.bpi ||
         teamData.tRank;
}

/**
 * Check if team has ratings data
 */
export function hasRatings(teamId: string): boolean {
  return teamId in ratings.teams;
}

/**
 * Get last updated date for ratings
 */
export function getRatingsLastUpdated(): string {
  return ratings.lastUpdated;
}

/**
 * Get all teams with ratings
 */
export function getAllRatedTeams(): string[] {
  return Object.keys(ratings.teams);
}
