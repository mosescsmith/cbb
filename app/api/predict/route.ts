import { NextRequest, NextResponse } from 'next/server';
import { PredictionRequest, PredictionResponse, Game } from '@/lib/types';
import { fetchTodaysGames } from '@/lib/ncaaService';
import { getTeamRatings } from '@/lib/ratingsService';
import { getModelsInOrder, ModelConfig, estimateCost } from '@/lib/modelConfig';
import {
  getTeamRankingsStats,
  formatMatchupStatsForPrompt,
  TeamRankingsStats,
} from '@/lib/teamRankingsService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      gameId,
      half,
      halftimeHomeScore,
      halftimeAwayScore,
      homeTeamOverride,
      awayTeamOverride,
      debug,
    } = body as PredictionRequest & {
      homeTeamOverride?: string;
      awayTeamOverride?: string;
    };

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

    // Fetch team stats from TeamRankings static data
    // Use overrides if provided (from user selecting fuzzy match)
    const homeTeamNameForStats = homeTeamOverride || game.homeTeam.name;
    const awayTeamNameForStats = awayTeamOverride || game.awayTeam.name;

    log('Loading team stats from TeamRankings data...', {
      homeTeam: homeTeamNameForStats,
      awayTeam: awayTeamNameForStats,
      homeOverride: homeTeamOverride ? 'yes' : 'no',
      awayOverride: awayTeamOverride ? 'yes' : 'no',
    });

    const statsStartTime = Date.now();
    let homeTeamStats: TeamRankingsStats | null = null;
    let awayTeamStats: TeamRankingsStats | null = null;

    try {
      homeTeamStats = getTeamRankingsStats(homeTeamNameForStats);
      awayTeamStats = getTeamRankingsStats(awayTeamNameForStats);

      const statsElapsed = ((Date.now() - statsStartTime) / 1000).toFixed(2);
      log(`TeamRankings stats loaded (${statsElapsed}s)`, {
        home: homeTeamStats ? {
          matched: homeTeamStats.matchedName,
          confidence: `${(homeTeamStats.matchConfidence * 100).toFixed(0)}%`,
        } : 'Not found',
        away: awayTeamStats ? {
          matched: awayTeamStats.matchedName,
          confidence: `${(awayTeamStats.matchConfidence * 100).toFixed(0)}%`,
        } : 'Not found',
      });
    } catch (error) {
      log('Failed to load TeamRankings stats', { error });
      console.warn('Could not load TeamRankings stats:', error);
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
          home: homeTeamStats ? {
            matched: homeTeamStats.matchedName,
            confidence: homeTeamStats.matchConfidence,
          } : null,
          away: awayTeamStats ? {
            matched: awayTeamStats.matchedName,
            confidence: awayTeamStats.matchConfidence,
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
  homeStats?: TeamRankingsStats | null,
  awayStats?: TeamRankingsStats | null,
  homeRatings?: any,
  awayRatings?: any
): string {
  const isNeutralSite = game.location === 'neutral';

  // Build location context for AI
  let locationContext = '';
  if (isNeutralSite) {
    locationContext = 'Venue: NEUTRAL SITE (no home court advantage for either team)';
  } else if (game.location === 'home') {
    locationContext = `Venue: ${game.homeTeam.name} HOME COURT (${game.homeTeam.name} has home court advantage)`;
  } else {
    locationContext = `Venue: ${game.awayTeam.name} HOME COURT (${game.awayTeam.name} has home court advantage)`;
  }

  const baseInfo = `
Predict the ${half} half score for this college basketball game:

**${game.awayTeam.name}** ${game.awayTeam.rank ? `(#${game.awayTeam.rank})` : ''}
vs
**${game.homeTeam.name}** ${game.homeTeam.rank ? `(#${game.homeTeam.rank})` : ''}

${locationContext}
Date: ${new Date(game.date).toLocaleDateString()}
`;

  // Build ratings section
  let ratingsInfo = '\n**Team Ratings:**\n';
  ratingsInfo += `${game.awayTeam.name}: KenPom ${awayRatings?.kenPom || 'N/A'}, NET ${awayRatings?.net || 'N/A'}, BPI ${awayRatings?.bpi || 'N/A'}\n`;
  ratingsInfo += `${game.homeTeam.name}: KenPom ${homeRatings?.kenPom || 'N/A'}, NET ${homeRatings?.net || 'N/A'}, BPI ${homeRatings?.bpi || 'N/A'}\n`;

  // Build TeamRankings stats section using the service formatter
  const statsInfo = formatMatchupStatsForPrompt(homeStats ?? null, awayStats ?? null, isNeutralSite);

  const analysisNotes = `
**Analysis Notes:**
- PPG = Points Per Game for that half
- Allowed = Points allowed per game for that half
- Margin = Average scoring margin (positive = outscoring opponents)
- Recent form (Last 3 games) may indicate momentum shifts
- Home/Away splits show location-dependent performance`;

  if (half === '1st') {
    return `${baseInfo}${ratingsInfo}
${statsInfo}
${analysisNotes}

Predict the score at the END of the 1st half. Focus on 1st half stats for both teams.`;
  } else {
    return `${baseInfo}
**Halftime Score:**
- ${game.awayTeam.name}: ${halftimeAwayScore}
- ${game.homeTeam.name}: ${halftimeHomeScore}

${ratingsInfo}
${statsInfo}
${analysisNotes}

Based on the halftime score and 2nd half performance trends, predict the FINAL score at the end of the game.
Focus on 2nd half stats - some teams perform very differently in the 2nd half.`;
  }
}
