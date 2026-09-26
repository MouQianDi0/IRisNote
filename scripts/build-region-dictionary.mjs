#!/usr/bin/env node
/**
 * 生成个人资料“地区”字典：src/features/profile/data/regions.json
 *
 * 数据来源：dr5hn/countries-states-cities-database，固定发布版并校验 SHA-256；
 * 许可为 ODbL v1.0，生成的数据文件同样以 ODbL 提供（见 REGIONS-LICENSE.md）。
 *
 * 用法：
 *   node scripts/build-region-dictionary.mjs                 # 下载固定版本
 *   node scripts/build-region-dictionary.mjs --source=<目录>  # 使用本地已下载的 countries.json / states.json
 *
 * 规则：
 * - 层级为“国家/地区 → 省/州”；每国只取没有上级（parent_id 为空）的条目，
 *   剔除军邮区与海外属地（海外属地已作为独立国家出现）。
 * - 台湾、香港、澳门不作为第一级，只作为中国省级（CN-TW / CN-HK / CN-MO），
 *   显示为中国台湾 / 中国香港 / 中国澳门。
 * - 中文名采用数据集 zh-CN 译名，缺失时回退英文名。
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE = "v3.2-export.7";
const SOURCES = {
    countries: {
        url: `https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/${RELEASE}/json/countries.json`,
        sha256: "b93a99bc384bcc958de3b8ea9434a0ab34520ce6ae4e330953677ce9817e7dd5",
    },
    states: {
        url: `https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/${RELEASE}/json/states.json`,
        sha256: "f2389263a1706f405755b728f16747963f179a594ca9559d6f216cfe4b04b2f3",
    },
};
export const DICTIONARY_VERSION = `dr5hn-${RELEASE}`;

const EXCLUDED_COUNTRIES = new Set(["TW", "HK", "MO"]);
const EXCLUDED_SUBDIVISION_TYPES = new Set([
    "military postal region",
    "outlying area",
    // 印尼岛群等“地理单元”与省级区划重叠，不是行政区划
    "geographical unit",
]);
/**
 * 人工核对后的名称：港澳台表述、数据集中错误或过时的译名，以及同一国家内
 * 重名条目的区分（通常为同名的市与州）。数据版本升级后若出现新的重名，
 * 生成会失败，需在此补充后再生成。
 */
const NAME_OVERRIDES = {
    "CN-TW": "中国台湾",
    "CN-HK": "中国香港",
    "CN-MO": "中国澳门",
    // 错误或过时译名
    "KR-11": "首尔",
    "RU-AMU": "阿穆尔州",
    "ID-PA": "巴布亚",
    "ID-PB": "西巴布亚",
    "ID-PD": "西南巴布亚",
    "ID-PE": "高地巴布亚",
    "ID-PT": "中巴布亚",
    // 同名条目区分
    "AZ-LAN": "兰卡兰市",
    "AZ-LA": "兰卡兰区",
    "AZ-NV": "纳希切万市",
    "AZ-NX": "纳希切万自治共和国",
    "AZ-SA": "沙基市",
    "AZ-SAK": "沙基区",
    "AZ-YE": "叶夫拉赫市",
    "AZ-YEV": "叶夫拉赫区",
    "BY-HM": "明斯克市",
    "BY-MI": "明斯克州",
    "KZ-75": "阿拉木图市",
    "KZ-19": "阿拉木图州",
    "KG-GO": "奥什市",
    "KG-O": "奥什州",
    "LA-VT": "万象市",
    "LA-VI": "万象省",
    "LV-REZ": "雷泽克内市",
    "LV-077": "雷泽克内区",
    "LV-VEN": "文茨皮尔斯市",
    "LV-106": "文茨皮尔斯区",
    "LV-JEL": "叶尔加瓦市",
    "LV-041": "叶尔加瓦区",
    "MZ-MPM": "马普托市",
    "MZ-L": "马普托省",
    "RU-ALT": "阿尔泰边疆区",
    "RU-AL": "阿尔泰共和国",
    "RU-MOW": "莫斯科市",
    "RU-MOS": "莫斯科州",
    "UA-30": "基辅市",
    "UA-32": "基辅州",
    "UZ-TK": "塔什干市",
    "UZ-TO": "塔什干州",
};
const COUNTRY_CODE = /^[A-Z]{2}$/;
const SUBDIVISION_CODE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
const LABEL_MAX = 60;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "src/features/profile/data/regions.json");

async function load(name, sourceDir) {
    const { url, sha256 } = SOURCES[name];
    let buffer;
    if (sourceDir) {
        buffer = await readFile(join(sourceDir, `${name}.json`));
    } else {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`下载失败 ${url}: HTTP ${response.status}`);
        buffer = Buffer.from(await response.arrayBuffer());
    }
    const digest = createHash("sha256").update(buffer).digest("hex");
    if (digest !== sha256) {
        throw new Error(`${name}.json 校验失败：期望 ${sha256}，实际 ${digest}`);
    }
    return JSON.parse(buffer.toString("utf8"));
}

