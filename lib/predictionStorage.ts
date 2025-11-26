/**
 * Prediction Storage Service
 *
 * Handles localStorage persistence for batch predictions.
 * Predictions are keyed by gameId and half type.
 */

import { PredictionResponse } from './types';

const STORAGE_KEY = 'cbb-predictions';

export interface StoredPrediction {
  prediction: PredictionResponse;
  gameId: string;
  half: '1st' | '2nd';
  timestamp: number;
  isNeutralSite: boolean;
}

interface PredictionStore {
  [key: string]: StoredPrediction; // key format: `${gameId}-${half}`
}

/**
 * Get storage key for a prediction
 */
function getKey(gameId: string, half: '1st' | '2nd'): string {
  return `${gameId}-${half}`;
}

/**
 * Load all predictions from localStorage
 */
export function loadPredictions(): PredictionStore {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (error) {
    console.error('Failed to load predictions from localStorage:', error);
    return {};
  }
}

/**
 * Save predictions to localStorage
 */
function savePredictions(store: PredictionStore): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save predictions to localStorage:', error);
  }
}

/**
 * Get a cached prediction for a specific game and half
 */
export function getCachedPrediction(
  gameId: string,
  half: '1st' | '2nd'
): StoredPrediction | null {
  const store = loadPredictions();
  const key = getKey(gameId, half);
  return store[key] || null;
}

/**
 * Store a prediction
 */
export function storePrediction(
  gameId: string,
  half: '1st' | '2nd',
  prediction: PredictionResponse,
  isNeutralSite: boolean
): void {
  const store = loadPredictions();
  const key = getKey(gameId, half);

  store[key] = {
    prediction,
    gameId,
    half,
    timestamp: Date.now(),
    isNeutralSite,
  };

  savePredictions(store);
}

/**
 * Check if a prediction exists for a game
 */
export function hasCachedPrediction(gameId: string, half: '1st' | '2nd'): boolean {
  const store = loadPredictions();
  const key = getKey(gameId, half);
  return key in store;
}

/**
 * Get all cached 1st half predictions (for showing indicators on game list)
 */
export function getAllFirstHalfPredictions(): Map<string, StoredPrediction> {
  const store = loadPredictions();
  const map = new Map<string, StoredPrediction>();

  for (const [key, value] of Object.entries(store)) {
    if (value.half === '1st') {
      map.set(value.gameId, value);
    }
  }

  return map;
}

/**
 * Clear a specific prediction
 */
export function clearPrediction(gameId: string, half: '1st' | '2nd'): void {
  const store = loadPredictions();
  const key = getKey(gameId, half);
  delete store[key];
  savePredictions(store);
}

/**
 * Clear all predictions (useful for new day)
 */
export function clearAllPredictions(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get count of cached 1st half predictions
 */
export function getCachedPredictionCount(): number {
  const store = loadPredictions();
  return Object.values(store).filter(p => p.half === '1st').length;
}
