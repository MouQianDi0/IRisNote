import dictionary from "./regions.json";
import {
    createRegionIndex,
    parseRegionDictionary,
    type RegionIndex,
} from "../utils/region-dictionary";

let index: RegionIndex | null = null;

/** 首次使用时才建立索引；数据文件约 160KB，只在地区相关页面使用。 */
export function getRegionIndex(): RegionIndex {
    index ??= createRegionIndex(parseRegionDictionary(dictionary));
    return index;
}
