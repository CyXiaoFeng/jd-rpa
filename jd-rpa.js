const puppeteer = require('puppeteer');

class JDSearchRPA {
    constructor() {
        this.browser = null;
        this.page = null;
        this.loginPage = null; // 添加登录页面引用
    }

    // 延时函数（替代废弃的waitForTimeout）
    async delay(time) {
        return new Promise(resolve => setTimeout(resolve, time));
    }

    // 初始化浏览器
    async init(headless = false, proxyConfig = null) {
        try {
            const launchOptions = {
                headless: headless, // 设置为false可以看到浏览器操作过程
                defaultViewport: {
                    width: 1366,
                    height: 768
                },
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-blink-features=AutomationControlled' // 隐藏自动化特征
                ]
            };

            // 如果提供了代理配置，添加代理参数
            if (proxyConfig) {
                console.log(`配置代理: ${proxyConfig.server}`);
                launchOptions.args.push(`--proxy-server=${proxyConfig.server}`);
                
                // 如果需要绕过某些域名的代理
                if (proxyConfig.bypass) {
                    launchOptions.args.push(`--proxy-bypass-list=${proxyConfig.bypass}`);
                }
            }

            this.browser = await puppeteer.launch(launchOptions);
            this.page = await this.browser.newPage();
            
            // 如果有代理认证信息，设置认证
            if (proxyConfig && proxyConfig.username && proxyConfig.password) {
                console.log('设置代理认证信息...');
                await this.page.authenticate({
                    username: proxyConfig.username,
                    password: proxyConfig.password
                });
            }
            
            // 设置用户代理，避免被识别为机器人
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // 移除自动化检测特征
            await this.page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
            });
            
            // 设置视口大小
            await this.page.setViewport({ width: 1366, height: 768 });
            
            console.log('浏览器初始化成功');
        } catch (error) {
            console.error('浏览器初始化失败:', error);
            throw error;
        }
    }

    // 打开京东首页
    async openJD() {
        try {
            console.log('正在打开京东首页...');
            await this.page.goto('https://www.jd.com', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            
            // 等待页面完全加载
            await this.delay(3000);
            
            // 检查页面是否加载成功
            const title = await this.page.title();
            console.log(`页面标题: ${title}`);
            console.log('京东首页加载完成');
        } catch (error) {
            console.error('打开京东首页失败:', error);
            throw error;
        }
    }

    // 检查是否需要登录
    async checkLoginRequired() {
        try {
            const currentUrl = this.page.url();
            const isLoginPage = currentUrl.includes('passport.jd.com') || 
                              currentUrl.includes('login') || 
                              await this.page.$('.login-form') !== null ||
                              await this.page.$('#loginname') !== null;
            
            return isLoginPage;
        } catch (error) {
            return false;
        }
    }

    // 处理登录
    async handleLogin() {
        console.log('🔐 检测到需要登录，请在浏览器中完成登录...');
        console.log('登录方式建议：');
        console.log('1. 扫码登录（推荐）');
        console.log('2. 手机验证码登录');
        console.log('3. 账号密码登录');
        
        // 保存当前登录页面的引用
        this.loginPage = this.page;
        
        // 等待用户完成登录
        let loginSuccess = false;
        let attempts = 0;
        const maxAttempts = 60; // 最多等待5分钟
        
        while (!loginSuccess && attempts < maxAttempts) {
            await this.delay(5000); // 每5秒检查一次
            attempts++;
            
            const currentUrl = this.loginPage.url();
            const isStillLoginPage = currentUrl.includes('passport.jd.com') || 
                                   currentUrl.includes('login') || 
                                   await this.loginPage.$('.login-form') !== null ||
                                   await this.loginPage.$('#loginname') !== null;
            
            if (!isStillLoginPage && !currentUrl.includes('passport.jd.com')) {
                loginSuccess = true;
                console.log('✅ 登录成功！');
            } else {
                console.log(`⏳ 等待登录中... (${attempts * 5}s/${maxAttempts * 5}s)`);
            }
        }
        
        if (!loginSuccess) {
            throw new Error('登录超时，请重新运行程序');
        }
        
        // 登录成功后在新标签页打开京东首页
        console.log('🆕 登录完成，正在新标签页打开京东首页...');
        await this.delay(2000);
        
        try {
            // 创建新标签页
            const newPage = await this.browser.newPage();
            
            // 为新页面设置相同的配置
            await newPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await newPage.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });
            });
            await newPage.setViewport({ width: 1366, height: 768 });
            
            // 在新标签页打开京东首页
            await newPage.goto('https://www.jd.com', {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            await this.delay(3000);
            
            const title = await newPage.title();
            console.log(`✅ 新标签页已打开京东首页: ${title}`);
            
            // 切换到新页面进行后续操作
            this.page = newPage;
            
            console.log('📋 当前活动页面已切换到新标签页');
            
        } catch (error) {
            console.error('⚠️ 在新标签页打开首页失败:', error.message);
            // 如果新标签页打开失败，尝试在原页面导航
            console.log('🔄 尝试在当前页面导航到首页...');
            try {
                await this.loginPage.goto('https://www.jd.com', {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
                this.page = this.loginPage;
                console.log('✅ 已在原页面返回京东首页');
            } catch (fallbackError) {
                console.error('❌ 返回首页完全失败:', fallbackError.message);
                throw fallbackError;
            }
        }
    }

    // 获取所有页面列表（调试用）
    async getAllPages() {
        const pages = await this.browser.pages();
        return pages.map((page, index) => ({
            index,
            url: page.url(),
            title: page.url()
        }));
    }

    // 关闭登录页面（可选）
    async closeLoginPage() {
        if (this.loginPage && this.loginPage !== this.page) {
            try {
                await this.loginPage.close();
                console.log('🗑️ 已关闭登录页面');
                this.loginPage = null;
            } catch (error) {
                console.log('⚠️ 关闭登录页面时出错:', error.message);
            }
        }
    }

    // 执行搜索
    async search(keyword) {
        try {
            console.log(`🔍 正在搜索关键词: ${keyword}`);
            
            // 检查是否在京东首页，如果不是则先跳转到首页
            const currentUrl = this.page.url();
            if (!currentUrl.includes('jd.com') || currentUrl.includes('search')) {
                console.log('📍 当前不在京东首页，正在跳转...');
                await this.openJD();
            }
            
            // 根据提供的HTML结构，优化搜索框选择器
            const possibleSelectors = [
                '#key',  // 主要选择器
                'input[id="key"]',
                'input.text[aria-label="搜索"]',
                'input[autocomplete="off"][accesskey="s"]',
                'input[clstag*="keycount"]',
                'input[placeholder*="搜索"]', 
                '.search-text', 
                'input[name="keyword"]'
            ];
            
            let searchSelector = null;
            
            for (const selector of possibleSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 3000, visible: true });
                    // 确保元素可见且可交互
                    const element = await this.page.$(selector);
                    const isVisible = await element.isIntersectingViewport();
                    if (isVisible) {
                        searchSelector = selector;
                        console.log(`✅ 找到搜索框: ${selector}`);
                        break;
                    }
                } catch (e) {
                    console.log(`❌ 选择器 ${selector} 未找到或不可见`);
                }
            }
            
            if (!searchSelector) {
                // 如果都没找到，尝试打印页面信息进行调试
                const pageInfo = await this.page.evaluate(() => {
                    const inputs = document.querySelectorAll('input');
                    return Array.from(inputs).map(input => ({
                        id: input.id,
                        className: input.className,
                        placeholder: input.placeholder,
                        type: input.type,
                        ariaLabel: input.getAttribute('aria-label')
                    })).slice(0, 10); // 只显示前10个input
                });
                console.log('页面上的input元素:', pageInfo);
                throw new Error('未找到搜索框，请检查页面结构');
            }
            
            // 确保搜索框在视口中可见
            await this.page.evaluate((selector) => {
                const element = document.querySelector(selector);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, searchSelector);
            
            await this.delay(1000);
            
            // 点击搜索框获得焦点
            console.log('🖱️ 点击搜索框...');
            await this.page.click(searchSelector);
            await this.delay(500);
            
            // 清空搜索框内容（多种方法确保清空成功）
            console.log('🗑️ 清空搜索框...');
            await this.page.evaluate((selector) => {
                const input = document.querySelector(selector);
                if (input) {
                    input.value = '';
                    input.focus();
                }
            }, searchSelector);
            
            // 使用键盘快捷键全选并删除（备用方法）
            await this.page.focus(searchSelector);
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('KeyA');
            await this.page.keyboard.up('Control');
            await this.page.keyboard.press('Delete');
            await this.delay(300);
            
            // 输入搜索关键词
            console.log(`⌨️ 输入关键词: ${keyword}`);
            await this.page.type(searchSelector, keyword, { delay: 120 });
            await this.delay(800);
            
            // 验证输入是否成功
            const inputValue = await this.page.evaluate((selector) => {
                const input = document.querySelector(selector);
                return input ? input.value : '';
            }, searchSelector);
            
            console.log(`✔️ 输入验证 - 当前输入框内容: "${inputValue}"`);
            
            if (inputValue !== keyword) {
                console.log('⚠️ 输入内容不匹配，重新输入...');
                await this.page.evaluate((selector, text) => {
                    const input = document.querySelector(selector);
                    if (input) {
                        input.value = text;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }, searchSelector, keyword);
                await this.delay(500);
            }
            
            // 寻找搜索按钮并点击
            console.log('🔍 寻找搜索按钮...');
            const searchButtonSelectors = [
                '.button',  // 最常见的搜索按钮
                'button.button',
                '.search-m .button',
                'button[type="submit"]', 
                '.search-btn', 
                '.btn-search',
                '.search-button',
                'input[type="submit"]'
            ];
            
            let clicked = false;
            
            for (const btnSelector of searchButtonSelectors) {
                try {
                    await this.page.waitForSelector(btnSelector, { timeout: 2000, visible: true });
                    const button = await this.page.$(btnSelector);
                    const isVisible = await button.isIntersectingViewport();
                    
                    if (isVisible) {
                        console.log(`✅ 找到搜索按钮: ${btnSelector}`);
                        await this.page.click(btnSelector);
                        clicked = true;
                        console.log('✅ 搜索按钮点击成功');
                        break;
                    }
                } catch (e) {
                    console.log(`❌ 搜索按钮选择器 ${btnSelector} 未找到`);
                }
            }
            
            // 如果没找到搜索按钮，使用回车键
            if (!clicked) {
                console.log('🔄 未找到搜索按钮，使用回车键搜索');
                await this.page.focus(searchSelector);
                await this.page.keyboard.press('Enter');
                console.log('✅ 回车键搜索完成');
            }
            
            // 等待页面响应
            console.log('⏳ 等待页面响应...');
            await this.delay(3000);
            
            // 检查是否跳转到登录页面
            if (await this.checkLoginRequired()) {
                await this.handleLogin();
                
                // 登录完成后重新执行搜索（现在已经在新标签页中了）
                console.log('🔄 登录完成，重新执行搜索...');
                return await this.search(keyword);
            }
            
            // 等待搜索结果页面加载
            console.log('📄 等待搜索结果加载...');
            try {
                await Promise.race([
                    this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
                    this.page.waitForSelector('.gl-item', { timeout: 10000 }),
                    this.page.waitForSelector('.item', { timeout: 10000 })
                ]);
                console.log('✅ 搜索结果页面加载完成');
            } catch (e) {
                console.log('⚠️ 等待导航超时，继续执行...');
                await this.delay(3000);
            }
            
            // 再次检查是否需要登录
            if (await this.checkLoginRequired()) {
                await this.handleLogin();
                // 登录后重新搜索
                return await this.search(keyword);
            }
            
            // 检查当前页面URL和标题
            const finalUrl = this.page.url();
            const title = await this.page.title();
            console.log(`📍 当前页面: ${title}`);
            console.log(`🔗 当前URL: ${finalUrl}`);
            
            console.log('✅ 搜索完成，准备解析结果...');
        } catch (error) {
            console.error('❌ 搜索失败:', error);
            throw error;
        }
    }

    // 获取商品列表
    async getProductList() {
        try {
            // 等待商品列表加载，尝试多个选择器
            const possibleItemSelectors = ['.gl-item', '.item', '.p-item', '.goods-item'];
            let itemSelector = null;
            
            for (const selector of possibleItemSelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    itemSelector = selector;
                    console.log(`找到商品列表: ${selector}`);
                    break;
                } catch (e) {
                    console.log(`选择器 ${selector} 未找到，尝试下一个...`);
                }
            }
            
            if (!itemSelector) {
                throw new Error('未找到商品列表');
            }
            
            // 滚动页面确保所有商品都加载出来
            await this.autoScroll();
            
            // 解析商品信息
            const products = await this.page.evaluate((selector) => {
                const items = document.querySelectorAll(selector);
                const productList = [];
                
                items.forEach((item, index) => {
                    try {
                        // 尝试多种选择器组合来获取商品信息
                        const titleSelectors = ['.p-name a', '.p-name', '.name', '.title', 'h3', 'h4'];
                        const priceSelectors = ['.p-price i', '.price', '.p-price', '.money'];
                        const imageSelectors = ['.p-img img', '.img img', 'img'];
                        const linkSelectors = ['.p-name a', 'a[href*="/item/"]', 'a'];
                        
                        let titleElement = null;
                        let priceElement = null;
                        let imageElement = null;
                        let linkElement = null;
                        
                        // 查找标题
                        for (const sel of titleSelectors) {
                            titleElement = item.querySelector(sel);
                            if (titleElement && titleElement.textContent.trim()) break;
                        }
                        
                        // 查找价格
                        for (const sel of priceSelectors) {
                            priceElement = item.querySelector(sel);
                            if (priceElement && priceElement.textContent.trim()) break;
                        }
                        
                        // 查找图片
                        for (const sel of imageSelectors) {
                            imageElement = item.querySelector(sel);
                            if (imageElement) break;
                        }
                        
                        // 查找链接
                        for (const sel of linkSelectors) {
                            linkElement = item.querySelector(sel);
                            if (linkElement && linkElement.href) break;
                        }
                        
                        // 其他信息
                        const commentElement = item.querySelector('.p-commit a, .comment, .review');
                        const shopElement = item.querySelector('.p-shop a, .shop, .store');
                        
                        // 只处理有效的商品项
                        if (titleElement && titleElement.textContent.trim()) {
                            const product = {
                                index: index + 1,
                                title: titleElement.textContent.trim(),
                                price: priceElement ? priceElement.textContent.trim() : '价格待询',
                                image: imageElement ? (imageElement.src || imageElement.getAttribute('data-lazy-img') || imageElement.getAttribute('data-src')) : '',
                                link: linkElement ? (linkElement.href.startsWith('http') ? linkElement.href : 'https:' + linkElement.href) : '',
                                comments: commentElement ? commentElement.textContent.trim() : '暂无评价',
                                shop: shopElement ? shopElement.textContent.trim() : '京东'
                            };
                            
                            productList.push(product);
                        }
                    } catch (itemError) {
                        console.log(`解析第${index + 1}个商品时出错:`, itemError.message);
                    }
                });
                
                return productList;
            }, itemSelector);
            
            console.log(`成功获取到 ${products.length} 个商品信息`);
            
            if (products.length === 0) {
                // 如果没有获取到商品，打印页面信息用于调试
                const pageInfo = await this.page.evaluate(() => {
                    return {
                        url: window.location.href,
                        title: document.title,
                        bodyText: document.body.textContent.substring(0, 200)
                    };
                });
                console.log('页面信息:', pageInfo);
            }
            
            return products;
            
        } catch (error) {
            console.error('获取商品列表失败:', error);
            
            // 尝试截图用于调试
            try {
                await this.page.screenshot({ path: 'debug_screenshot.png' });
                console.log('已保存调试截图: debug_screenshot.png');
            } catch (screenshotError) {
                console.log('无法保存截图:', screenshotError.message);
            }
            
            throw error;
        }
    }

    // 自动滚动页面
    async autoScroll() {
        await this.page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
        
        await this.delay(2000);
    }

    // 关闭浏览器
    async close() {
        if (this.browser) {
            // 可选：在关闭前关闭登录页面
            await this.closeLoginPage();
            
            // await this.browser.close();
            console.log('浏览器已关闭');
        }
    }

    // 主要执行方法
    async run(keyword, headless = false, proxyConfig = null) {
        try {
            await this.init(headless, proxyConfig);
            await this.openJD();
            await this.search(keyword);
            const products = await this.getProductList();
            return products;
        } catch (error) {
            console.error('RPA执行过程中出现错误:', error);
            throw error;
        } finally {
            await this.close();
        }
    }
}

