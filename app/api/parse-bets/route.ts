import { NextRequest, NextResponse } from 'next/server';
import { getModelsInOrder } from '@/lib/modelConfig';

export interface AIBet {
  awayTeam: string;
  homeTeam: string;
  betType: 'spread' | 'over' | 'under' | 'moneyline';
  line: number | null;
  team?: string; // For spread/moneyline bets
  half: '1st' | '2nd' | 'full';
  toWin: number;
  odds: number;
}

export async function POST(request: NextRequest) {
  try {
    const { betSlipText } = await request.json();

    if (!betSlipText || typeof betSlipText !== 'string') {
      return NextResponse.json({ error: 'betSlipText is required' }, { status: 400 });
    }

    const apiKey = process.env.AIML_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 });
    }

    const models = getModelsInOrder();
    let result = null;
    let lastError: Error | null = null;

    const systemPrompt = `You are a sports betting expert. Parse the following bet slip text and extract structured bet information.

For each bet, determine:
1. awayTeam: The away team name (team listed first or before @)
2. homeTeam: The home team name (team listed second or after @)
3. betType: One of "spread", "over", "under", or "moneyline"
4. line: The point spread or total line (number, or null for moneyline)
5. team: For spread/moneyline bets, which team the bet is on
6. half: Whether this is "1st" half, "2nd" half, or "full" game bet
   - IMPORTANT: Look for indicators like "1H", "1st Half", "First Half", "2H", "2nd Half" in the bet description
   - If the total/spread seems low (under 80 for totals, under 5 for spreads), it's likely a 1st half bet
   - College basketball full game totals are typically 130-160, 1st half totals are 60-80
   - Full game spreads can be large (10+), 1st half spreads are usually smaller
   - Default to "1st" if unclear but line seems like a half total
7. toWin: The amount to win (from "To Win $ X.XX")
8. odds: The odds (e.g., -110 becomes -110)

Return ONLY a valid JSON array of bets. Example:
[
  {
    "awayTeam": "Chicago State",
    "homeTeam": "IPFW",
    "betType": "under",
    "line": 70,
    "half": "1st",
    "toWin": 1.82,
    "odds": -110
  },
  {
    "awayTeam": "UC San Diego",
    "homeTeam": "Bradley",
    "betType": "spread",
    "line": -3.5,
    "team": "Bradley",
    "half": "1st",
    "toWin": 1.90,
    "odds": -105
  }
]`;

    const userPrompt = `Parse these bets:\n\n${betSlipText}`;

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
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          lastError = new Error(`${model.displayName}: ${errorText.substring(0, 100)}`);
          continue;
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (!content) {
          lastError = new Error('No content in response');
          continue;
        }

        // Parse the JSON response
        const parsed = JSON.parse(content);

        // Handle both array and object with bets property
        result = Array.isArray(parsed) ? parsed : (parsed.bets || []);

        // Add IDs to each bet
        result = result.map((bet: AIBet, index: number) => ({
          ...bet,
          id: `${Date.now()}-${index}-${bet.awayTeam}-${bet.homeTeam}`.replace(/\s/g, '-'),
        }));

        return NextResponse.json({
          bets: result,
          model: model.displayName,
          count: result.length
        });

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        continue;
      }
    }

    return NextResponse.json(
      { error: lastError?.message || 'All models failed to parse bets' },
      { status: 500 }
    );

  } catch (error) {
    console.error('Parse bets error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
