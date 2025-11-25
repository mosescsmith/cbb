import { NextRequest, NextResponse } from 'next/server';
import { ChatRequest, ChatResponse } from '@/lib/types';
import { getModelsInOrder } from '@/lib/modelConfig';

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, gameContext, conversationHistory } = body;

    // Get API key from environment
    const apiKey = process.env.AIML_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI API key not configured' },
        { status: 500 }
      );
    }

    // Build context message for AI
    let contextMessage = 'You are a college basketball expert assistant helping analyze a game.';

    if (gameContext) {
      contextMessage += `\n\nCurrent Game: ${gameContext.awayTeam} @ ${gameContext.homeTeam}`;

      if (gameContext.currentScore) {
        contextMessage += `\nCurrent Score: ${gameContext.awayTeam} ${gameContext.currentScore.away}, ${gameContext.homeTeam} ${gameContext.currentScore.home}`;
      }

      if (gameContext.halftimeScore) {
        contextMessage += `\nHalftime Score: ${gameContext.awayTeam} ${gameContext.halftimeScore.away}, ${gameContext.homeTeam} ${gameContext.halftimeScore.home}`;
      }

      if (gameContext.prediction) {
        contextMessage += `\n\nAI Prediction:`;
        contextMessage += `\n- Predicted Score: ${gameContext.awayTeam} ${gameContext.prediction.awayScore}, ${gameContext.homeTeam} ${gameContext.prediction.homeScore}`;
        if (gameContext.prediction.confidence) {
          contextMessage += `\n- Confidence: ${(gameContext.prediction.confidence * 100).toFixed(0)}%`;
        }
        if (gameContext.prediction.reasoning) {
          contextMessage += `\n- Reasoning: ${gameContext.prediction.reasoning}`;
        }
      }
    }

    contextMessage += '\n\nProvide helpful, concise answers about the game, prediction, or teams. Be conversational and engaging.';

    // Build conversation messages for AI
    const messages = [
      {
        role: 'system',
        content: contextMessage,
      },
      ...conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ];

    // Call AI API with fallback system
    const models = getModelsInOrder();
    let responseText: string | null = null;
    let lastError: Error | null = null;

    for (const model of models) {
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
            temperature: 0.8, // Slightly higher for more conversational responses
            max_tokens: 500, // Limit response length
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          lastError = new Error(`${model.displayName}: ${errorData.substring(0, 100)}`);
          continue;
        }

        const data = await response.json();
        responseText = data.choices[0]?.message?.content;

        if (responseText) {
          break; // Success!
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        continue;
      }
    }

    // If all models failed
    if (!responseText) {
      console.error('All AI models failed. Last error:', lastError);
      return NextResponse.json(
        { error: lastError?.message || 'All AI models failed' },
        { status: 500 }
      );
    }

    const chatResponse: ChatResponse = {
      message: responseText,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(chatResponse);
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
