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

// 搜索实例类
class SearchInstance {
    constructor(keyword, site, res) {
        this.keyword = keyword;
        this.site = site;
        this.res = res;
        this.results = [];
        this.finished = false;
    }

    async run() {
        const target = this.site.startsWith("jd") ? jd : this.site.startsWith("tb") ? tb : null;
        if (!target) {
            this.res.status(400).json({ error: 'site 只支持 jd 或 taobao' });
            return;
        }
        console.log(`🔍 搜索请求：site=${this.site} keyword=${this.keyword}`);

        const streamFunc = async (results) => {
            const { event, data } = results;
            const result = data.map(r => ({ site: this.site.startsWith("jd") ? 'jd' : 'tb', ...r }));
            if (this.site.endsWith("stream")) {
                this.res.write(JSON.stringify(result) + '\n');
                if (!event) {
                    this.finished = true;
                    this.res.end();
                }
            } else {
                this.results.push(...result);
                if (!event) {
                    this.finished = true;
                    this.res.json(this.results);
                }
            }
        };

        try {
            const { browser, page } = await target.launchBrowser();
            await target.login(page);
            await target.search(page, this.keyword, streamFunc);
            await browser.close();
        } catch (e) {
            console.error('❌ 抓取失败：', e);
            this.res.status(500).json({ error: '抓取失败', detail: String(e) });
        }
    }
}

// 存储所有搜索实例，key为site，保证每个site只有一个活跃实例
const searchInstances = {};

// 存储每个站点的最新结果
let siteResults = {};

// 记录已搜索过的 site
let searchedSites = [];

// 搜索接口
app.post('/search', async (req, res) => {
    const { keyword, site } = req.body || {};
    if (!keyword) return res.status(400).json({ error: '缺少 keyword' });
    if (!site) return res.status(400).json({ error: '缺少 site（jd|taobao）' });

    // 记录 site
    if (!searchedSites.includes(site)) {
        searchedSites.push(site);
    }

    // 每个site只允许一个活跃实例，若有则先结束旧实例
    if (searchInstances[site]) {
        // 结束上一个响应，确保每个站点只有一个活跃实例，避免响应冲突
        try { searchInstances[site].res.end(); } catch { }
        delete searchInstances[site];
    }

    // 创建并存储以site为key的实例
    const instance = new SearchInstance(keyword, site, res);
    searchInstances[site] = instance;

    instance.run().finally(() => {
        if (instance.finished) {
            siteResults[site] = instance.results;
        }
        delete searchInstances[site];
    });
});

// 导出接口增强：支持合并导出多个 site
app.get('/export', async (req, res) => {
    // 支持 ?site=jd 或 ?site=taobao 或不传（导出所有已搜索过的 site）
    let sites = [];
    const querySite = req.query.site;
    if (!querySite || querySite === 'all') {
        sites = [...searchedSites];
    } else {
        sites = [querySite];
    }
    if (!sites.length) return res.status(400).send('没有可导出的站点');
    // 检查获取已完成的 site
    const finishedSites = sites.filter(site => !searchInstances[site] && siteResults[site] && siteResults[site].length);
    if (!finishedSites.length) {
        return res.status(400).send('没有已完成的站点可导出');
    }
    // 合并所有已完成 site 的数据
    const results = finishedSites.flatMap(site => siteResults[site]);

    if (!results.length) return res.status(400).send('没有数据可导出');

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

        results.forEach(r => sheet.addRow(r));

        const filename = `results_${sites.join('_')}.xlsx`;
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
