const { withAppBuildGradle } = require("expo/config-plugins");

const signingBlock = `
// IRIS_RELEASE_SIGNING_BEGIN
if (System.getenv("IRIS_RELEASE_SIGNING") == "true") {
    ["IRIS_KEYSTORE_PATH", "IRIS_KEYSTORE_PASSWORD", "IRIS_KEY_ALIAS", "IRIS_KEY_PASSWORD"].each { name ->
        if (!System.getenv(name)) throw new GradleException("Missing release signing variable: " + name)
    }
    android {
        signingConfigs {
            irisRelease {
                storeFile file(System.getenv("IRIS_KEYSTORE_PATH"))
                storePassword System.getenv("IRIS_KEYSTORE_PASSWORD")
                keyAlias System.getenv("IRIS_KEY_ALIAS")
                keyPassword System.getenv("IRIS_KEY_PASSWORD")
            }
        }
        buildTypes { release { signingConfig signingConfigs.irisRelease } }
    }
}
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.name == "assembleRelease" || it.name == "bundleRelease" }) {
        if (System.getenv("IRIS_RELEASE_SIGNING") != "true" && System.getenv("EAS_BUILD") != "true") {
            throw new GradleException("Use the release tool with a production keystore; debug signing is forbidden for releases.")
        }
    }
}
// IRIS_RELEASE_SIGNING_END
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (result) => {
    if (!result.modResults.contents.includes("IRIS_RELEASE_SIGNING_BEGIN")) result.modResults.contents += signingBlock;
    return result;
  });
};
module.exports.signingBlock = signingBlock;
