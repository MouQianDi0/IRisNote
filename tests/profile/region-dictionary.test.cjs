const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
    module._compile(
        ts.transpileModule(fs.readFileSync(filename, "utf8"), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
            },
            fileName: filename,
        }).outputText,
        filename,
    );
};

const {
    createRegionIndex,
    parseRegionDictionary,
} = require("../../src/features/profile/utils/region-dictionary.ts");
const generated = require("../../src/features/profile/data/regions.json");

const fixture = parseRegionDictionary({
    version: "test-1",
    countries: [
        ["CN", "中国", "China"],
        ["US", "美国", "United States"],
        ["VA", "梵蒂冈", "Vatican City"],
    ],
    subdivisions: {
        CN: [
            ["CN-GD", "广东省", "Guangdong"],
            ["CN-TW", "中国台湾", "Taiwan"],
        ],
        US: [["US-CA", "加利福尼亚州", "California"]],
    },
});

test("解析编码为完整显示名称，未知编码返回 null", () => {
    const index = createRegionIndex(fixture);
    assert.deepEqual(index.resolve("CN-GD"), {
        code: "CN-GD",
        name: "广东省",
        label: "中国 · 广东省",
        countryCode: "CN",
        hasChildren: false,
    });
    assert.equal(index.resolve("US").label, "美国");
    assert.equal(index.resolve("US").hasChildren, true);
    assert.equal(index.resolve("VA").hasChildren, false);
    assert.equal(index.resolve("CN-XX"), null);
    assert.equal(index.resolve(null), null);
    assert.equal(index.resolve(""), null);
});

test("搜索中文名、英文名（不区分大小写）与编码，国家优先并限制条数", () => {
    const index = createRegionIndex(fixture);
    assert.deepEqual(
        index.search("广东").map((entry) => entry.code),
        ["CN-GD"],
    );
    assert.deepEqual(
        index.search("california").map((entry) => entry.label),
        ["美国 · 加利福尼亚州"],
    );
    assert.deepEqual(
        index.search("us").map((entry) => entry.code),
        ["US"],
    );
    assert.deepEqual(index.search("   "), []);
    assert.equal(index.search("国", 1).length, 1);
    assert.equal(index.search("中国")[0].code, "CN");
});

test("字典行格式不符时拒绝使用", () => {
    assert.throws(() =>
        parseRegionDictionary({ version: "x", countries: [["CN", "中国"]], subdivisions: {} }),
    );
});

test("生成的字典：港澳台只作为中国省级且使用规范名称", () => {
    const codes = generated.countries.map((row) => row[0]);
    for (const code of ["TW", "HK", "MO"]) assert.equal(codes.includes(code), false);
    const china = new Map(generated.subdivisions.CN.map((row) => [row[0], row[1]]));
    assert.equal(china.size, 34);
    assert.equal(china.get("CN-TW"), "中国台湾");
    assert.equal(china.get("CN-HK"), "中国香港");
    assert.equal(china.get("CN-MO"), "中国澳门");
    assert.equal(generated.countries[0][0], "CN");
});

test("生成的字典：编码格式有效、同国无重名、名称快照不超过 60 字", () => {
    const index = createRegionIndex(parseRegionDictionary(generated));
    for (const [code, name] of generated.countries) {
        assert.match(code, /^[A-Z]{2}$/);
        assert.ok(name.trim());
    }
    for (const [country, rows] of Object.entries(generated.subdivisions)) {
        const names = new Set();
        for (const [code, name] of rows) {
            assert.match(code, new RegExp(`^${country}-[A-Z0-9]{1,3}$`));
            assert.equal(names.has(name), false, `${country} 重名：${name}`);
            names.add(name);
            assert.ok([...index.resolve(code).label].length <= 60);
        }
    }
});

test("生成的字典：已修正的错误译名保持正确", () => {
    const name = (code) =>
        generated.subdivisions[code.slice(0, 2)].find((row) => row[0] === code)[1];
    assert.equal(name("KR-11"), "首尔");
    assert.equal(name("RU-AMU"), "阿穆尔州");
    assert.equal(name("ID-PB"), "西巴布亚");
    const allNames = Object.values(generated.subdivisions).flat().map((row) => row[1]);
    assert.equal(allNames.includes("巴布亚新几内亚"), false);
    assert.equal(allNames.includes("汉城"), false);
});
