const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const checkNextButton = require('./public').checkNextButton;
const getMustMatchKey = require('./public').getMustMatchKey;
const fs = require('fs');
puppeteer.use(StealthPlugin());

const COOKIES_FILE = 'taobao_cookies.json';

// 容器选择器（兼容不同版本页面）
const PRODUCT_CONTAINER_SELECTORS = [
    '#mainsrp-itemlist .items',
    '[data-spm="itemlist"] .items',
    '#content_items_wrapper',
    '.SortBar--main ~ .Container--main .items' // 兜底
];

const NEXT_PAGE_SELECTORS = '#searchCenter [class*="pagination_next"], #searchCenter .pn-next, button.next-next';

// 单个商品节点选择器（在 container 内部查询）
const ITEM_NODE_SELECTORS = [
    '.item',                      // 传统 s.taobao.com
    '.Card--doubleCardWrapper--', // 新版容器（前缀匹配，下文用 [class*] 处理）
    '[data-index]'                // 兜底
];



// 启动浏览器
async function launchBrowser() {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();

    // 常见头部伪装
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9'
    });

    return { browser, page };
}

// 登录淘宝（可选，但强烈建议）
async function login(page) {
    if (fs.existsSync(COOKIES_FILE)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));
        await page.setCookie(...cookies);
        console.log('✅ 已加载淘宝 Cookie');
    }

    // 访问淘宝首页或搜索页，触发登录态检查
    await page.goto('https://www.taobao.com', { waitUntil: 'domcontentloaded' });
    const IS_LOGIN_SELECTORS = '.site-nav-login-info-nick, .site-nav-sign a[href*="login"]';

    // 粗略判断登录：顶部“亲，请登录”
    const needLogin = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        // el 可能是“请登录”链接；如果找不到登录提示，视为可能已登录
        return !!(el && /登录/i.test(el.innerText || ''));
    }, IS_LOGIN_SELECTORS);

    if (needLogin) {
        console.log('请进行淘宝登录（二维码或账号密码），登录完成页面会有个人信息。');
        // 跳登录页（也可以直接在当前页点击登录）
        await page.goto('https://login.taobao.com', { waitUntil: 'domcontentloaded' });

        // 等待登录完成（可根据“我的淘宝”或头像等元素判断）
        await page.waitForFunction(() => {
            return !!document.querySelector('a[href*="i.taobao.com"], a[href*="buyer"]');
        }, { timeout: 0 });

        const cookies = await page.cookies();
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
        console.log('✅ 淘宝 Cookie 已保存：', COOKIES_FILE);
    } else {
        console.log('✅ 淘宝检测到已登录状态');
    }
}

// 自动滚动，触发懒加载
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise(resolve => {
            let totalHeight = 0;
            const distance = 500;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 200);
        });
    });
}

// 等待商品容器
async function waitForProductContainer(page) {
    for (const sel of PRODUCT_CONTAINER_SELECTORS) {
        try {
            const parent = await page.waitForSelector(sel, { timeout: 15000 });
            console.log('✅ 淘宝找到容器：', sel);
            return { parent, selector: sel };
        } catch (_) { }
    }
    throw new Error('❌ 淘宝未找到商品容器');
}

// 抓取本页商品
async function getProductInfo(selector, page, mustKeywords) {
    try {
        console.log('关键字:', mustKeywords);
        return await page.evaluate((sel, mustKeywords) => {
            const container = document.querySelector(sel);
            if (!container) return [];
            // 判断是 ul 还是 div 容器
            const items = sel === '#J_goodsList > ul' ? container.querySelectorAll('li') : container.children;
            return Array.from(items).map(el => ({
                shop: getValue(el, 'span[class*="shopNameText"]', { type: 'text', def: '未知店铺' }),
                product: getValue(el, '[class*="title"]', { type: 'text', def: '未知商品' }),
                price: getValue(el, '[class*="priceInt"], [class*="priceFloat"]', { type: 'text', def: '未知价格' }),
                sold: getValue(el, '[class*="realSales"]', { type: 'text', def: '已售0' }),
                link: getValue(el, 'a[href]', { type: 'attr', attr: 'href', def: '未知链接' }),

            })).filter(item => {
                // 如果传了关键字 → 去掉不包含关键字的行
                if (mustKeywords && mustKeywords.length === 0) return true;
                const text = item.product;
                return mustKeywords.every(k => text.includes(k));
            });
        }, selector, mustKeywords);
    } catch (error) {
        console.error('获取商品信息失败:', error);
        return [];
    }

}

async function search(page, keyword, func) {
    console.log(`🔍 搜索: ${keyword}`);
    const { mustKeywords, searchKeyword } = await getMustMatchKey(keyword)
    const searchUrl = 'https://s.taobao.com/search?q=' + encodeURIComponent(keyword);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ path: "./public.js" });
    console.log('点击搜索按钮，获取数据流');
    await getPerResults(page, func, mustKeywords);
    // return results;
}

async function getPerResults(page, func, mustKeywords) {
    try {
        const { selector } = await waitForProductContainer(page);
        await autoScroll(page);
        const items = await getProductInfo(selector, page, mustKeywords);
        console.log('淘宝本页抓取：', items.length);
        // 下一页
        const { hasNext, isDisabled, element: nextBtn } = await checkNextButton(page, NEXT_PAGE_SELECTORS);
        if (hasNext && !isDisabled && nextBtn) {
            console.log('找到下一页按钮，是否禁用:', isDisabled);
            await Promise.all([
                nextBtn.click(),
                // page.waitForNavigation({ waitUntil: 'networkidle2' })
            ]);
            console.log('➡️ 已点击下一页');
            func({ event: true, data: items })
            await getPerResults(page, func, mustKeywords)

        } else {
            console.log('没有找到下一页按钮或已禁用，结束抓取。');
            func({ event: false, data: items })
        }
    } catch (error) {
        console.error('获取商品信息失败:', error);
    }
}

module.exports = {
    search,
    launchBrowser,
    login
};
