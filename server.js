const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const bodyParser = require('body-parser');
const { launchBrowser, loginJD, getResults } = require('./jd-scraper'); 
puppeteer.use(StealthPlugin());

const COOKIES_FILE = 'jd_cookies.json';
const PORT = 3000;

const app = express();
app.use(express.static(path.join(__dirname, 'public'))); // 提供静态页面
app.use(express.json()); // 支持 JSON 请求
app.use(bodyParser.urlencoded({ extended: true }));

// 搜索接口
app.post('/search', async (req, res) => {
    const { keyword } = req.body;
    if (!keyword) return res.status(400).json({ error: '请输入关键字' });

    try {
        const { browser, page } = await launchBrowser();
        await loginJD(page);
        console.log(`🔍 搜索: ${keyword}`);
        await page.type('#key', keyword);
        await page.evaluate(() => document.querySelector('.button').click());

        const results = [];
        await getResults(page, results);
        console.table(results);
        res.json(results);

        await browser.close(); // 调试时可以先注释
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.toString() });
    }
});

// 启动服务
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
