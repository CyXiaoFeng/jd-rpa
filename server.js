const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');

// 引入你的 JD 抓取器（保持你现有的版本即可）
const jd = require('./jd-scraper');
// 引入刚新增的淘宝抓取器
const tb = require('./taobao-scraper');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let latestResults = [];
let latestSite = '';

app.post('/search', async (req, res) => {
    const { keyword, site } = req.body || {};
    if (!keyword) return res.status(400).json({ error: '缺少 keyword' });
    if (!site) return res.status(400).json({ error: '缺少 site（jd|taobao）' });

    console.log(`🔍 搜索请求：site=${site} keyword=${keyword}`);

    const streamFunc = async (results) => {
        const { event, data } = results;
        console.log(`返回回调！${event}，条数：`, data.length);
        latestResults = data.map(r => ({ site: 'jd', ...r }));
        if (latestSite.endsWith("stream")) {
            res.write(JSON.stringify(latestResults) + '\n');
            if (!event) {
                console.log(`✅ 抓取完成：${latestResults.length} 条`);
                res.end();
            }
        } else {
            latestResults.push(...data.map(r => ({ site: latestSite.startsWith("jd") ? 'jd' : 'tb', ...r })));
            if (!event) {
                console.log(`✅ 抓取完成：${latestResults.length} 条`);
                res.json(latestResults);
            }
        }
    }

    try {
        latestResults = [];
        latestSite = site;
        const target = site.startsWith("jd") ? jd : site.startsWith("tb") ? tb : null;
        if(!target) return res.status(400).json({ error: 'site 只支持 jd 或 taobao' });
        const { browser, page } = await target.launchBrowser();
        await target.login(page);
        await target.search(page, keyword, streamFunc);
        browser.close();
    } catch (e) {
        console.error('❌ 抓取失败：', e);
        res.status(500).json({ error: '抓取失败', detail: String(e) });
    }
});

app.get('/export', async (req, res) => {
    if (!latestResults.length) return res.status(400).send('没有数据可导出');

    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('结果');

        sheet.columns = [
            { header: '站点', key: 'site', width: 10 },
            { header: '店铺', key: 'shop', width: 30 },
            { header: '商品', key: 'product', width: 60 },
            { header: '价格', key: 'price', width: 14 },
            { header: '销量', key: 'sold', width: 14 },
            { header: '链接', key: 'link', width: 50 }
        ];

        latestResults.forEach(r => sheet.addRow(r));

        const filename = `results_${latestSite || 'mix'}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (e) {
        console.error('导出失败：', e);
        res.status(500).send('导出失败');
    }
});

app.listen(3000, () => {
    console.log('✅ 服务启动： http://localhost:3000');
});
