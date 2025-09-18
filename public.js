function getValue(el, query, { type = 'text', attr = 'href', def = '' } = {}) {
    const node = el.querySelector(query);
    if (!node) return def;

    if (type === 'text') {
        return node.innerText.replace(/\n/g, '').trim();
    } else if (type === 'attr') {
        return node.getAttribute(attr) || def;
    }
    return def;
};

async function checkNextButton(page, selector) {
    // 支持兼容选择器

    const nextBtn = await page.$(selector);

    if (!nextBtn) {
        return { hasNext: false, isDisabled: true, element: null };
    }

    // 判断按钮是否禁用，兼容 classList.contains 和 className.includes
    const isDisabled = await nextBtn.evaluate(btn => {
        if(btn.disabled) return true;
        if (btn.classList && btn.classList.contains('disabled')) return true;
        if (btn.className && btn.className.includes('disabled')) return true;
        return false;
    });

    return {
        hasNext: true,
        isDisabled,
        element: nextBtn
    };
};

async function getMustMatchKey(keyword) {
    const matches = keyword.match(/\[(.*?)\]/g) || [];
    mustKeywords = matches.map(s => s.replace(/[\[\]]/g, '').trim());
    // 搜索关键词 = 去掉所有方括号
    searchKeyword = keyword.replace(/[\[\]]/g, '');
    return {mustKeywords,searchKeyword}
}

module.exports = {
    getValue,
    checkNextButton,
    getMustMatchKey
};