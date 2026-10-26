// runner.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const rawSecret = (process.env.GEMINI_COOKIE || '').trim();
const CHAT_ID = (process.env.GEMINI_CHAT_ID || '48f365e996ea2be2').trim();

// Hardcoded verified cookies (Secret fail hone par backup)
const BACKUP_COOKIES = [
  {
    name: "__Secure-1PSID",
    value: "g.a000Dgma42LH0iSEEXV1Sfbhruae_8dObEIvZCt6CcwTczV6LPhAZFsVQDCE4ILWHIh8F2XXJQACgYKAQkSARUSFQHGX2MiyHmIB-NLaeGExXz_4HPgfhoVAUF8yKoYwNYZyKRpIE4ZcDX_bQRr0076",
    domain: ".google.com",
    path: "/"
  },
  {
    name: "__Secure-1PSIDTS",
    value: "sidts-CjcBkldj_2HWOnywj3ZqpCvkupmxuTKhifCMq3G2HbvRJz_RE5CeROppMgYYxtzP2wWWNBHcCZAhEAA",
    domain: ".google.com",
    path: "/"
  },
  {
    name: "_ga",
    value: "GA1.1.2024299887.1746605593",
    domain: ".google.com",
    path: "/"
  },
  {
    name: "SEARCH_SAMESITE",
    value: "CgQI3aEB",
    domain: ".google.com",
    path: "/"
  },
  {
    name: "APISID",
    value: "hdg82nnBYG-i4TNJ/A-n7o3unF04XRPK5e",
    domain: ".google.com",
    path: "/"
  },
  {
    name: "SAPISID",
    value: "ekFydVJ1tkw_FDbL/AsodOayhViW_VqgPT",
    domain: ".google.com",
    path: "/"
  },
  {
    name: "__Secure-1PAPISID",
    value: "ekFydVJ1tkw_FDbL/AsodOayhViW_VqgPT",
    domain: ".google.com",
    path: "/"
  },
  {
    name: "__Secure-3PAPISID",
    value: "ekFydVJ1tkw_FDbL/AsodOayhViW_VqgPT",
    domain: ".google.com",
    path: "/"
  },
  {
    name: "SID",
    value: "g.a000Dgma42LH0iSEEXV1Sfbhruae_8dObElvZCt6CcwTczV6LPhaNAJLXxn73eqi29IgkYvfaQACgYKARESARUSFQHGX2Mi_1Uwog2anlp_3wF1lPiznBoVAUF8yKpZ_KXOHmvTjg1q8XVAutLZ0076",
    domain: ".google.com",
    path: "/"
  },
  {
    name: "SIDCC",
    value: "APD_SKHrywNHU5RURu2sV9R5Ka6Dj5ZoqfkQ4szYrrS2qBqvc4x0Ld8M27dBXqjETkHuEbahKhY",
    domain: ".google.com",
    path: "/"
  }
];

function resolveCookies() {
  console.log(`🔍 Raw Secret Length: ${rawSecret.length}`);
  if (rawSecret.length > 0) {
    console.log(`🔍 Raw Secret Preview: "${rawSecret.slice(0, 25)}..."`);
  }

  // 1. Try Base64 decode
  try {
    const decoded = Buffer.from(rawSecret, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log(`✅ Loaded ${parsed.length} cookies from Base64 Secret.`);
      return parsed.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
        path: c.path || '/'
      }));
    }
  } catch (e) {}

  // 2. Try Direct JSON
  try {
    const parsed = JSON.parse(rawSecret);
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log(`✅ Loaded ${parsed.length} cookies from raw JSON Secret.`);
      return parsed.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
        path: c.path || '/'
      }));
    }
  } catch (e) {}

  // 3. Fallback to hardcoded array
  console.log(`⚠️ Secret parse nahi hua, using backup array (${BACKUP_COOKIES.length} cookies)...`);
  return BACKUP_COOKIES;
}

async function executePuppeteerEngine() {
  const cookies = resolveCookies();
  console.log(`🍪 Injecting ${cookies.length} session cookies into Chromium...`);

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

  for (const c of cookies) {
    try {
      await page.setCookie(c);
    } catch (e) {}
  }

  console.log("⏳ Checking Google Session at base URL...");
  await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2', timeout: 60000 });
  const rootTitle = await page.title();
  console.log(`🏠 Base Title: "${rootTitle}"`);

  const targetUrl = `https://gemini.google.com/app/${CHAT_ID}`;
  console.log(`🔗 Navigating to target chat: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  await new Promise(r => setTimeout(r, 12000));

  const pageTitle = await page.title();
  console.log(`📄 Chat Page Title: "${pageTitle}"`);
  console.log(`🌐 Final URL: ${page.url()}`);

  if (pageTitle.includes('404') || page.url().includes('accounts.google.com')) {
    await browser.close();
    throw new Error("❌ Session Fail: 404 ya login redirect.");
  }

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

  console.log(`\n🎉 Total ${results.blocks.length} Blocks Captured!\n`);
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
