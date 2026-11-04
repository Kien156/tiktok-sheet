// run.mjs: hỏi Google Sheet (web app TheoDoiKenh.gs) link nào cần số liệu, đọc bằng Chromium, gửi lên lại.
// Chạy trên GitHub Actions (xem .github/workflows/tiktok.yml) hoặc trên máy: GSHEET_URL=... node run.mjs
import { chromium } from 'playwright';

const URL_ = process.env.GSHEET_URL;
if (!URL_) { console.error('Thiếu GSHEET_URL (link web app kèm ?token=…)'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const res = await (await fetch(URL_)).json();
if (res.error) { console.error('Google Sheet:', res.error); process.exit(1); }
const links = res.links || [];
console.log(`Google Sheet cần ${links.length} link`);
if (!links.length) process.exit(0);

// cùng cách đọc với _tracker/tiktok_stats.mjs trên máy tính
async function readOnce(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__', { state: 'attached', timeout: 20000 });
  const isVideoPage = /\/(video|photo)\//.test(page.url());
  return page.evaluate(isVideo => {
    const d = JSON.parse(document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__').textContent);
    const n = v => Number(v ?? 0);
    if (!isVideo) {
      const u = d?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
      if (!u?.stats) return { error: 'không thấy số liệu kênh' };
      const s = u.statsV2 || u.stats;
      return { follower: n(s.followerCount), heart: n(s.heartCount ?? s.heart), videoCount: n(s.videoCount), nickname: u.user?.nickname || '' };
    }
    const it = d?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!it?.stats) return { error: 'không thấy số liệu video' };
    const s = it.statsV2 || it.stats;
    return { play: n(s.playCount), digg: n(s.diggCount), comment: n(s.commentCount), collect: n(s.collectCount), share: n(s.shareCount), createTime: n(it.createTime), desc: it.desc || '' };
  }, isVideoPage);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'ko-KR', viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const results = {};
for (const url of links) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { results[url] = await readOnce(page, url); if (!results[url].error) break; }
    catch (e) { results[url] = { error: String(e.message || e).split('\n')[0].slice(0, 120) }; }
    await sleep(4000);
  }
  console.log(results[url].error ? `  ✗ ${url}: ${results[url].error}` : `  ✓ ${url}`);
  await sleep(3000 + Math.random() * 3000);
}
await browser.close();

const out = await (await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results }) })).json();
console.log(`Đã ghi ${out.ok ?? 0}/${links.length} link lên Google Sheet`);
