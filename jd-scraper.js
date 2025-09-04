const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
puppeteer.use(StealthPlugin());

const COOKIES_FILE = 'jd_cookies.json';

// 商品容器选择器
const PRODUCT_CONTAINER_SELECTORS = [
    '#J_goodsList > ul',
    '#searchCenter .plugin_goodsContainer'
];
// 翻页按钮选择器
const NEXT_PAGE_SELECTORS = [
    '.pn-next',
    '#searchCenter > div > div > div._wrapper_f6icl_11 > div._pagiContainer_f6icl_16 > div > div._pagination_next_1jczn_8'
];

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
    return { browser, page };
}

// 登录京东
async function loginJD(page) {
    if (fs.existsSync(COOKIES_FILE)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE));
        await page.setCookie(...cookies);
        console.log("✅ 已加载本地 Cookie");
    }

    await page.goto('https://www.jd.com', { waitUntil: 'networkidle2' });

    const isLoggedIn = await page.evaluate(() => !!document.querySelector('#ttbar-login .nickname'));

    if (!isLoggedIn) {
        console.log("请手动扫码登录...");
        await page.waitForFunction(
            () => !!document.querySelector('#ttbar-login .nickname'),
            { timeout: 0 }
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
async function getProductInfo(selector, page) {
    try {
        return await page.evaluate((sel) => {
            const container = document.querySelector(sel);
            if (!container) return [];
            // 判断是 ul 还是 div 容器
            // const getValue = (el, query, { type = 'text', attr = 'href', def = '' } = {}) =>{
            //     const node = el.querySelector(query);
            //     if (!node) return def;

            //     if (type === 'text') {
            //         return node.innerText.replace(/\n/g, '').trim();
            //     } else if (type === 'attr') {
            //         return node.getAttribute(attr) || def;
            //     }
            //     return def;
            // };
            const items = sel === '#J_goodsList > ul' ? container.querySelectorAll('li') : container.children;
            return Array.from(items).map(el => ({
                shop: getValue(el, '[class*="shop"]', { type: 'text', def: '未知店铺' }),
                product: getValue(el, '[class*="name"], div._goods_title_container_1x4i2_1 span', { type: 'text', def: '未知商品' }),
                price: getValue(el, '[class*="price"], div._container_1tn4o_1 span', { type: 'text', def: '未知价格' }),
                sold: getValue(el, '[class*="commit"], div._goods_volume_container_1xkku_1 span span:nth-child(1)', { type: 'text', def: '已售0' })
            }));
        }, selector);
    } catch (error) {
        console.error('获取商品信息失败:', error);
        return [];
    }
}

// 搜索关键词
async function searchJD(page, keyword, results) {
    console.log(`🔍 搜索: ${keyword}`);
    await page.type('#key', keyword);
    await page.evaluate(() => document.querySelector('.button').click());
    console.log('点击搜索按钮');
    await page.addScriptTag({ path: "./public.js" });
    await getResults(page, results);
    console.log(`✅ 共抓取 ${results.length} 条结果`);

}

/**
 * 检查下一页按钮状态
 * @param {puppeteer.Page} page 
 * @returns {Promise<{hasNext: boolean, isDisabled: boolean, element: puppeteer.ElementHandle|null}>}
 */
async function checkNextButton(page) {
    // 支持兼容选择器
    const nextBtnSelector = '#searchCenter [class*="pagination_next"], #searchCenter .pn-next';
    const nextBtn = await page.$(nextBtnSelector);

    if (!nextBtn) {
        return { hasNext: false, isDisabled: true, element: null };
    }

    // 判断按钮是否禁用，兼容 classList.contains 和 className.includes
    const isDisabled = await nextBtn.evaluate(btn => {
        if (btn.classList && btn.classList.contains('disabled')) return true;
        if (btn.className && btn.className.includes('disabled')) return true;
        return false;
    });

    return {
        hasNext: true,
        isDisabled,
        element: nextBtn
    };
}

// 递归抓取每一页
async function getResults(page, results) {
    try {
        const { selector } = await waitForProductContainer(page);
        console.log(`当前使用 selector: ${selector}`);
        await autoScroll(page);
        const productInfo = await getProductInfo(selector, page);
        console.log(`本页抓取 ${productInfo.length} 条`);
        results.push(...productInfo);
        const { hasNext, isDisabled, element: nextBtn } = await checkNextButton(page);
        if (hasNext && !isDisabled && nextBtn) {
            console.log('找到下一页按钮，是否禁用:', isDisabled);
            await Promise.all([
                nextBtn.click(),
                // page.waitForNavigation({ waitUntil: 'networkidle2' })
            ]);
            console.log('➡️ 已点击下一页');
            await getResults(page, results);

        } else {
            console.log('没有找到下一页按钮或已禁用，结束抓取。');
        }
    } catch (error) {
        console.error('获取商品信息失败:', error);
    }
}

module.exports = {
    searchJD,
    launchBrowser,
    loginJD
};