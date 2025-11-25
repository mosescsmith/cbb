# CBB Predictor

AI-powered college basketball game score predictor using NCAA API data and AIML API for predictions.

## Features

- **Daily Game List**: Fetches today's D1 men's college basketball games from NCAA API
- **1st Half Predictions**: Predict scores based on pre-game team data (rankings, stats)
- **2nd Half Predictions**: Input halftime scores for more accurate final score predictions
- **Editable Game Location**: Toggle between Home/Away/Neutral venue settings
- **Real-time Data**: Live scores and game status when available

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Data Source**: [NCAA API](https://github.com/henrygd/ncaa-api) (free, no auth required)
- **AI Service**: [AIML API](https://docs.aimlapi.com/) (OpenAI-compatible)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure AI API Key

Get your API key from [AIML API Dashboard](https://aimlapi.com/)

Edit `.env.local`:
```env
AIML_API_KEY=your_actual_api_key_here
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
cbb-app/
├── app/
│   ├── page.tsx              # Homepage: list of games
│   ├── game/[id]/page.tsx    # Game detail with prediction panel
│   └── api/
│       ├── game/[id]/route.ts  # Fetch single game
│       └── predict/route.ts    # AI prediction endpoint
├── components/
│   ├── GameCard.tsx          # Game list item
│   └── PredictionPanel.tsx   # 1st/2nd half toggle + predictions
└── lib/
    ├── types.ts              # TypeScript interfaces
    └── ncaaService.ts        # NCAA API client
```

## Usage

1. **View Today's Games**: Homepage displays all D1 games scheduled for today
2. **Select a Game**: Click any game card to see details
3. **Edit Location**: Click the location badge (HOME/AWAY/NEUTRAL) to change venue type
4. **Get 1st Half Prediction**:
   - Click "1st Half" tab
   - Click "Get Prediction"
5. **Get 2nd Half Prediction**:
   - Click "2nd Half" tab
   - Enter halftime scores for both teams
   - Click "Get Prediction"

## Data Sources

### NCAA API
- **Endpoint**: `https://ncaa-api.henrygd.me/scoreboard/basketball-men/d1/{YYYY}/{MM}/all-conf`
- **Rate Limit**: 5 requests/second
- **Data**: Scores, rankings, game status, team names

### AIML API
- **Model**: `gpt-4o`
- **Format**: OpenAI-compatible chat completions
- **Response**: JSON with `homeScore`, `awayScore`, `confidence`, `reasoning`

## Notes

- Games are fetched from NCAA API with 60-second cache
- Predictions require valid AIML API key
- Location defaults to "home" but can be edited per game
- For best results, add KenPom data or additional team stats to `lib/types.ts`
