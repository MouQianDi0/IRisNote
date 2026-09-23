# regions.json 数据许可

`regions.json` 由 `scripts/build-region-dictionary.mjs` 从
[Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database)
（发布版 `v3.2-export.7`）提取、筛选并修订生成。

- 原始数据：Data by Countries States Cities Database | https://github.com/dr5hn/countries-states-cities-database | ODbL v1.0
- 本文件作为派生数据库，同样以 [Open Database License (ODbL) v1.0](https://opendatacommons.org/licenses/odbl/1-0/) 提供。
- 修订内容：只保留国家与每国最高一级省州；剔除军邮区、海外属地与地理单元；台湾、香港、澳门归入中国省级并显示为中国台湾、中国香港、中国澳门；修正部分错误或过时译名，并区分同一国家内的重名条目（详见生成脚本中的 `NAME_OVERRIDES`）。

本许可仅适用于该数据文件，不改变 IRisNote 其他源代码的许可。
