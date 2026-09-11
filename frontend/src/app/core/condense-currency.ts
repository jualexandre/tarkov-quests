// Reward strings from the wiki scrape sometimes wrap the currency name in a
// link to its own wiki page (e.g. `165,000 <a href=".../wiki/Roubles"
// title="Roubles">Roubles</a>`), so a plain string replace would also mangle
// the href/title. Walking text nodes only touches the visible word.
const CURRENCY_SYMBOLS: Record<string, string> = {
  Rouble: "₽",
  Roubles: "₽",
  Dollar: "$",
  Dollars: "$",
  Euro: "€",
  Euros: "€",
};

function currencyPattern(): RegExp {
  return new RegExp(`\\b(${Object.keys(CURRENCY_SYMBOLS).join("|")})\\b`, "g");
}

export function condenseCurrency(html: string): string {
  if (typeof document === "undefined") {
    return html;
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent;
    if (text) {
      node.textContent = text.replace(currencyPattern(), (match) => CURRENCY_SYMBOLS[match]);
    }
  }
  return container.innerHTML;
}