// 测试代理连接的辅助函数（增强版）
async function testProxy(proxyConfig) {
    const rpa = new JDSearchRPA();
    try {
        console.log('🔧 正在测试代理连接...');
        console.log(`📡 代理服务器: ${proxyConfig.server}`);
        
        await rpa.init(false, proxyConfig);
        
        // 测试多个网站来验证代理功能
        const testUrls = [
            { url: 'https://httpbin.org/ip', name: 'IP检测' },
            { url: 'https://www.jd.com', name: '京东首页' }
        ];
        
        for (const test of testUrls) {
            try {
                console.log(`🌐 测试访问: ${test.name}...`);
                await rpa.page.goto(test.url, { timeout: 15000 });
                
                if (test.url.includes('httpbin.org')) {
                    // 获取IP信息
                    const ipInfo = await rpa.page.evaluate(() => {
                        try {
                            const pre = document.querySelector('pre');
                            return pre ? JSON.parse(pre.textContent) : { origin: '无法获取' };
                        } catch (e) {
                            return { origin: '解析失败' };
                        }
                    });
                    console.log(`✅ ${test.name} 成功 - IP: ${ipInfo.origin}`);
                } else {
                    const title = await rpa.page.title();
                    console.log(`✅ ${test.name} 成功 - 标题: ${title}`);
                }
                
                await rpa.delay(2000);
            } catch (testError) {
                console.log(`❌ ${test.name} 失败: ${testError.message}`);
            }
        }
        
        await rpa.close();
        console.log('✅ 代理测试完成');
        return true;
    } catch (error) {
        console.error('❌ 代理测试失败:', error.message);
        await rpa.close();
        return false;
    }
}

