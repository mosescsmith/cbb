// Parse and analyze bet history

const betData = `11/26/25
2:52 PM
Loss - Single
South Florida - 1H -0.5 (-105)
Virginia Commonwealth @ South Florida
11/26/25
2:52 PM
Win - Single
Under - 1H 71.5 (-115)
Southern Indiana @ Valparaiso
11/26/25
2:20 PM
Loss - Single
Fairleigh Dickinson - 1H -2.5 (-115)
Army @ Fairleigh Dickinson
11/26/25
2:20 PM
Win - Single
Under - 1H 72.0 (-110)
Army @ Fairleigh Dickinson
11/26/25
1:52 PM
Win - Single
Over - 1H 71.5 (-105)
NC Greensboro @ Miami Ohio
11/26/25
1:52 PM
Loss - Single
Miami Ohio - 1H -5.5 (-115)
NC Greensboro @ Miami Ohio
11/26/25
1:50 PM
Win - Single
Robert Morris - 1H +0.5 (-115)
Illinois Chicago @ Robert Morris
11/26/25
1:49 PM
Loss - Single
San Jose State - 1H +0.5 (-120)
Loyola Chicago @ San Jose State
11/26/25
1:16 PM
Win - Single
Under - 1H 77.5 (-115)
Belmont @ Toledo
11/26/25
1:07 PM
Loss - Single
Under - 1H 69.5 (-110)
Buffalo @ Bucknell
11/26/25
12:59 PM
Win - Single
New Orleans - 1H +16.5 (-110)
New Orleans @ Texas Tech (#20)
11/26/25
12:53 PM
Push - Single
Over - 1H 69.0 (-105)
Syracuse @ Iowa State (#15)
11/26/25
12:48 PM
Loss - Single
Over - 1H 63.5 (-110)
Brown @ New Hampshire
11/25/25
6:49 PM
Win - Single
Over - 1H 69.5 (-115)
Old Dominion @ Villanova
11/25/25
6:48 PM
Win - Single
Marist - 1H -4.0 (-115)
Lehigh @ Marist
11/25/25
6:48 PM
Win - Single
Under - 1H 66.0 (-105)
Coppin State @ Rider
11/25/25
6:47 PM
Loss - Single
Under - 1H 70.0 (-110)
Chicago State @ IPFW
11/25/25
6:44 PM
Loss - Single
Bellarmine - 1H +1.5 (-115)
Houston Christian @ Bellarmine
11/25/25
6:44 PM
Loss - Single
Under - 1H 68.5 (-110)
Houston Christian @ Bellarmine
11/25/25
6:43 PM
Win - Single
Over - 1H 73.0 (-110)
Nebraska Omaha @ James Madison
11/25/25
6:30 PM
Win - Single
Under - 1H 77.0 (-110)
Tennessee State @ NC Asheville
11/25/25
6:20 PM
Win - Single
Over - 1H 71.5 (-110)
Mount St. Mary's MD @ Ohio State
11/25/25
6:18 PM
Loss - Single
Bradley - 2H -3.5 (-105)
UC San Diego @ Bradley
11/25/25
5:55 PM
Win - Single
Over - 1H 63.0 (-115)
Tennessee (#17) @ Houston (#3)
11/25/25
5:54 PM
Win - Single
St. Bonaventure - 1H +6.0 (-105)
St. Bonaventure @ North Carolina (#16)
11/25/25
4:58 PM
Loss - Single
Over - 1H 70.5 (-105)
McNeese State @ Middle Tennessee State
11/25/25
4:48 PM
Loss - Single
Syracuse - 2H +1.0 (-110)
Kansas @ Syracuse
11/25/25
4:28 PM
Win - Single
Over - 1H 76.0 (-115)
Baylor @ St. John's (#5)
11/25/25
4:21 PM
Win - Single
Oral Roberts - 1H +4.5 (-110)
Oral Roberts @ Kennesaw State
11/25/25
4:04 PM
Loss - Single
Boise State - 2H +2.0 (-105)
NC State (#23) @ Boise State
11/25/25
3:25 PM
Win - Single
Kansas - 1H -2.5 (-115)
Syracuse @ Kansas
11/25/25
11:46 AM
Win - Single
Over - 1H 64.5 (-110)
Towson @ Liberty
11/25/25
11:46 AM
Loss - Single
Liberty - 1H -3.0 (-120)
Towson @ Liberty
11/24/25
9:08 PM
Loss - Single
Oregon +2.5 (-120)
Auburn (#21) @ Oregon
11/24/25
6:15 PM
Loss - Single
USC - 2H -1.5 (-110)
USC @ Boise State
11/24/25
5:24 PM
Win - Single
Under - 2H 82.0 (-110)
UTEP @ William & Mary
11/23/25
6:34 PM
Loss - Single
New Orleans Saints +5.5 (-120)
Atlanta Falcons @ New Orleans Saints
11/25/25
12:59 PM
Loss - Single
Liberty - 2H -2.5 (-110)
Towson @ Liberty
11/25/25
12:59 PM
Loss - Single
Over - 2H 70.5 (-120)
Towson @ Liberty
11/25/25
1:01 PM
Loss - Single
Over - 1H 64.0 (-110)
Jacksonville @ Pacific`;

