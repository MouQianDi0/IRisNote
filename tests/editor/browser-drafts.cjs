// npm install --prefix .expo/phase2-tools --no-save --no-package-lock playwright
// npx expo export --platform web --output-dir .expo/phase2-web-export
// node tests/editor/browser-drafts.cjs --headed --persistent [--keep-open]
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('../../.expo/phase2-tools/node_modules/playwright');
if (!process.argv.includes('--headed') || !process.argv.includes('--persistent')) {
    throw new Error('本项目浏览器验证必须同时提供 --headed --persistent');
}
const root = path.resolve(__dirname, '../../.expo', process.env.IRISNOTE_TEST_EXPORT || 'phase2-web-export');
const output = path.resolve(__dirname, '../../.expo/phase2-browser-results');
fs.mkdirSync(output, { recursive: true });
const user = { id: 900000 + Math.floor(Math.random() * 100000), email: 'draft-test@example.invalid', nickname: '草稿验证', created_at: '2026-09-08T00:00:00Z' };
const records = [];
let posts = 0;
let mode = 'accepted';
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const resolved = path.resolve(root, requested.startsWith('/_expo/') || requested.startsWith('/assets/') ? 'client' : 'server', '.' + requested);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) { res.writeHead(403).end(); return; }
    const candidates = [resolved, resolved + '.html', path.join(resolved, 'index.html')];
    if (/^\/pages\/note\/edit\/[^/]+$/.test(requested)) candidates.push(path.join(root, 'server/pages/note/edit/[id].html'));
    if (/^\/pages\/note\/[^/]+$/.test(requested)) candidates.push(path.join(root, 'server/pages/note/[id].html'));
    const file = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!file) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        'Cross-Origin-Embedder-Policy': 'credentialless', 'Cross-Origin-Opener-Policy': 'same-origin' });
    fs.createReadStream(file).pipe(res);
});