// 交互式配置选择
async function selectConfiguration() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        console.log('\n📋 请选择运行配置:');
        console.log('1. 不使用代理');
        console.log('2. 使用 V2rayN 代理 (端口6890)');
        console.log('3. 使用 Clash 代理 (端口7890)');
        console.log('4. 自定义代理配置');
        console.log('5. 测试代理连接');
        console.log('0. 退出程序');
        
        rl.question('\n请输入选项 (0-5): ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// 自定义代理配置
async function customProxyConfig() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        console.log('\n🔧 自定义代理配置:');
        
        const config = {};
        
        const questions = [
            { key: 'server', prompt: '代理服务器地址 (例: http://127.0.0.1:8080): ' },
            { key: 'username', prompt: '用户名 (可选，按回车跳过): ' },
            { key: 'password', prompt: '密码 (可选，按回车跳过): ' },
            { key: 'bypass', prompt: '绕过列表 (可选，按回车跳过): ' }
        ];
        
        let questionIndex = 0;
        
        const askNext = () => {
            if (questionIndex < questions.length) {
                const q = questions[questionIndex];
                rl.question(q.prompt, (answer) => {
                    if (answer.trim()) {
                        config[q.key] = answer.trim();
                    }
                    questionIndex++;
                    askNext();
                });
            } else {
                rl.close();
                resolve(config.server ? config : null);
            }
        };
        
        askNext();
    });
}

