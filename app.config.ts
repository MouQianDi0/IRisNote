import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const build = process.env.IRIS_BUILD_NUMBER;
  const version = process.env.IRIS_BUILD_VERSION;
  if (process.env.EAS_BUILD === "true" && (!build || !version)) throw new Error("请通过发布工具预留版本后构建，缺少统一版本信息");
  if (build && (!/^[1-9]\d*$/.test(build) || Number(build) > 2100000000)) throw new Error("IRIS_BUILD_NUMBER 无效");
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("IRIS_BUILD_VERSION 无效");
  return {
    ...config,
    name: config.name ?? "IRisNote",
    slug: config.slug ?? "IRisNote",
    version: version ?? config.version,
    android: { ...config.android, package: "com.mouqiandi.irisNote", ...(build ? { versionCode: Number(build) } : {}) },
  };
};
