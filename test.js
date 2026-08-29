const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const dom = new JSDOM(`<!DOCTYPE html><div data-prompt-id="123"><p>Hello</p></div>`);
const p = dom.window.document.querySelector("p");
console.log(p.closest('[data-prompt-id]'));