// Parse the bets
function parseBets(data) {
  const lines = data.split('\n').map(l => l.trim()).filter(l => l);
  const bets = [];

  let i = 0;
  while (i < lines.length) {
    // Look for date pattern
    const dateMatch = lines[i]?.match(/^(\d{1,2}\/\d{1,2}\/\d{2})$/);
    if (!dateMatch) {
      i++;
      continue;
    }

    const date = dateMatch[1];
    i++;

    // Time
    const time = lines[i] || '';
    i++;

    // Result line: "Win - Single", "Loss - Single", "Push - Single"
    const resultLine = lines[i] || '';
    if (!resultLine.includes('Win') && !resultLine.includes('Loss') && !resultLine.includes('Push')) {
      continue;
    }

    let result = 'unknown';
    if (resultLine.includes('Win')) result = 'won';
    else if (resultLine.includes('Loss')) result = 'lost';
    else if (resultLine.includes('Push')) result = 'push';
    i++;

    // Bet details line
    const betLine = lines[i] || '';
    i++;

    // Matchup line
    const matchup = lines[i] || '';
    i++;

    // Parse bet type
    let betType = 'unknown';
    let half = 'unknown';
    let line = 0;

    if (betLine.includes('Over')) {
      betType = 'over';
      const lineMatch = betLine.match(/Over.*?(\d+\.?\d*)/);
      if (lineMatch) line = parseFloat(lineMatch[1]);
    } else if (betLine.includes('Under')) {
      betType = 'under';
      const lineMatch = betLine.match(/Under.*?(\d+\.?\d*)/);
      if (lineMatch) line = parseFloat(lineMatch[1]);
    } else {
      betType = 'spread';
      const lineMatch = betLine.match(/([+-]?\d+\.?\d*)\s*\(/);
      if (lineMatch) line = parseFloat(lineMatch[1]);
    }

    if (betLine.includes('1H')) half = '1st';
    else if (betLine.includes('2H')) half = '2nd';
    else half = 'full';

    bets.push({
      date,
      time,
      result,
      betType,
      half,
      line,
      betLine,
      matchup
    });
  }

  return bets;
}

const bets = parseBets(betData);

// Filter to only CBB bets (exclude NFL)
const cbbBets = bets.filter(b => !b.matchup.includes('Saints') && !b.matchup.includes('Falcons'));

console.log('='.repeat(60));
console.log('CBB BET ANALYSIS');
console.log('='.repeat(60));
console.log(`Total CBB bets: ${cbbBets.length}`);
console.log();

// Overall stats
const won = cbbBets.filter(b => b.result === 'won').length;
const lost = cbbBets.filter(b => b.result === 'lost').length;
const push = cbbBets.filter(b => b.result === 'push').length;
const winRate = ((won / (won + lost)) * 100).toFixed(1);

console.log('OVERALL RECORD');
console.log('-'.repeat(40));
console.log(`Record: ${won}W - ${lost}L - ${push}P`);
console.log(`Win Rate: ${winRate}%`);
console.log();

// By bet type
console.log('BY BET TYPE');
console.log('-'.repeat(40));

const byType = {
  over: cbbBets.filter(b => b.betType === 'over'),
  under: cbbBets.filter(b => b.betType === 'under'),
  spread: cbbBets.filter(b => b.betType === 'spread'),
};

for (const [type, typeBets] of Object.entries(byType)) {
  const w = typeBets.filter(b => b.result === 'won').length;
  const l = typeBets.filter(b => b.result === 'lost').length;
  const p = typeBets.filter(b => b.result === 'push').length;
  const rate = w + l > 0 ? ((w / (w + l)) * 100).toFixed(1) : 'N/A';
  console.log(`${type.toUpperCase().padEnd(8)}: ${w}W-${l}L-${p}P (${rate}%)`);
}
console.log();

// By half
console.log('BY GAME PERIOD');
console.log('-'.repeat(40));

const byHalf = {
  '1st': cbbBets.filter(b => b.half === '1st'),
  '2nd': cbbBets.filter(b => b.half === '2nd'),
  'full': cbbBets.filter(b => b.half === 'full'),
};

for (const [half, halfBets] of Object.entries(byHalf)) {
  const w = halfBets.filter(b => b.result === 'won').length;
  const l = halfBets.filter(b => b.result === 'lost').length;
  const p = halfBets.filter(b => b.result === 'push').length;
  const rate = w + l > 0 ? ((w / (w + l)) * 100).toFixed(1) : 'N/A';
  console.log(`${half.padEnd(8)}: ${w}W-${l}L-${p}P (${rate}%)`);
}
console.log();

// 1st Half breakdown by type
console.log('1ST HALF BREAKDOWN');
console.log('-'.repeat(40));

const firstHalf = cbbBets.filter(b => b.half === '1st');
const fhOver = firstHalf.filter(b => b.betType === 'over');
const fhUnder = firstHalf.filter(b => b.betType === 'under');
const fhSpread = firstHalf.filter(b => b.betType === 'spread');

for (const [name, bets] of [['1H Overs', fhOver], ['1H Unders', fhUnder], ['1H Spreads', fhSpread]]) {
  const w = bets.filter(b => b.result === 'won').length;
  const l = bets.filter(b => b.result === 'lost').length;
  const p = bets.filter(b => b.result === 'push').length;
  const rate = w + l > 0 ? ((w / (w + l)) * 100).toFixed(1) : 'N/A';
  console.log(`${name.padEnd(12)}: ${w}W-${l}L-${p}P (${rate}%)`);
}
console.log();

// 2nd Half breakdown
console.log('2ND HALF BREAKDOWN');
console.log('-'.repeat(40));

const secondHalf = cbbBets.filter(b => b.half === '2nd');
const shOver = secondHalf.filter(b => b.betType === 'over');
const shUnder = secondHalf.filter(b => b.betType === 'under');
const shSpread = secondHalf.filter(b => b.betType === 'spread');

for (const [name, bets] of [['2H Overs', shOver], ['2H Unders', shUnder], ['2H Spreads', shSpread]]) {
  const w = bets.filter(b => b.result === 'won').length;
  const l = bets.filter(b => b.result === 'lost').length;
  const p = bets.filter(b => b.result === 'push').length;
  const rate = w + l > 0 ? ((w / (w + l)) * 100).toFixed(1) : 'N/A';
  console.log(`${name.padEnd(12)}: ${w}W-${l}L-${p}P (${rate}%)`);
}
console.log();

// Key insights
console.log('='.repeat(60));
console.log('KEY INSIGHTS');
console.log('='.repeat(60));

// Find best performing categories
const categories = [
  { name: '1H Overs', bets: fhOver },
  { name: '1H Unders', bets: fhUnder },
  { name: '1H Spreads', bets: fhSpread },
  { name: '2H Overs', bets: shOver },
  { name: '2H Unders', bets: shUnder },
  { name: '2H Spreads', bets: shSpread },
];

const withRates = categories
  .filter(c => c.bets.length >= 2)
  .map(c => {
    const w = c.bets.filter(b => b.result === 'won').length;
    const l = c.bets.filter(b => b.result === 'lost').length;
    return {
      name: c.name,
      wins: w,
      losses: l,
      total: c.bets.length,
      rate: w + l > 0 ? (w / (w + l)) * 100 : 0
    };
  })
  .sort((a, b) => b.rate - a.rate);

console.log('\nBest performing (min 2 bets):');
withRates.slice(0, 3).forEach((c, i) => {
  console.log(`  ${i + 1}. ${c.name}: ${c.rate.toFixed(1)}% (${c.wins}W-${c.losses}L)`);
});

console.log('\nWorst performing (min 2 bets):');
withRates.slice(-3).reverse().forEach((c, i) => {
  console.log(`  ${i + 1}. ${c.name}: ${c.rate.toFixed(1)}% (${c.wins}W-${c.losses}L)`);
});

// Underdog spreads vs favorite spreads
const spreadBets = cbbBets.filter(b => b.betType === 'spread');
const underdogSpreads = spreadBets.filter(b => b.line > 0);
const favoriteSpreads = spreadBets.filter(b => b.line < 0);

console.log('\nSPREAD ANALYSIS:');
const udW = underdogSpreads.filter(b => b.result === 'won').length;
const udL = underdogSpreads.filter(b => b.result === 'lost').length;
const favW = favoriteSpreads.filter(b => b.result === 'won').length;
const favL = favoriteSpreads.filter(b => b.result === 'lost').length;

console.log(`  Underdog spreads (+): ${udW}W-${udL}L (${udW + udL > 0 ? ((udW/(udW+udL))*100).toFixed(1) : 'N/A'}%)`);
console.log(`  Favorite spreads (-): ${favW}W-${favL}L (${favW + favL > 0 ? ((favW/(favW+favL))*100).toFixed(1) : 'N/A'}%)`);

// Total line analysis for O/U
const ouBets = cbbBets.filter(b => b.betType === 'over' || b.betType === 'under');
const lowLine = ouBets.filter(b => b.line < 70);
const highLine = ouBets.filter(b => b.line >= 70);

console.log('\nOVER/UNDER LINE ANALYSIS:');
const lowW = lowLine.filter(b => b.result === 'won').length;
const lowL = lowLine.filter(b => b.result === 'lost').length;
const highW = highLine.filter(b => b.result === 'won').length;
const highL = highLine.filter(b => b.result === 'lost').length;

console.log(`  Low lines (<70): ${lowW}W-${lowL}L (${lowW + lowL > 0 ? ((lowW/(lowW+lowL))*100).toFixed(1) : 'N/A'}%)`);
console.log(`  High lines (>=70): ${highW}W-${highL}L (${highW + highL > 0 ? ((highW/(highW+highL))*100).toFixed(1) : 'N/A'}%)`);
