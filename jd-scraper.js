const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const checkNextButton = require('./public').checkNextButton;
const getMustMatchKey = require('./public').getMustMatchKey;
const fs = require('fs');

puppeteer.use(StealthPlugin());

const COOKIES_FILE = 'jd_cookies.json';

// 商品容器选择器
const PRODUCT_CONTAINER_SELECTORS = [
    '#J_goodsList > ul',
    '#searchCenter .plugin_goodsContainer'
];
// 翻页按钮选择器
const NEXT_PAGE_SELECTORS = '#searchCenter [class*="pagination_next"], #searchCenter .pn-next';

let MUST_MATCH = undefined
// 等待商品容器出现
async function waitForProductContainer(page) {
    for (const sel of PRODUCT_CONTAINER_SELECTORS) {
        try {
            const parent = await page.waitForSelector(sel, { timeout: 10000 });
            console.log('✅ 找到容器:', sel);
            return { parent, selector: sel };
        } catch (e) { }
    }
    throw new Error('❌ 没找到商品容器');
}

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

// 登录京东
async function login(page) {
    if (fs.existsSync(COOKIES_FILE)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));
        await page.setCookie(...cookies);
        console.log("✅ 已加载本地 Cookie");
    }

    await page.goto('https://www.jd.com', { waitUntil: 'networkidle2' });
    const IS_LOGIN_SELECTORS = '[id^="ttbar-login"] .nickname'
    const isLoggedIn = await page.evaluate((sel) => !!document.querySelector(sel), IS_LOGIN_SELECTORS);

    if (!isLoggedIn) {
        console.log("请手动扫码登录...");
        await page.waitForFunction(
            (sel) => !!document.querySelector(sel),
            { timeout: 0 },
            IS_LOGIN_SELECTORS
        );
        console.log("登录成功，保存 Cookie...");
        await saveCookies(page);
    } else {
        console.log("✅ 已检测到登录状态");
    }
}

// 保存 Cookie
async function saveCookies(page) {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log("✅ Cookie 已保存到 jd_cookies.json");
}

// 自动滚动页面
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

// 获取商品信息
async function getProductInfo(selector, page, mustKeywords) {
    try {
        const hasFunc = await page.evaluate(() => typeof getValue === 'function');
        console.log('关键字:', mustKeywords);
        if (!hasFunc)
            await page.addScriptTag({ path: "public.js" });
         return await page.evaluate((sel, mustKeywords) => {
            const container = document.querySelector(sel);
            if (!container) return [];
            
            // 判断是 ul 还是 div 容器
            const items = sel === '#J_goodsList > ul' ? container.querySelectorAll('li') : container.children;
            return Array.from(items)
                .map(el => ({
                    shop: getValue(el, '[class*="shop"]', { type: 'text', def: '未知店铺' }),
                    product: getValue(el, '[class*="name"], div._goods_title_container_1x4i2_1 span', { type: 'text', def: '未知商品' }),
                    price: getValue(el, '[class*="price"], div._container_1tn4o_1 span', { type: 'text', def: '未知价格' }),
                    sold: getValue(el, '[class*="commit"], div._goods_volume_container_1xkku_1 span span:nth-child(1)', { type: 'text', def: '已售0' }),
                    link: getValue(el, 'a[href*="//item.jd.com"]', { type: 'attr', attr: 'href', def: '未知链接' }),
                }))
                .filter(item => {
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
// 搜索关键词
async function search(page, keyword, func) {
    console.log(`🔍 搜索: ${keyword}`);
    const {mustKeywords,searchKeyword} = await getMustMatchKey(keyword)
    await page.type('#key', searchKeyword);
    await page.evaluate(() => document.querySelector('.button').click());
    console.log('点击搜索按钮，获取数据流');
    await getPerResults(page,func, mustKeywords);
}

async function getPerResults(page,func, mustKeywords) {
    try {
        const { selector } = await waitForProductContainer(page);
        console.log(`当前使用 selector: ${selector}`);
        await autoScroll(page);
        const productInfo = await getProductInfo(selector, page, mustKeywords);
        console.log(`本页抓取 ${productInfo.length} 条`);
        const { hasNext, isDisabled, element: nextBtn } = await checkNextButton(page, NEXT_PAGE_SELECTORS);
        if (hasNext && !isDisabled && nextBtn) {
            console.log('找到下一页按钮，是否禁用:', isDisabled);
                await Promise.all([
                    nextBtn.click(),
                ]);
                console.log('➡️ 已点击下一页');
                func({event:true,data:productInfo})
                await getPerResults(page,func, mustKeywords)
           
        } else {
            console.log('没有找到下一页按钮或已禁用，结束抓取。');
            func({event:false,data:productInfo})
            
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