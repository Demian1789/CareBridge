// Presentation only: keep clinical facts while hiding old debug prefixes and raw Markdown markers.
(function (root) {
  function assistantText(value) {
    let text=String(value??'').trim();
    text=text.replace(/^(?:工具执行[：:][^\n]*(?:\n|$)\s*)+/u,'');
    text=text.replace(/^(?:以下(?:整理|内容|总结|回复)[^\n]*(?:浏览器|快照)[^\n]*(?:\n|$)\s*)/u,'');
    text=text.replace(/[（(](?:快照时间|固定快照|演示快照)[^）)\n]*[）)]/gu,'');
    text=text.replace(/\*\*([^]*?)\*\*/g,'$1').replace(/__([^]*?)__/g,'$1');
    text=text.replace(/^#{1,6}[ \t]+/gm,'');
    return text.trim();
  }
  root.CareBridgeChatText={assistantText};
  if(typeof module!=='undefined')module.exports=root.CareBridgeChatText;
})(typeof window!=='undefined'?window:globalThis);
