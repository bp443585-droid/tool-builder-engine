// runner.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const COOKIE_STRING = process.env.GEMINI_COOKIE || '';
const CHAT_ID = process.env.GEMINI_CHAT_ID || '';

if (!COOKIE_STRING || !CHAT_ID) {
  console.error("❌ Secrets missing! GEMINI_COOKIE ya GEMINI_CHAT_ID check karo.");
  process.exit(1);
}

function parseCookies(rawCookieStr) {
  const cookies = [];
  const parts = rawCookieStr.split(';');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const firstEq = trimmed.indexOf('=');
    if (firstEq === -1) continue;

    const name = trimmed.substring(0, firstEq).trim();
    const value = trimmed.substring(firstEq + 1).trim();

    if (name && value) {
      cookies.push({
        name: name,
        value: value,
        domain: '.google.com',
        path: '/',
        secure: true,
        sameSite: 'None'
      });
    }
  }
  return cookies;
}

async function executePuppeteerEngine() {
  const targetUrl = `https://gemini.google.com/app/${CHAT_ID}`;
  console.log("==================================================");
  console.log("🚀 LAUNCHING STEALTH RUNNER ENGINE");
  console.log(`🔗 Target URL: ${targetUrl}`);
  console.log("==================================================");

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Browser headers & user-agent masking
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"'
  });

  // Inject session cookies
  const cookies = parseCookies(COOKIE_STRING);
  console.log(`🍪 Injecting ${cookies.length} session cookies...`);
  await page.setCookie(...cookies);

  console.log("⏳ Opening chat thread in stealth mode...");
  await page.goto(targetUrl, {
    waitUntil: 'networkidle2',
    timeout: 90000
  });

  // Check login redirection
  const currentUrl = page.url();
  const pageTitle = await page.title();
  console.log(`📄 Page Title: "${pageTitle}"`);
  console.log(`🌐 Final Loaded URL: ${currentUrl}`);

  if (currentUrl.includes('accounts.google.com') || pageTitle.includes('404')) {
    await browser.close();
    throw new Error("❌ Session Fail: Google Login redirect ya 404 ho gaya. Cookie refresh check karo.");
  }

  // DOM load wait
  console.log("⏳ Waiting for chat content to hydrate...");
  await new Promise(r => setTimeout(r, 12000));

  // Extract blocks from latest response
  const results = await page.evaluate(() => {
    // Latest model message container dhoondho
    const modelTurns = document.querySelectorAll('message-content, [data-message-author-role="model"]');
    if (!modelTurns.length) return { error: "Model responses DOM me nahi mile." };

    const latestTurn = modelTurns[modelTurns.length - 1];
    const rawBlocks = Array.from(latestTurn.querySelectorAll('code-block, pre'));

    // Filter inner nested code tags
    const uniqueBlocks = [];
    rawBlocks.forEach(b => {
      if (!uniqueBlocks.some(parent => parent.contains(b))) {
        uniqueBlocks.push(b);
      }
    });

    const parsed = uniqueBlocks.map((blk, idx) => {
      const codeTag = blk.querySelector('pre, code') || blk;
      return {
        blockNo: idx + 1,
        content: codeTag.innerText.trim()
      };
    });

    return { blocks: parsed };
  });

  await browser.close();

  if (results.error) {
    console.warn(`⚠️ ${results.error}`);
    return;
  }

  console.log(`\n🎉 Total ${results.blocks.length} Blocks Capture Ho Gaye!\n`);

  results.blocks.forEach(b => {
    console.log(`==================== [BLOCK ${b.blockNo}] ====================`);
    console.log(b.content);
    console.log("-------------------------------------------------------------\n");
  });
}

executePuppeteerEngine().catch(err => {
  console.error("❌ Process Error:", err.message);
  process.exit(1);
});
