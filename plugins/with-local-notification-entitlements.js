const { withEntitlementsPlist } = require("expo/config-plugins");

// expo-notifications adds APNs by default. This project only schedules local
// notifications, so no APNs signing capability or remote registration is needed.
// Register BEFORE expo-notifications: Expo invokes chained mods in reverse order.
module.exports = function withLocalNotificationEntitlements(config) {
  return withEntitlementsPlist(config, (result) => {
    delete result.modResults["aps-environment"];
    return result;
  });
};