// 使用示例 - 增强版（包含测试和交互逻辑）
async function main() {
    try {
        console.log('🚀 京东商品搜索RPA程序');
        console.log('='.repeat(50));
        
        // 交互式选择配置
        const choice = await selectConfiguration();
        
        if (choice === '0') {
            console.log('👋 程序已退出');
            return;
        }
        
        let proxyConfig = null;
        
        // 根据选择配置代理
        switch (choice) {
            case '1':
                console.log('🌐 选择: 不使用代理');
                proxyConfig = null;
                break;
                
            case '2':
                console.log('🌐 选择: V2rayN 代理');
                proxyConfig = {
                    server: 'http://127.0.0.1:6890',
                    username: '',
                    password: '',
                    bypass: 'localhost,127.0.0.1,*.local'
                };
                break;
                
            case '3':
                console.log('🌐 选择: Clash 代理');
                proxyConfig = {
                    server: 'http://127.0.0.1:7890',
                    username: '',
                    password: '',
                    bypass: 'localhost,127.0.0.1,*.local'
                };
                break;
                
            case '4':
                console.log('🌐 选择: 自定义代理');
                proxyConfig = await customProxyConfig();
                if (!proxyConfig) {
                    console.log('⚠️ 未配置代理，将不使用代理运行');
                }
                break;
                
            case '5':
                console.log('🌐 选择: 测试代理');
                // 测试所有预设代理
                const testConfigs = [
                    { name: 'V2rayN', config: { server: 'http://127.0.0.1:6890' } },
                    { name: 'Clash', config: { server: 'http://127.0.0.1:7890' } }
                ];
                
                for (const testConfig of testConfigs) {
                    console.log(`\n🔍 测试 ${testConfig.name} 代理:`);
                    await testProxy(testConfig.config);
                }
                
                // 测试完成后重新选择
                return await main();
                
            default:
                console.log('❌ 无效选择，将不使用代理运行');
                proxyConfig = null;
        }
        
        // 如果配置了代理，先测试连接
        if (proxyConfig) {
            console.log('\n🔧 测试代理连接...');
            const proxyWorking = await testProxy(proxyConfig);
            
            if (!proxyWorking) {
                console.log('❌ 代理连接失败，是否继续？');
                const readline = require('readline');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                const continueChoice = await new Promise((resolve) => {
                    rl.question('输入 y 继续，n 退出: ', (answer) => {
                        rl.close();
                        resolve(answer.toLowerCase().trim());
                    });
                });
                
                if (continueChoice !== 'y' && continueChoice !== 'yes') {
                    console.log('👋 程序已退出');
                    return;
                }
            }
        }
        
        // 获取搜索关键词
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const searchKeyword = await new Promise((resolve) => {
            rl.question('\n🔍 请输入搜索关键词 (默认: 苹果手机): ', (answer) => {
                rl.close();
                resolve(answer.trim() || '苹果手机');
            });
        });
        
        console.log('\n' + '='.repeat(60));
        console.log('🚀 开始执行京东商品搜索RPA程序...');
        console.log(`📝 搜索关键词: ${searchKeyword}`);
        console.log(`🌐 代理配置: ${proxyConfig ? proxyConfig.server : '无代理'}`);
        console.log('💡 提示：如果弹出登录界面，请手动完成登录');
        console.log('📱 支持的登录方式：扫码登录、手机验证码、账号密码');
        console.log('🆕 注意：登录完成后将在新标签页打开京东首页进行搜索');
        console.log('='.repeat(60));
        
        // 创建RPA实例并执行搜索
        const rpa = new JDSearchRPA();
        const results = await rpa.run(searchKeyword, false, proxyConfig);
        
        console.log('='.repeat(60));
        console.log(`📊 搜索结果 (共找到 ${results.length} 个商品):`);
        console.log('='.repeat(60));
        
        // 打印结果
        if (results.length > 0) {
            results.forEach((product, index) => {
                console.log(`\n${index + 1}. ${product.title}`);
                console.log(`   💰 价格: ${product.price}`);
                console.log(`   🏪 店铺: ${product.shop}`);
                console.log(`   💬 评价: ${product.comments}`);
                console.log(`   🔗 链接: ${product.link}`);
                console.log('-'.repeat(80));
            });
            
            // 保存结果到文件
            const fs = require('fs');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `jd_search_${searchKeyword.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_')}_${timestamp}.json`;
            
            const saveData = {
                searchKeyword: searchKeyword,
                timestamp: new Date().toISOString(),
                proxyUsed: proxyConfig ? proxyConfig.server : null,
                totalCount: results.length,
                products: results
            };
            
            fs.writeFileSync(fileName, JSON.stringify(saveData, null, 2), 'utf8');
            console.log(`\n✅ 结果已保存到文件: ${fileName}`);
            
            // 询问是否继续搜索
            const rl2 = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const continueSearch = await new Promise((resolve) => {
                rl2.question('\n🔄 是否继续搜索其他关键词？(y/n): ', (answer) => {
                    rl2.close();
                    resolve(answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes');
                });
            });
            
            if (continueSearch) {
                await main();
            }
            
        } else {
            console.log('❌ 未找到相关商品，可能原因：');
            console.log('1. 搜索关键词过于具体或拼写错误');
            console.log('2. 页面结构发生变化，需要更新选择器');
            console.log('3. 需要登录但未完成登录过程');
            console.log('4. 网络连接或代理配置问题');
            console.log('5. 京东反爬虫机制触发');
            
            // 建议重试
            const rl3 = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const retry = await new Promise((resolve) => {
                rl3.question('\n🔄 是否重试？(y/n): ', (answer) => {
                    rl3.close();
                    resolve(answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes');
                });
            });
            
            if (retry) {
                await main();
            }
        }
        
    } catch (error) {
        console.error('❌ 程序执行失败:', error.message);
        console.log('\n🛠️ 故障排除建议：');
        console.log('1. 检查网络连接和代理设置是否正常');
        console.log('2. 确保代理服务器正在运行');
        console.log('3. 验证代理认证信息是否正确');
        console.log('4. 尝试禁用代理重新运行');
        console.log('5. 检查防火墙和安全软件设置');
        console.log('6. 更新Chrome浏览器到最新版本');
        console.log('7. 检查是否有其他程序占用相关端口');
        
        // 询问是否重新开始
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        const restart = await new Promise((resolve) => {
            rl.question('\n🔄 是否重新开始？(y/n): ', (answer) => {
                rl.close();
                resolve(answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes');
            });
        });
        
        if (restart) {
            await main();
        }
    }
}

// 代理配置示例和说明
function getProxyExamples() {
    return {
        // HTTP代理示例
        http: {
            server: 'http://127.0.0.1:8080',
            username: '',
            password: ''
        },
        
        // SOCKS5代理示例  
        socks5: {
            server: 'socks5://127.0.0.1:1080',
            username: 'proxyuser',
            password: 'proxypass'
        },
        
        // Clash代理示例（默认端口）
        clash: {
            server: 'http://127.0.0.1:7890',
            username: '',
            password: ''
        },
        
        // V2rayN代理示例（端口6890）
        v2rayN: {
            server: 'http://127.0.0.1:6890',  // V2rayN默认HTTP代理端口
            username: '',  // 不需要认证
            password: ''
        },
        
        // 企业代理示例（需要认证）
        corporate: {
            server: 'http://proxy.company.com:8080',
            username: 'domain\\username',
            password: 'password'
        }
    };
}

// 测试代理连接的辅助函数（增强版）
async function testProxy(proxyConfig) {
    const rpa = new JDSearchRPA();
    try {
        console.log('🔧 正在测试代理连接...');
        console.log(`📡 代理服务器: ${proxyConfig.server}`);
        
        await rpa.init(false, proxyConfig);
        
        // 测试多个网站来验证代理功能
        const testUrls = [
            { url: 'https://httpbin.org/ip', name: 'IP检测' },
            { url: 'https://www.jd.com', name: '京东首页' }
        ];
        
        for (const test of testUrls) {
            try {
                console.log(`🌐 测试访问: ${test.name}...`);
                await rpa.page.goto(test.url, { timeout: 15000 });
                
                if (test.url.includes('httpbin.org')) {
                    // 获取IP信息
                    const ipInfo = await rpa.page.evaluate(() => {
                        try {
                            const pre = document.querySelector('pre');
                            return pre ? JSON.parse(pre.textContent) : { origin: '无法获取' };
                        } catch (e) {
                            return { origin: '解析失败' };
                        }
                    });
                    console.log(`✅ ${test.name} 成功 - IP: ${ipInfo.origin}`);
                } else {
                    const title = await rpa.page.title();
                    console.log(`✅ ${test.name} 成功 - 标题: ${title}`);
                }
                
                await rpa.delay(2000);
            } catch (testError) {
                console.log(`❌ ${test.name} 失败: ${testError.message}`);
            }
        }
        
        await rpa.close();
        console.log('✅ 代理测试完成');
        return true;
    } catch (error) {
        console.error('❌ 代理测试失败:', error.message);
        await rpa.close();
        return false;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = JDSearchRPA;