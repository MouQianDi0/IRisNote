/**
 * 地区字典查询（数据由 scripts/build-region-dictionary.mjs 生成，ODbL v1.0）。
 * 层级为“国家/地区 → 省/州”；编码为 ISO：国家 `US`，省州 `US-CA`。
 */

/** [编码, 中文名, 英文名] */
export type RegionRow = [string, string, string];

export type RegionDictionary = {
    version: string;
    countries: RegionRow[];
    subdivisions: Record<string, RegionRow[]>;
};

type RawRegionDictionary = {
    version: string;
    countries: string[][];
    subdivisions: Record<string, string[][]>;
};

function toRow(row: string[]): RegionRow {
    const [code, name, english] = row;
    if (row.length !== 3 || !code || !name || !english) {
        throw new Error("地区字典格式无效");
    }
    return [code, name, english];
}

/** 将生成的 JSON 校验并转换为带元组类型的字典；格式不符时抛错而不是静默使用。 */
export function parseRegionDictionary(raw: RawRegionDictionary): RegionDictionary {
    return {
        version: raw.version,
        countries: raw.countries.map(toRow),
        subdivisions: Object.fromEntries(
            Object.entries(raw.subdivisions).map(([country, rows]) => [
                country,
                rows.map(toRow),
            ]),
        ),
    };
}

export type RegionEntry = {
    code: string;
    name: string;
    /** 完整显示名称，如“中国 · 广东省”，保存为名称快照。 */
    label: string;
    countryCode: string;
    hasChildren: boolean;
};

export const REGION_SEPARATOR = " · ";
export const REGION_SEARCH_LIMIT = 50;

export function createRegionIndex(dictionary: RegionDictionary) {
    const countries = new Map(dictionary.countries.map((row) => [row[0], row]));
    const subdivisions = new Map<string, RegionRow>();
    for (const rows of Object.values(dictionary.subdivisions)) {
        for (const row of rows) subdivisions.set(row[0], row);
    }

    const countryEntry = ([code, name]: RegionRow): RegionEntry => ({
        code,
        name,
        label: name,
        countryCode: code,
        hasChildren: (dictionary.subdivisions[code]?.length ?? 0) > 0,
    });
    const subdivisionEntry = (
        [code, name]: RegionRow,
        countryCode: string,
    ): RegionEntry => ({
        code,
        name,
        label: `${countries.get(countryCode)?.[1] ?? countryCode}${REGION_SEPARATOR}${name}`,
        countryCode,
        hasChildren: false,
    });

    /** 按编码解析；不在当前字典中（已失效或来自更新的字典）时返回 null。 */
    const resolve = (code: string | null | undefined): RegionEntry | null => {
        if (!code) return null;
        const country = countries.get(code);
        if (country) return countryEntry(country);
        const subdivision = subdivisions.get(code);
        if (!subdivision) return null;
        const countryCode = code.slice(0, 2);
        return countries.has(countryCode)
            ? subdivisionEntry(subdivision, countryCode)
            : null;
    };

    const listCountries = () => dictionary.countries.map(countryEntry);

    const listSubdivisions = (countryCode: string) =>
        (dictionary.subdivisions[countryCode] ?? []).map((row) =>
            subdivisionEntry(row, countryCode),
        );

    /** 中文名、英文名（不区分大小写）或编码的子串匹配；国家优先，最多 50 条。 */
    const search = (query: string, limit = REGION_SEARCH_LIMIT): RegionEntry[] => {
        const needle = query.trim().toLowerCase();
        if (!needle) return [];
        const matches = (row: RegionRow) =>
            row[1].toLowerCase().includes(needle) ||
            row[2].toLowerCase().includes(needle) ||
            row[0].toLowerCase() === needle;
        const results: RegionEntry[] = [];
        for (const row of dictionary.countries) {
            if (results.length >= limit) return results;
            if (matches(row)) results.push(countryEntry(row));
        }
        for (const [countryCode, rows] of Object.entries(dictionary.subdivisions)) {
            for (const row of rows) {
                if (results.length >= limit) return results;
                if (matches(row)) results.push(subdivisionEntry(row, countryCode));
            }
        }
        return results;
    };

    return {
        version: dictionary.version,
        resolve,
        listCountries,
        listSubdivisions,
        search,
    };
}

export type RegionIndex = ReturnType<typeof createRegionIndex>;
