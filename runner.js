// runner.js
const puppeteer = require('puppeteer');

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
        secure: true
      });
    }
  }
  return cookies;
}

async function fetchLastChatAndBlocks() {
  const targetUrl = `https://gemini.google.com/app/${CHAT_ID}`;
  console.log(`🔗 Target URL: ${targetUrl}`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Real browser identity emulate karna
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

  // Cookies set karo
  const cookies = parseCookies(COOKIE_STRING);
  console.log(`🍪 Injecting ${cookies.length} parsed cookies...`);
  await page.setCookie(...cookies);

  console.log("⏳ Opening Chat Thread...");
  await page.goto(targetUrl, {
    waitUntil: 'networkidle2',
    timeout: 90000
  });

  // 10 second wait taaki Angular/Lit custom elements DOM me inject ho jayein
  await new Promise(r => setTimeout(r, 10000));

  const pageTitle = await page.title();
  const currentUrl = page.url();
  console.log(`📄 Page Title: "${pageTitle}"`);
  console.log(`🌐 Final Loaded URL: ${currentUrl}`);

  // Page ka HTML structure debug karne ke liye
  const bodyTextSnippet = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log(`📝 Page Body Preview:\n${bodyTextSnippet}\n---`);

  // Target extraction
  const extractedData = await page.evaluate(() => {
    // Gemini message query containers
    const queries = Array.from(document.querySelectorAll('user-query, .user-query-container, [data-message-author-role="user"], .query-text, p'));
    const userPromptNodes = queries.filter(el => el.innerText && el.innerText.toLowerCase().includes('pdf to word'));
    
    // Code elements
    const codeTags = Array.from(document.querySelectorAll('pre, code-block, code'));
    const blocks = [];
    
    codeTags.forEach((tag, idx) => {
      const txt = tag.innerText.trim();
      // Sirf meaningful blocks uthao
      if (txt.length > 30 && !blocks.some(b => b.code.includes(txt) || txt.includes(b.code))) {
        blocks.push({
          index: blocks.length + 1,
          code: txt
        });
      }
    });

    return {
      hasTargetPrompt: userPromptNodes.length > 0,
      totalCodeElementsOnPage: codeTags.length,
      blocks: blocks
    };
  });

  await browser.close();

  console.log(`🔍 DOM Scan Result: Target Prompt Match = ${extractedData.hasTargetPrompt}, Total Code Nodes = ${extractedData.totalCodeElementsOnPage}`);
  console.log(`📦 Extracted Blocks: ${extractedData.blocks.length}\n`);

  extractedData.blocks.forEach(b => {
    console.log(`==================== [BLOCK ${b.index}] ====================`);
    console.log(b.code.slice(0, 150) + "...\n");
  });
}

fetchLastChatAndBlocks().catch(err => {
  console.error("❌ Execution Error:", err.message);
  process.exit(1);
});
