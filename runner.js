// runner.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const COOKIE_DATA = process.env.GEMINI_COOKIE || '';
const CHAT_ID = process.env.GEMINI_CHAT_ID || '';

if (!COOKIE_DATA || !CHAT_ID) {
  console.error("❌ Secrets missing! GEMINI_COOKIE ya GEMINI_CHAT_ID check karo.");
  process.exit(1);
}

// JSON ya String dono ko handle karne wala parser
function getCookiesList(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
        path: c.path || '/'
      }));
    }
  } catch (e) {
    // Agar normal string hai
    return raw.split(';').map(part => {
      const trimmed = part.trim();
      const eq = trimmed.indexOf('=');
      if (eq === -1) return null;
      return {
        name: trimmed.slice(0, eq).trim(),
        value: trimmed.slice(eq + 1).trim(),
        domain: '.google.com',
        path: '/'
      };
    }).filter(Boolean);
  }
  return [];
}

async function executePuppeteerEngine() {
  const cookies = getCookiesList(COOKIE_DATA);
  console.log(`🍪 Successfully loaded & injecting ${cookies.length} session cookies...`);

  if (cookies.length === 0) {
    throw new Error("❌ Cookies parse nahi ho payin! Secret check karo.");
  }

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

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

  // Cookies inject karo
  for (const c of cookies) {
    try {
      await page.setCookie(c);
    } catch (e) {}
  }

  // Pehle root app kholo taaki session lock ho jaye
  console.log("⏳ Authenticating Google Session at root...");
  await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2', timeout: 60000 });

  const rootTitle = await page.title();
  console.log(`🏠 Root Page Title: "${rootTitle}"`);

  // Target chat open karo
  const targetUrl = `https://gemini.google.com/app/${CHAT_ID}`;
  console.log(`🔗 Navigating to chat thread: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // DOM hydrate hone ka wait
  await new Promise(r => setTimeout(r, 12000));

  const pageTitle = await page.title();
  console.log(`📄 Chat Page Title: "${pageTitle}"`);

  if (pageTitle.includes('404') || page.url().includes('accounts.google.com')) {
    await browser.close();
    throw new Error("❌ Session Fail: 404 ya login redirect.");
  }

  // Extract blocks from latest response
  const results = await page.evaluate(() => {
    const modelTurns = document.querySelectorAll('message-content, [data-message-author-role="model"]');
    if (!modelTurns.length) return { blocks: [] };

    const latestTurn = modelTurns[modelTurns.length - 1];
    const rawBlocks = Array.from(latestTurn.querySelectorAll('code-block, pre'));

    const uniqueBlocks = [];
    rawBlocks.forEach(b => {
      if (!uniqueBlocks.some(parent => parent.contains(b))) {
        uniqueBlocks.push(b);
      }
    });

    return {
      blocks: uniqueBlocks.map((blk, idx) => ({
        blockNo: idx + 1,
        content: (blk.querySelector('pre, code') || blk).innerText.trim()
      }))
    };
  });

  await browser.close();

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
