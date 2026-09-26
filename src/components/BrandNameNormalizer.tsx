import { useEffect } from 'react';

const FROM = 'AstraDream';
const TO = 'AstroDreamer';

function replaceText(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue;
    if (value && value.includes(FROM)) node.nodeValue = value.replaceAll(FROM, TO);
  }
}

export default function BrandNameNormalizer() {
  useEffect(() => {
    document.title = document.title.includes(FROM) ? document.title.replaceAll(FROM, TO) : 'AstroDreamer';
    replaceText(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData' && record.target.nodeValue?.includes(FROM)) {
          record.target.nodeValue = record.target.nodeValue.replaceAll(FROM, TO);
        }
        for (const node of Array.from(record.addedNodes)) replaceText(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
