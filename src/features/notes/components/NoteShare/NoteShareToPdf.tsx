import * as Print from "expo-print";
import { type ShareableNote } from "./CopyNoteToClipboard";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );

export const formatNoteAsPdfHtml = (note: ShareableNote) => {
  const title = escapeHtml(note.title.trim() || "未命名笔记");
  const content = escapeHtml(note.content?.trim() || "这篇笔记暂时没有正文。");

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      @page { margin: 54pt 50pt 48pt; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #272822;
        background: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .brand {
        margin-bottom: 24pt;
        color: #6d7f63;
        font-size: 11pt;
        font-weight: 700;
        letter-spacing: 0.8pt;
      }
      h1 {
        margin: 0;
        font-size: 24pt;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }
      .divider {
        width: 30pt;
        height: 2pt;
        margin: 16pt 0 18pt;
        border-radius: 1pt;
        background: #a9b39f;
      }
      .content {
        color: #45463f;
        font-size: 12pt;
        line-height: 1.75;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .footer {
        margin-top: 28pt;
        color: #8c8c82;
        font-size: 9pt;
        letter-spacing: 0.4pt;
      }
    </style>
  </head>
  <body>
    <div class="brand">IRisNote</div>
    <h1>${title}</h1>
    <div class="divider"></div>
    <div class="content">${content}</div>
    <div class="footer">记录此刻，留住思考</div>
  </body>
</html>`;
};

export const createNotePdfFile = async (note: ShareableNote) => {
  const { uri } = await Print.printToFileAsync({
    html: formatNoteAsPdfHtml(note),
  });

  return uri;
};
