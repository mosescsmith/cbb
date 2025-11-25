/**
 * Pre-load team statistics for all games scheduled today
 * This avoids lazy loading during predictions and ensures data is ready
 */

const { fetchTodaysGames } = require('../lib/ncaaService.ts');
const { getOrUpdateTeamStats } = require('../lib/statsService.ts');

async function preloadAllTeamStats() {
  console.log('🏀 Starting team stats pre-load...\n');
  const startTime = Date.now();

  try {
    // Fetch today's games
    console.log('📅 Fetching today\'s games...');
    const games = await fetchTodaysGames();
    console.log(`✓ Found ${games.length} games\n`);

    // Collect all unique team IDs
    const teams = new Map();

    for (const game of games) {
      teams.set(game.homeTeam.id, {
        id: game.homeTeam.id,
        name: game.homeTeam.name,
      });
      teams.set(game.awayTeam.id, {
        id: game.awayTeam.id,
        name: game.awayTeam.name,
      });
    }

    console.log(`🎯 Found ${teams.size} unique teams to process\n`);
    console.log('─'.repeat(80));

    let completed = 0;
    let cached = 0;
    let fetched = 0;
    let failed = 0;

    // Process each team
    for (const [teamId, team] of teams) {
      completed++;
      const progress = `[${completed}/${teams.size}]`;

      try {
        process.stdout.write(`${progress} Fetching ${team.name} (${teamId})... `);

        const result = await getOrUpdateTeamStats(teamId, team.name);

        if (result.cache.games.length === 0) {
          console.log(`⚠️  NO GAMES FOUND`);
          failed++;
        } else {
          console.log(`✓ ${result.cache.games.length} games (${result.stale ? 'updated' : 'cached'})`);
          if (result.stale) {
            fetched++;
          } else {
            cached++;
          }
        }
      } catch (error) {
        console.log(`✗ FAILED - ${error.message || 'Unknown error'}`);
        failed++;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('─'.repeat(80));
    console.log('\n📊 Summary:');
    console.log(`   Total teams: ${teams.size}`);
    console.log(`   Used cache: ${cached}`);
    console.log(`   Fetched new: ${fetched}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Time: ${elapsed}s\n`);

    if (failed > 0) {
      console.log(`⚠️  Warning: ${failed} team(s) have no game data. Predictions may be limited.\n`);
    }

    console.log('✅ Pre-load complete!\n');
  } catch (error) {
    console.error('❌ Pre-load failed:', error);
    process.exit(1);
  }
}

// Run
preloadAllTeamStats()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
