import { NextRequest, NextResponse } from 'next/server';
import { PredictionRequest, PredictionResponse, Game, TeamStatsCache, TeamStatsResult } from '@/lib/types';
import { fetchTodaysGames } from '@/lib/ncaaService';
import { getOrUpdateTeamStats } from '@/lib/statsService';
import { getTeamRatings } from '@/lib/ratingsService';
import { getModelsInOrder, ModelConfig, estimateCost } from '@/lib/modelConfig';

export async function POST(request: NextRequest) {
  try {
    const body: PredictionRequest = await request.json();
    const { gameId, half, halftimeHomeScore, halftimeAwayScore, debug } = body;

    const log = (message: string, data?: any) => {
      if (debug) {
        console.log(`[PREDICT API] ${message}`, data || '');
      }
    };

    log(`Received ${half} half prediction request for game ${gameId}`);

    // Fetch game data
    log('Fetching game data...');
    const games = await fetchTodaysGames();
    const game = games.find((g) => g.id === gameId);

    if (!game) {
      log('Game not found', { gameId });
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    log('Game found', { home: game.homeTeam.name, away: game.awayTeam.name });

    // Get API key from environment
    const apiKey = process.env.AIML_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI API key not configured' },
        { status: 500 }
      );
    }

    // Fetch team stats and ratings
    log('Loading team stats from cache...');
    const statsStartTime = Date.now();
    let homeTeamStats: TeamStatsCache | null = null;
    let awayTeamStats: TeamStatsCache | null = null;
    let homeStatsResult: TeamStatsResult | null = null;
    let awayStatsResult: TeamStatsResult | null = null;

    try {
      const [homeResult, awayResult] = await Promise.all([
        getOrUpdateTeamStats(game.homeTeam.id, game.homeTeam.name),
        getOrUpdateTeamStats(game.awayTeam.id, game.awayTeam.name),
      ]);
      homeStatsResult = homeResult;
      awayStatsResult = awayResult;
      homeTeamStats = homeResult.matched ? homeResult.cache : null;
      awayTeamStats = awayResult.matched ? awayResult.cache : null;

      const statsElapsed = ((Date.now() - statsStartTime) / 1000).toFixed(2);
      const homeStatus = !homeResult.matched ? '⚠ Not found' : (!homeResult.stale ? '✓ Cached' : '↻ Updated');
      const awayStatus = !awayResult.matched ? '⚠ Not found' : (!awayResult.stale ? '✓ Cached' : '↻ Updated');
      log(`Stats loaded (${statsElapsed}s)`, {
        home: { status: homeStatus, games: homeResult.cache.games.length, matched: homeResult.matched },
        away: { status: awayStatus, games: awayResult.cache.games.length, matched: awayResult.matched },
      });

      // Log suggestions if teams weren't matched
      if (!homeResult.matched && homeResult.suggestions?.length) {
        log(`Suggestions for ${game.homeTeam.name}:`, homeResult.suggestions.slice(0, 3));
      }
      if (!awayResult.matched && awayResult.suggestions?.length) {
        log(`Suggestions for ${game.awayTeam.name}:`, awayResult.suggestions.slice(0, 3));
      }
    } catch (error) {
      log('Failed to fetch team stats', { error });
      console.warn('Could not fetch team stats:', error);
      // Continue without stats
    }

    // Get team ratings
    const homeRatings = getTeamRatings(game.homeTeam.id);
    const awayRatings = getTeamRatings(game.awayTeam.id);

    log('Ratings lookup complete', {
      homeHasRatings: !!homeRatings,
      awayHasRatings: !!awayRatings,
    });

    // Build prompt for AI prediction
    const prompt = buildPredictionPrompt(
      game,
      half,
      halftimeHomeScore,
      halftimeAwayScore,
      homeTeamStats,
      awayTeamStats,
      homeRatings,
      awayRatings
    );

    if (debug) {
      log('AI Prompt (truncated)', {
        length: prompt.length,
        preview: prompt.substring(0, 300) + '...',
      });
    }

    // Call AI API with fallback system
    log('Calling AI API with fallback system...');
    const models = getModelsInOrder();

    let prediction: PredictionResponse | null = null;
    let lastError: Error | null = null;
    let usedModel: ModelConfig | null = null;
    let totalAiTime = 0;

    const messages = [
      {
        role: 'system',
        content: 'You are a college basketball prediction expert. Provide score predictions in JSON format: {"homeScore": number, "awayScore": number, "confidence": 0-1, "reasoning": "brief explanation"}',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    // Try each model in order until one succeeds
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const attemptNum = i + 1;

      log(`Attempt ${attemptNum}/${models.length}: Trying ${model.displayName} (${model.name})`, {
        cost: `$${model.costPer1MInput}/$${model.costPer1MOutput} per 1M tokens`,
      });

      const aiStartTime = Date.now();

      try {
        const response = await fetch('https://api.aimlapi.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model.name,
            messages,
            temperature: 0.7,
            response_format: { type: 'json_object' },
          }),
        });

        const aiElapsed = ((Date.now() - aiStartTime) / 1000).toFixed(2);
        totalAiTime += Date.now() - aiStartTime;

        if (!response.ok) {
          const errorData = await response.text();
          log(`${model.displayName} failed after ${aiElapsed}s`, {
            status: response.status,
            error: errorData.substring(0, 200),
          });
          lastError = new Error(`${model.displayName}: ${errorData.substring(0, 100)}`);
          continue; // Try next model
        }

        const data = await response.json();

        // Calculate actual cost
        const cost = data.usage
          ? estimateCost(data.usage.prompt_tokens, data.usage.completion_tokens, model)
          : null;

        log(`${model.displayName} responded in ${aiElapsed}s`, {
          model: data.model,
          usage: data.usage,
          estimatedCost: cost ? `$${cost.toFixed(6)}` : 'N/A',
        });

        const predictionText = data.choices[0]?.message?.content;

        if (!predictionText) {
          log(`No prediction text from ${model.displayName}`);
          lastError = new Error('No prediction received from AI');
          continue; // Try next model
        }

        prediction = JSON.parse(predictionText);
        usedModel = model;
        break; // Success! Exit loop

      } catch (error) {
        const aiElapsed = ((Date.now() - aiStartTime) / 1000).toFixed(2);
        totalAiTime += Date.now() - aiStartTime;
        log(`${model.displayName} threw exception after ${aiElapsed}s`, { error });
        lastError = error instanceof Error ? error : new Error('Unknown error');
        continue; // Try next model
      }
    }

    // If all models failed
    if (!prediction || !usedModel) {
      log('All models failed', {
        totalTime: `${(totalAiTime / 1000).toFixed(2)}s`,
        lastError: lastError?.message,
      });
      console.error('All AI models failed. Last error:', lastError);
      return NextResponse.json(
        { error: lastError?.message || 'All AI models failed' },
        { status: 500 }
      );
    }

    log('Prediction parsed successfully', {
      homeScore: prediction.homeScore,
      awayScore: prediction.awayScore,
      confidence: prediction.confidence,
      usedModel: usedModel.displayName,
      totalAiTime: `${(totalAiTime / 1000).toFixed(2)}s`,
    });

    // Add model info and stats status to response
    const responseWithModel = {
      ...prediction,
      _meta: {
        model: usedModel.displayName,
        modelName: usedModel.name,
        totalTime: `${(totalAiTime / 1000).toFixed(2)}s`,
        stats: {
          home: homeStatsResult ? {
            matched: homeStatsResult.matched,
            games: homeStatsResult.cache.games.length,
          } : null,
          away: awayStatsResult ? {
            matched: awayStatsResult.matched,
            games: awayStatsResult.cache.games.length,
          } : null,
        },
      },
    };

    return NextResponse.json(responseWithModel);
  } catch (error) {
    console.error('Prediction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function buildPredictionPrompt(
  game: Game,
  half: '1st' | '2nd',
  halftimeHomeScore?: number,
  halftimeAwayScore?: number,
  homeStats?: TeamStatsCache | null,
  awayStats?: TeamStatsCache | null,
  homeRatings?: any,
  awayRatings?: any
): string {
  const baseInfo = `
Predict the ${half} half score for this college basketball game:

**${game.awayTeam.name}** ${game.awayTeam.rank ? `(#${game.awayTeam.rank})` : ''}
vs
**${game.homeTeam.name}** ${game.homeTeam.rank ? `(#${game.homeTeam.rank})` : ''}

Location: ${game.location.toUpperCase()}
Date: ${new Date(game.date).toLocaleDateString()}
`;

  // Build stats section
  let statsInfo = '\n**Team Statistics and Ratings:**\n\n';

  // Away team
  statsInfo += `**${game.awayTeam.name}:**\n`;
  if (awayRatings) {
    statsInfo += `- KenPom: ${awayRatings.kenPom || 'N/A'}\n`;
    statsInfo += `- NET: ${awayRatings.net || 'N/A'}\n`;
    statsInfo += `- BPI: ${awayRatings.bpi || 'N/A'}\n`;
  }
  if (awayStats) {
    statsInfo += `- Season Averages (${awayStats.seasonAverages.firstHalf.gamesPlayed} games):\n`;
    statsInfo += `  - 1st Half: ${awayStats.seasonAverages.firstHalf.scored} scored, ${awayStats.seasonAverages.firstHalf.allowed} allowed\n`;
    statsInfo += `  - 2nd Half: ${awayStats.seasonAverages.secondHalf.scored} scored, ${awayStats.seasonAverages.secondHalf.allowed} allowed\n`;
    statsInfo += `- Last 5 Games:\n`;
    statsInfo += `  - 1st Half: ${awayStats.last5Averages.firstHalf.scored} scored, ${awayStats.last5Averages.firstHalf.allowed} allowed\n`;
    statsInfo += `  - 2nd Half: ${awayStats.last5Averages.secondHalf.scored} scored, ${awayStats.last5Averages.secondHalf.allowed} allowed\n`;
    if (awayStats.strengthOfSchedule) {
      statsInfo += `- Strength of Schedule: ${awayStats.strengthOfSchedule.average.toFixed(1)} avg (${awayStats.strengthOfSchedule.gamesWithRatings}/${awayStats.games.length} games rated)\n`;
    }
  }

  statsInfo += `\n**${game.homeTeam.name}:**\n`;
  if (homeRatings) {
    statsInfo += `- KenPom: ${homeRatings.kenPom || 'N/A'}\n`;
    statsInfo += `- NET: ${homeRatings.net || 'N/A'}\n`;
    statsInfo += `- BPI: ${homeRatings.bpi || 'N/A'}\n`;
  }
  if (homeStats) {
    statsInfo += `- Season Averages (${homeStats.seasonAverages.firstHalf.gamesPlayed} games):\n`;
    statsInfo += `  - 1st Half: ${homeStats.seasonAverages.firstHalf.scored} scored, ${homeStats.seasonAverages.firstHalf.allowed} allowed\n`;
    statsInfo += `  - 2nd Half: ${homeStats.seasonAverages.secondHalf.scored} scored, ${homeStats.seasonAverages.secondHalf.allowed} allowed\n`;
    statsInfo += `- Last 5 Games:\n`;
    statsInfo += `  - 1st Half: ${homeStats.last5Averages.firstHalf.scored} scored, ${homeStats.last5Averages.firstHalf.allowed} allowed\n`;
    statsInfo += `  - 2nd Half: ${homeStats.last5Averages.secondHalf.scored} scored, ${homeStats.last5Averages.secondHalf.allowed} allowed\n`;
    if (homeStats.strengthOfSchedule) {
      statsInfo += `- Strength of Schedule: ${homeStats.strengthOfSchedule.average.toFixed(1)} avg (${homeStats.strengthOfSchedule.gamesWithRatings}/${homeStats.games.length} games rated)\n`;
    }
  }

  statsInfo += '\n**Important:** Consider strength of schedule when evaluating stats. Stats against weaker opponents should be taken with a grain of salt.\n';

  if (half === '1st') {
    return `${baseInfo}${statsInfo}

Provide a predicted score for the END of the 1st half. Consider the team ratings, recent form (last 5 games), and strength of schedule.`;
  } else {
    return `${baseInfo}

**Halftime Score:**
- ${game.awayTeam.name}: ${halftimeAwayScore}
- ${game.homeTeam.name}: ${halftimeHomeScore}

${statsInfo}

Based on the halftime score, team ratings, and performance trends, predict the FINAL score at the end of the game (not just 2nd half points, but total final score). Consider momentum from the first half.`;
  }
}
