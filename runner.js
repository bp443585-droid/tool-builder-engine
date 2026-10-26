// runner.js
const puppeteer = require('puppeteer');

const COOKIE_STRING = process.env.GEMINI_COOKIE || '';
const CHAT_ID = process.env.GEMINI_CHAT_ID || '';

if (!COOKIE_STRING || !CHAT_ID) {
  console.error("❌ GEMINI_COOKIE ya GEMINI_CHAT_ID secret gayab hai! Check GitHub Secrets.");
  process.exit(1);
}

// Cookie string ko Puppeteer cookie objects me todna
function parseCookies(rawCookieStr, domain) {
  return rawCookieStr
    .split(';')
    .map(c => c.trim())
    .filter(Boolean)
    .map(pair => {
      const idx = pair.indexOf('=');
      const name = idx > -1 ? pair.slice(0, idx).trim() : pair;
      const value = idx > -1 ? pair.slice(idx + 1).trim() : '';
      return {
        name,
        value,
        domain: domain,
        path: '/',
        secure: true,
        httpOnly: name.startsWith('__Secure')
      };
    });
}

async function fetchLastChatAndBlocks() {
  console.log("==================================================");
  console.log("🚀 STARTING HEADLESS RUNNER ON GITHUB ACTIONS");
  console.log(`🔗 Target Chat URL: https://gemini.google.com/app/${CHAT_ID}`);
  console.log("==================================================");

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 1. Session Cookies Inject Karo
  const cookies = parseCookies(COOKIE_STRING, '.google.com');
  await page.setCookie(...cookies);

  // 2. Chat URL par jao
  console.log("⏳ Opening Chat Thread...");
  await page.goto(`https://gemini.google.com/app/${CHAT_ID}`, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Check karo ki login redirect toh nahi ho gaya
  const currentUrl = page.url();
  if (currentUrl.includes('accounts.google.com')) {
    await browser.close();
    throw new Error("❌ Session Expired ya Google Login pe redirect ho gaya! Cookies update karo.");
  }

  console.log("✅ Chat loaded successfully! Parsing DOM elements...");

  // 3. Last prompt aur code blocks extract karo
  const extractedData = await page.evaluate(() => {
    // Last user prompt
    const userNodes = document.querySelectorAll('user-query, .user-query-container, [data-message-author-role="user"], .query-text');
    let lastPromptText = "Not Found";
    if (userNodes.length > 0) {
      lastPromptText = userNodes[userNodes.length - 1].innerText.trim();
    }

    // Latest model response ke blocks
    const modelTurns = document.querySelectorAll('message-content, [data-message-author-role="model"]');
    if (!modelTurns.length) {
      return { lastPrompt: lastPromptText, blocks: [] };
    }

    const latestTurn = modelTurns[modelTurns.length - 1];
    const rawBlocks = Array.from(latestTurn.querySelectorAll('code-block, pre'));

    const uniqueBlocks = [];
    rawBlocks.forEach(b => {
      if (!uniqueBlocks.some(parent => parent.contains(b))) {
        uniqueBlocks.push(b);
      }
    });

    const parsedBlocks = uniqueBlocks.map((blk, idx) => {
      const codeTag = blk.querySelector('pre, code') || blk;
      return {
        index: idx + 1,
        code: codeTag.innerText.trim()
      };
    });

    return {
      lastPrompt: lastPromptText,
      blocks: parsedBlocks
    };
  });

  await browser.close();

  // 4. Output Logs me Print Karo
  console.log("\n==================== [LAST USER PROMPT] ====================");
  console.log(extractedData.lastPrompt);
  console.log("============================================================\n");

  console.log(`📦 Total ${extractedData.blocks.length} Code Blocks Mile:\n`);

  extractedData.blocks.forEach(b => {
    console.log(`==================== [BLOCK ${b.index}] ====================`);
    console.log(b.code);
    console.log("------------------------------------------------------------\n");
  });

  if (extractedData.blocks.length === 0) {
    console.warn("⚠️ Koi code block parse nahi hua. Chat load checking needed.");
  } else {
    console.log("🎉 Successfully fetched prompt and all code blocks without sending anything!");
  }
}

fetchLastChatAndBlocks().catch(err => {
  console.error("❌ Execution Error:", err.message);
  process.exit(1);
});
