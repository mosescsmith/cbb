const puppeteer = require('puppeteer');

async function debugBets() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (!msg.text().includes('DevTools') && !msg.text().includes('HMR')) {
      console.log('BROWSER:', msg.text());
    }
  });

  try {
    console.log('=== Step 1: Add test bets to localStorage ===');
    await page.goto('http://localhost:4000', { waitUntil: 'networkidle2' });

    // Add test bets directly to localStorage
    const testBets = [
      {
        id: 'test-bet-1',
        date: '11/26/25',
        time: '7:00 PM',
        betType: 'over',
        line: 140.5,
        awayTeam: 'Duke',
        homeTeam: 'Kentucky',
        half: '1st',
        toWin: 10.00,
        status: 'active',
        createdAt: new Date().toISOString()
      },
      {
        id: 'test-bet-2',
        date: '11/26/25',
        time: '8:00 PM',
        betType: 'spread',
        team: 'Kansas',
        line: -5.5,
        awayTeam: 'Kansas',
        homeTeam: 'UCLA',
        half: 'full',
        toWin: 20.00,
        status: 'active',
        createdAt: new Date().toISOString()
      },
      {
        id: 'test-bet-3',
        date: '11/25/25',
        time: '6:00 PM',
        betType: 'under',
        line: 135,
        awayTeam: 'Michigan',
        homeTeam: 'Ohio State',
        half: '1st',
        toWin: 15.00,
        status: 'won',
        settledAt: new Date().toISOString(),
        createdAt: new Date(Date.now() - 86400000).toISOString()
      }
    ];

    await page.evaluate((bets) => {
      localStorage.setItem('cbb-bets', JSON.stringify(bets));
    }, testBets);

    console.log('Added 3 test bets (2 active, 1 won)');

    // Reload the main page
    console.log('\n=== Step 2: Reload main page ===');
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    // Check localStorage after page load
    const afterMainPage = await page.evaluate(() => {
      const stored = localStorage.getItem('cbb-bets');
      return stored ? JSON.parse(stored) : [];
    });

    console.log('Bets in localStorage after main page load:', afterMainPage.length);
    afterMainPage.forEach(b => console.log(`  - ${b.id}: status=${b.status}`));

    // Go to dashboard
    console.log('\n=== Step 3: Check Bets Dashboard ===');
    await page.goto('http://localhost:4000/bets', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1500));

    const dashboardState = await page.evaluate(() => {
      const stored = localStorage.getItem('cbb-bets');
      const parsedBets = stored ? JSON.parse(stored) : [];

      // Get active tab content
      const bodyText = document.body.innerText;

      return {
        localStorageCount: parsedBets.length,
        bets: parsedBets.map(b => ({ id: b.id, status: b.status })),
        hasNoActiveBets: bodyText.includes('No active bets'),
        bodyPreview: bodyText.substring(0, 800)
      };
    });

    console.log('\nDashboard state:');
    console.log('  Total bets in localStorage:', dashboardState.localStorageCount);
    dashboardState.bets.forEach(b => console.log(`    - ${b.id}: status=${b.status}`));
    console.log('  Shows "No active bets":', dashboardState.hasNoActiveBets);

    // Check History tab
    console.log('\n=== Step 4: Check History Tab ===');
    await page.click('button:has-text("History")');
    await new Promise(r => setTimeout(r, 500));

    const historyState = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return {
        hasWonBet: bodyText.includes('Won') || bodyText.includes('Michigan'),
        bodyPreview: bodyText.substring(0, 800)
      };
    });

    console.log('History shows won bet:', historyState.hasWonBet);

    console.log('\n--- Final state ---');
    console.log('Expected: 3 bets (2 active, 1 won)');
    console.log('Actual:', dashboardState.localStorageCount, 'bets');

    if (dashboardState.localStorageCount === 3) {
      console.log('\n✅ SUCCESS: All bets preserved!');
    } else {
      console.log('\n❌ FAIL: Bets were lost!');
      console.log('\nPage preview:', dashboardState.bodyPreview);
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }

  await browser.close();
}

debugBets();
