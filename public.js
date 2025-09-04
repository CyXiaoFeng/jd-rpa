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

module.exports = {
    getValue
};