const puppeteer = require('puppeteer');

async function checkStorage() {
  // Launch with user data directory to see real localStorage
  const browser = await puppeteer.launch({
    headless: true,
    // This uses a fresh profile, won't see user's real data
  });
  const page = await browser.newPage();

  await page.goto('http://localhost:4000', { waitUntil: 'networkidle2' });

  const storage = await page.evaluate(() => {
    const bets = localStorage.getItem('cbb-bets');
    return {
      bets: bets ? JSON.parse(bets) : null,
      allKeys: Object.keys(localStorage)
    };
  });

  console.log('localStorage keys:', storage.allKeys);
  console.log('\ncbb-bets content:', JSON.stringify(storage.bets, null, 2));

  await browser.close();
}

checkStorage();
