import { NotificationStore } from "./notification.store";
export const notificationStore = new NotificationStore();
export const banner = {
  show: notificationStore.show,
  update: notificationStore.update,
  resolve: notificationStore.resolve,
  dismiss: notificationStore.dismiss,
  clearSession: notificationStore.clearSession,
};
/** Capture before asynchronous work; check before publishing any session result. */
export const captureNotificationSession = notificationStore.captureSession;
