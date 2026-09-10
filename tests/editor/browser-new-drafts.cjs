// npm install --prefix .expo/phase2-tools --no-save --no-package-lock playwright
// npx expo export --platform web --output-dir .expo/phase2-web-export
// node tests/editor/browser-new-drafts.cjs --headed --persistent [--keep-open]
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('../../.expo/phase2-tools/node_modules/playwright');
if (!process.argv.includes('--headed') || !process.argv.includes('--persistent')) {
    throw new Error('本项目浏览器验证必须同时提供 --headed --persistent');
}
const root = path.resolve(__dirname, '../../.expo', process.env.IRISNOTE_TEST_EXPORT || 'new-drafts-web-export');
const output = path.resolve(__dirname, '../../.expo/new-drafts-browser-results');
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
        context = await chromium.launchPersistentContext(path.resolve(__dirname, '../../.expo', process.env.IRISNOTE_TEST_PROFILE || 'new-drafts-browser-profile'), {
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
    const button = (name) => page.getByRole('button', { name, exact: true });
    const selectDraft = async (title) => {
        await page.getByRole('button', { name: new RegExp(title) }).click();
        await button('继续编辑').click();
    };
    const savedFiles = () => page.evaluate(async (owner) => {
        try {
            const root = await navigator.storage.getDirectory();
            const dir = await (await root.getDirectoryHandle('drafts')).getDirectoryHandle(String(owner));
            const result = [];
            for await (const [name, handle] of dir.entries()) if (name.endsWith('.json')) result.push(JSON.parse(await (await handle.getFile()).text()));
            return result;
        } catch (error) { if (error.name === 'NotFoundError') return []; throw error; }
    }, user.id);
    const assertLocalBold = async () => {
        const weights = await page.getByText('仅本机', { exact: true }).evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontWeight));
        assert.ok(weights.length > 0, '必须显示仅本机');
        assert.ok(weights.every((weight) => Number(weight) >= 700), JSON.stringify(weights));
    };
    try {
        await launch();
        await page.goto(origin + '/pages/note/create');
        await input('标题').fill('草稿A');
        await input('正文').fill('  第一行🙂\n第二行保留空白  ');
        await page.getByText('恢复副本已保存（仅本机）', { exact: true }).waitFor();
        assert.equal(posts, 0);
        check('新建输入自动落盘且没有云端请求');
        await page.reload();
        await page.getByText('有一份未完成的草稿，是否继续编辑？', { exact: true }).waitFor();
        assert.equal(await input('标题').inputValue(), '');
        await assertLocalBold();
        await page.screenshot({ path: path.join(output, 'recovery.png'), fullPage: true });
        await button('继续编辑').click();
        assert.equal(await input('正文').inputValue(), '  第一行🙂\n第二行保留空白  ');
        check('页面刷新恢复完整原文');
        await page.reload();
        await button('新建笔记').click();
        assert.equal(await input('正文').inputValue(), '');
        await input('标题').fill('草稿B');
        await input('正文').fill('主动保存版本一');
        await button('返回').click();
        await page.getByText('是否将内容保存为草稿？', { exact: true }).waitFor();
        await assertLocalBold();
        await page.screenshot({ path: path.join(output, 'leave.png'), fullPage: true });
        await button('继续编辑').click();
        assert.equal(await input('正文').inputValue(), '主动保存版本一');
        await button('返回').click();
        await button('保存草稿').click();
        await page.waitForURL((url) => !url.pathname.endsWith('/create'));
        assert.equal((await savedFiles()).length, 1);
        await assertLocalBold();
        check('暂不恢复保留旧稿，离开三按钮和主动草稿文件正确');
        await button('草稿').click();
        await page.getByRole('button', { name: /草稿A/ }).waitFor();
        await page.getByRole('button', { name: /草稿B/ }).waitFor();
        await page.screenshot({ path: path.join(output, 'draft-list.png'), fullPage: true });
        await selectDraft('草稿B');
        await button('继续编辑').click();
        assert.equal(await input('正文').inputValue(), '主动保存版本一');
        await input('正文').fill('丢弃这次编辑');
        await button('返回').click();
        await button('不保存').click();
        await page.waitForURL((url) => !url.pathname.endsWith('/create'));
        assert.equal((await savedFiles())[0].content, '主动保存版本一');
        check('草稿列表找回原稿，放弃修改保留主动保存版本');
        await page.goto(origin + '/pages/note/create');
        await selectDraft('草稿B');
        await input('正文').fill('主动保存版本二');
        await button('返回').click(); await button('保存草稿').click();
        await page.waitForURL((url) => !url.pathname.endsWith('/create'));
        assert.equal((await savedFiles()).length, 1);
        assert.equal((await savedFiles())[0].content, '主动保存版本二');
        check('再次保存同一草稿更新原文件');
        await context.close();
        await launch();
        await page.goto(origin + '/pages/note/create');
        await selectDraft('草稿B');
        assert.equal(await input('正文').inputValue(), '主动保存版本二');
        check('持久浏览器进程重启后恢复主动草稿文件');
        await button('保存').click();
        await page.waitForURL((url) => !url.pathname.endsWith('/create'));
        assert.equal(posts, 1);
        check('正式保存创建一次笔记');
        await page.goto(origin + '/pages/note/create');
        await page.getByRole('button', { name: /草稿A/ }).waitFor();
        assert.equal(await page.getByRole('button', { name: /草稿B/ }).count(), 0);
        assert.equal((await savedFiles()).length, 0);
        await button('继续编辑').click();
        assert.equal(await input('正文').inputValue(), '  第一行🙂\n第二行保留空白  ');
        await button('返回').click(); await button('不保存').click();
        await page.waitForURL((url) => !url.pathname.endsWith('/create'));
        await page.goto(origin + '/pages/note/create');
        await input('标题').waitFor();
        await input('标题').fill('   ');
        await button('返回').click();
        await page.waitForURL((url) => !url.pathname.endsWith('/create'));
        assert.equal(await page.getByText('是否将内容保存为草稿？', { exact: true }).count(), 0);
        check('成功清理仅对应草稿；放弃恢复内容不复活；空白直接离开');
        // 新建笔记的客户端 ID 稳定为负数，不能用云端 ID 构造本地路由。
        await page.goto(origin + '/pages/note/edit/-1');
        await input('正文').fill('编辑草稿与已保存正文不同');
        await page.getByText('草稿已保存到本地', { exact: true }).waitFor();
        await page.reload();
        await page.getByRole('button', { name: '查看已保存内容', exact: true }).click();
        await page.getByText('主动保存版本二', { exact: true }).waitFor();
        await page.getByRole('button', { name: '放弃草稿', exact: true }).click();
        await page.getByRole('button', { name: '保留草稿', exact: true }).click();
        await page.getByText('发现本地草稿', { exact: true }).waitFor();
        await page.getByRole('button', { name: '放弃草稿', exact: true }).click();
        await page.getByRole('button', { name: '确认永久放弃此草稿', exact: true }).click();
        await input('正文').waitFor();
        assert.equal(await input('正文').inputValue(), '主动保存版本二');
        check('编辑草稿对照及二次确认放弃');
        await page.goto(origin + '/pages/note/create');
        await input('标题').fill('未知请求恢复');
        await input('正文').fill('不能重复 POST');
        mode = 'unknown';
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await button('完成并返回').waitFor();
        await assertLocalBold();
        await page.screenshot({ path: path.join(output, 'local-only.png'), fullPage: true });
        await page.getByRole('button', { name: '完成并返回', exact: true }).click();
        await page.goto(origin + '/pages/note/create');
        await button('继续编辑').click();
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
