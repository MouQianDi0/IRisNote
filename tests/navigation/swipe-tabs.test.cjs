const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const patch = fs.readFileSync(
  path.join(root, "patches", "react-native-tab-view+4.3.2.patch"),
  "utf8",
);

test("主页面横滑在 100dp 前不接管，松手仅按位移切换", () => {
  assert.match(patch, /-const DEAD_ZONE = 12;/);
  assert.match(patch, /\+const DEAD_ZONE = 100;/);
  assert.match(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
    /"postinstall": "patch-package"/,
  );
  const runtimePager = fs.readFileSync(
    path.join(
      root,
      "node_modules/react-native-tab-view/lib/module/PanResponderAdapter.js",
    ),
    "utf8",
  );

  assert.match(runtimePager, /const DEAD_ZONE = 100;/);
  assert.match(
    runtimePager,
    /Math\.abs\(gestureState\.dx\) > swipeDistanceThreshold/,
  );
  assert.match(patch, /-\s*const swipeVelocityThreshold = 0\.15;/);
  assert.doesNotMatch(runtimePager, /swipeVelocityThreshold/);
  assert.doesNotMatch(
    runtimePager,
    /Math\.abs\(gestureState\.vx\) > swipeVelocityThreshold/,
  );
});