const chineseName = (item) => {
    const zh = item.translations?.["zh-CN"]?.trim();
    return { name: zh || item.name.trim(), fallback: !zh };
};

export function buildDictionary(countries, states) {
    const collator = new Intl.Collator("zh-Hans-CN");
    const report = { fallbackNames: [], dropped: [] };

    const countryRows = countries
        .filter((country) => !EXCLUDED_COUNTRIES.has(country.iso2))
        .map((country) => {
            if (!COUNTRY_CODE.test(country.iso2)) {
                throw new Error(`国家代码无效：${country.iso2}`);
            }
            const { name, fallback } = chineseName(country);
            if (fallback) report.fallbackNames.push(country.iso2);
            return [country.iso2, name, country.name.trim()];
        })
        .sort((a, b) =>
            a[0] === "CN" ? -1 : b[0] === "CN" ? 1 : collator.compare(a[1], b[1]),
        );
    const countryCodes = new Set(countryRows.map((row) => row[0]));

    const subdivisions = {};
    const seen = new Set();
    for (const state of states) {
        const code = state.iso3166_2;
        const country = state.country_code;
        if (!countryCodes.has(country)) continue;
        if (state.parent_id) continue;
        if (EXCLUDED_SUBDIVISION_TYPES.has(state.type)) continue;
        if (!code || !SUBDIVISION_CODE.test(code) || !code.startsWith(`${country}-`)) {
            report.dropped.push(`${country}:${state.name}（编码 ${code ?? "缺失"}）`);
            continue;
        }
        if (seen.has(code)) {
            report.dropped.push(`${code}（重复）`);
            continue;
        }
        seen.add(code);
        const { name, fallback } = chineseName(state);
        if (fallback) report.fallbackNames.push(code);
        (subdivisions[country] ??= []).push([
            code,
            NAME_OVERRIDES[code] ?? name,
            state.name.trim(),
        ]);
    }
    for (const rows of Object.values(subdivisions)) {
        rows.sort((a, b) => collator.compare(a[1], b[1]));
    }

    // 合规与数据完整性检查：不通过即中止，不生成文件
    const china = subdivisions.CN ?? [];
    for (const code of ["CN-TW", "CN-HK", "CN-MO"]) {
        if (!china.some((row) => row[0] === code)) {
            throw new Error(`中国省级缺少 ${code}`);
        }
    }
    if (china.length !== 34) throw new Error(`中国省级应为 34 个，实际 ${china.length}`);
    if (countryRows.some((row) => EXCLUDED_COUNTRIES.has(row[0]))) {
        throw new Error("台湾、香港、澳门不得作为第一级");
    }
    for (const [country, rows] of Object.entries(subdivisions)) {
        const names = new Set();
        for (const row of rows) {
            if (names.has(row[1])) {
                throw new Error(`${country} 存在重名：${row[1]}，请在 NAME_OVERRIDES 中区分`);
            }
            names.add(row[1]);
        }
    }
    const unused = Object.keys(NAME_OVERRIDES).filter((code) => !seen.has(code));
    if (unused.length > 0) {
        throw new Error(`NAME_OVERRIDES 中的编码不存在：${unused.join(", ")}`);
    }
    const countryNames = new Map(countryRows.map((row) => [row[0], row[1]]));
    for (const [country, rows] of Object.entries(subdivisions)) {
        for (const row of rows) {
            const label = `${countryNames.get(country)} · ${row[1]}`;
            if ([...label].length > LABEL_MAX) {
                throw new Error(`地区名称超过 ${LABEL_MAX} 字：${label}`);
            }
        }
    }

    return {
        dictionary: {
            version: DICTIONARY_VERSION,
            countries: countryRows,
            subdivisions,
        },
        report,
    };
}

async function main() {
    const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
    const sourceDir = sourceArg ? resolve(sourceArg.slice("--source=".length)) : null;
    const [countries, states] = await Promise.all([
        load("countries", sourceDir),
        load("states", sourceDir),
    ]);
    const { dictionary, report } = buildDictionary(countries, states);
    await mkdir(dirname(output), { recursive: true });
    const json = `${JSON.stringify(dictionary)}\n`;
    await writeFile(output, json);

    const subdivisionCount = Object.values(dictionary.subdivisions).reduce(
        (sum, rows) => sum + rows.length,
        0,
    );
    const withoutSubdivisions = dictionary.countries
        .filter(([code]) => !dictionary.subdivisions[code])
        .map(([code]) => code);
    console.log(
        JSON.stringify(
            {
                version: dictionary.version,
                output,
                bytes: Buffer.byteLength(json),
                countries: dictionary.countries.length,
                subdivisions: subdivisionCount,
                countriesWithoutSubdivisions: withoutSubdivisions,
                englishFallbackNames: report.fallbackNames,
                dropped: report.dropped,
            },
            null,
            2,
        ),
    );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
