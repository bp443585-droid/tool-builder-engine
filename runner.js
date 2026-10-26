// runner.js
const puppeteer = require('puppeteer');

const COOKIE_STRING = process.env.GEMINI_COOKIE || '';
const CHAT_ID = process.env.GEMINI_CHAT_ID || '';

console.log("==================================================");
console.log("🔍 CHECKING SECRETS AVAILABILITY:");
console.log("1. GEMINI_COOKIE  :", COOKIE_STRING ? `Found (Length: ${COOKIE_STRING.length})` : "MISSING ❌");
console.log("2. GEMINI_CHAT_ID :", CHAT_ID ? `Found (${CHAT_ID})` : "MISSING ❌");
console.log("==================================================");

if (!COOKIE_STRING || !CHAT_ID) {
  console.error("❌ Secrets missing! GEMINI_COOKIE ya GEMINI_CHAT_ID check karo.");
  process.exit(1);
}

// Puppeteer compatible cookie format
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
        secure: true
      });
    }
  }

  return cookies;
}

async function fetchLastChatAndBlocks() {
  console.log("🚀 STARTING HEADLESS RUNNER ON GITHUB ACTIONS");
  console.log(`🔗 Target URL: https://gemini.google.com/app/${CHAT_ID}`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 1. Session Cookies Inject
  const cookies = parseCookies(COOKIE_STRING);
  console.log(`🍪 Injecting ${cookies.length} parsed cookies...`);
  await page.setCookie(...cookies);

  // 2. Chat URL par jao
  console.log("⏳ Opening Chat Thread...");
  await page.goto(`https://gemini.google.com/app/${CHAT_ID}`, {
    waitUntil: 'networkidle2',
    timeout: 90000
  });

  // Agar login redirect ho jaye
  const currentUrl = page.url();
  if (currentUrl.includes('accounts.google.com')) {
    await browser.close();
    throw new Error("❌ Session Expired ya Google Login pe redirect ho gaya! Cookies update karo.");
  }

  console.log("✅ Chat loaded successfully! Waiting for DOM elements...");

  // DOM elements render hone ka wait
  await page.waitForSelector('message-content, [data-message-author-role="model"], code-block, pre', { timeout: 30000 }).catch(() => {});

  // 3. Extract last user prompt aur 3 code blocks
  const extractedData = await page.evaluate(() => {
    // User prompt
    const userNodes = document.querySelectorAll('user-query, .user-query-container, [data-message-author-role="user"], .query-text');
    let lastPromptText = "Not Found";
    if (userNodes.length > 0) {
      lastPromptText = userNodes[userNodes.length - 1].innerText.trim();
    }

    // Model responses
    const modelTurns = document.querySelectorAll('message-content, [data-message-author-role="model"]');
    if (!modelTurns.length) {
      return { lastPrompt: lastPromptText, blocks: [] };
    }

    const latestTurn = modelTurns[modelTurns.length - 1];
    const rawBlocks = Array.from(latestTurn.querySelectorAll('code-block, pre'));

    // Nested code blocks filter
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

  // 4. Output Logs
  console.log("\n==================== [LAST USER PROMPT] ====================");
  console.log(extractedData.lastPrompt);
  console.log("============================================================\n");

  console.log(`📦 Total ${extractedData.blocks.length} Code Blocks Extracted:\n`);

  extractedData.blocks.forEach(b => {
    console.log(`==================== [BLOCK ${b.index}] ====================`);
    console.log(b.code);
    console.log("------------------------------------------------------------\n");
  });

  if (extractedData.blocks.length === 0) {
    console.warn("⚠️ Chat load hui par code blocks parse nahi hue. Check target URL.");
  } else {
    console.log("🎉 SUCCESS! All blocks captured in Git Action logs.");
  }
}

fetchLastChatAndBlocks().catch(err => {
  console.error("❌ Execution Error:", err.message);
  process.exit(1);
});