(async () => {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const origin = 'http://127.0.0.1:' + server.address().port;
    let context;
    let page;
    const errors = [];
    const checks = [];
    const launch = async () => {
        context = await chromium.launchPersistentContext(path.resolve(__dirname, '../../.expo', process.env.IRISNOTE_TEST_PROFILE || 'phase2-browser-profile'), {
            channel: 'msedge', headless: false, viewport: { width: 460, height: 900 }, slowMo: 70,
        });
        await context.route('**/*', async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (url.origin === origin) return route.continue();
            // 隔离所有外网请求，不读取真实账户、不写入真实服务器。
            const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
            if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
            if (url.pathname.endsWith('/user/profile')) return route.fulfill({ json: { user }, headers });
            if (url.pathname.endsWith('/categories')) return route.fulfill({ json: [], headers });
            if (url.pathname.endsWith('/notes') && request.method() === 'GET') return route.fulfill({ json: records, headers });
            if (url.pathname.endsWith('/notes') && request.method() === 'POST') {
                posts++;
                if (mode === 'unknown') return route.abort('failed');
                const note = { ...request.postDataJSON(), id: 8000 + posts, user_id: user.id, created_at: new Date().toISOString() };
                records.push(note);
                return route.fulfill({ status: 201, json: note, headers });
            }
            if (/\/notes\/\d+$/.test(url.pathname) && request.method() === 'PUT') {
                const id = Number(url.pathname.split('/').at(-1));
                const note = records.find((item) => item.id === id);
                if (note) { Object.assign(note, request.postDataJSON()); return route.fulfill({ json: note, headers }); }
            }
            return route.abort('blockedbyclient');
        });
        await context.addInitScript((identity) => {
            localStorage.setItem('token', 'isolated-test-token');
            localStorage.setItem('user', JSON.stringify(identity));
        }, user);
        page = context.pages()[0] || await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('dialog', (dialog) => dialog.accept());
        page.setDefaultTimeout(20000);
    };
    const check = (name) => { checks.push(name); console.log('PASS ' + name); };
    const input = (name) => page.getByRole('textbox', { name, exact: true });
    try {
        await launch();
        await page.goto(origin + '/pages/note/create');
        await input('标题').fill('二阶段可恢复草稿');
        await input('正文').fill('  第一行🙂\n第二行保留空白  ');
        await page.getByText('草稿已保存到本地', { exact: true }).waitFor();
        assert.equal(posts, 0);
        check('新建输入自动落盘且没有云端请求');
        await page.reload();
        await page.getByText('发现本地草稿', { exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, 'recovery.png'), fullPage: true });
        await page.getByRole('button', { name: '继续草稿', exact: true }).click();
        assert.equal(await input('正文').inputValue(), '  第一行🙂\n第二行保留空白  ');
        check('页面刷新恢复完整原文');
        await input('正文').fill('快速返回前的最后输入');
        await page.getByRole('button', { name: '返回', exact: true }).click();
        await page.waitForURL((url) => !url.pathname.endsWith('/create'));
        await page.goto(origin + '/pages/note/create');
        await page.getByRole('button', { name: '继续草稿', exact: true }).click();
        assert.equal(await input('正文').inputValue(), '快速返回前的最后输入');
        check('快速返回补写并恢复');
        await context.close();
        await launch();
        await page.goto(origin + '/pages/note/create');
        await page.getByRole('button', { name: '继续草稿', exact: true }).click();
        assert.equal(await input('正文').inputValue(), '快速返回前的最后输入');
        check('持久浏览器进程重启后恢复 SQLite 草稿');
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await page.waitForURL((url) => !url.pathname.endsWith('/create'));
        assert.equal(posts, 1);
        check('正式保存创建一次笔记');
        await page.goto(origin + '/pages/note/create');
        await input('标题').waitFor();
        assert.equal(await input('标题').inputValue(), '');
        check('成功保存后新建入口不重复恢复已提交草稿');
        // 新建笔记的客户端 ID 稳定为负数，合并页继续使用客户端 ID。
        await page.goto(origin + '/pages/note/-1?edit=1');
        const mergedContent = input('笔记正文');
        await mergedContent.fill('编辑草稿与已保存正文不同');
        await page.waitForTimeout(1000);
        await page.reload();
        await mergedContent.waitFor();
        assert.equal(await mergedContent.inputValue(), '编辑草稿与已保存正文不同');
        assert.equal(await page.getByText('发现本地草稿', { exact: true }).count(), 0);
        check('编辑草稿直接恢复且不显示发现提示');
        await page.goto(origin + '/pages/note/create');
        await input('标题').fill('未知请求恢复');
        await input('正文').fill('不能重复 POST');
        mode = 'unknown';
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await page.getByRole('button', { name: '完成并返回', exact: true }).click();
        await page.goto(origin + '/pages/note/create');
        await page.getByRole('button', { name: '继续草稿', exact: true }).click();
        await input('正文').fill('再次编辑本地笔记');
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await page.getByRole('button', { name: '完成并返回', exact: true }).waitFor();
        assert.equal(posts, 2);
        assert.equal(await page.getByRole('progressbar').count(), 0);
        assert.equal(await input('正文').isEditable(), false);
        check('云端结果未知时恢复保存不重复 POST');
        assert.deepEqual(errors, []);
        check('浏览器无未捕获页面错误');
        await page.screenshot({ path: path.join(output, 'completed.png'), fullPage: true });
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, checks, errors }, null, 2));
        console.log('BROWSER_TESTS_PASSED ' + checks.length);
    } catch (error) {
        console.error(error);
        if (page) {
            console.error('PAGE_TEXT', await page.locator('body').innerText().catch(() => 'unavailable'));
            await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
        }
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: false, checks, errors, error: String(error) }, null, 2));
        process.exitCode = 1;
    } finally {
        if (process.argv.includes('--keep-open')) {
            console.log('可见验证浏览器保留于 ' + origin);
            process.on('SIGINT', async () => { await context?.close(); server.close(); process.exit(); });
        } else {
            await context?.close(); server.close();
        }
    }
})();
