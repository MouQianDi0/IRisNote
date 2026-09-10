import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerCard } from "@/shared/ui/Banner/banner-card";
import { notificationStore } from "./notification.service";
import { selectBanners } from "./notification.store";
import type { BannerRecord } from "./notification.types";

function Item({ item }: { item: BannerRecord }) {
  const pause = useCallback(
    (reason: string, paused: boolean) =>
      notificationStore.pause(item.id, reason, paused),
    [item.id],
  );
  useEffect(
    () => () => {
      for (const reason of ["drag", "touch", "focus"])
        notificationStore.pause(item.id, reason, false);
    },
    [item.id],
  );
  return (
    <BannerCard
      {...item}
      dismissible={item.lifetime.mode !== "until-resolved"}
      remainingMs={item.remainingMs}
      runningSince={item.runningSince}
      durationMs={
        item.lifetime.mode === "timed" ? (item.lifetime.durationMs ?? 5000) : 0
      }
      running={item.runningSince !== null}
      onPause={pause}
      onDismiss={() => notificationStore.dismiss(item.id)}
      actionLabel={item.action?.label}
      bodyLabel={item.bodyAction?.label}
      onAction={
        item.action
          ? () => {
              void notificationStore.invoke(item.id, "action");
            }
          : undefined
      }
      onBody={
        item.bodyAction
          ? () => {
              void notificationStore.invoke(item.id, "bodyAction");
            }
          : undefined
      }
    />
  );
}
export function NotificationHost() {
  const items = useSyncExternalStore(
    notificationStore.subscribe,
    notificationStore.getSnapshot,
  );
  const { pinned, ordinary } = selectBanners(items);
  const [expanded, setExpanded] = useState(false);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const anchor = useRef<View>(null);
  const [originY, setOriginY] = useState(0);
  const visibleKey = JSON.stringify(
    [...pinned, ...ordinary].map((item) => item.id),
  );
  useEffect(() => {
    notificationStore.setVisible(JSON.parse(visibleKey) as string[]);
  }, [visibleKey]);
  useEffect(() => () => notificationStore.setVisible([]), []);
  if (!items.length) return null;
  return (
    <View
      ref={anchor}
      collapsable={false}
      pointerEvents="box-none"
      onLayout={() => anchor.current?.measureInWindow((_x, y) => setOriginY(y))}
      style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10000 }}
    >
      <View
        pointerEvents="box-none"
        style={{
          marginTop: Math.max(0, insets.top - originY) + 8,
          marginHorizontal: 12,
          gap: 8,
        }}
      >
        {pinned.length > 2 ? (
          <View style={{ gap: 8 }}>
            <BannerCard
              title={`有 ${pinned.length} 项问题待处理`}
              type="important"
              busy={false}
              dismissible={false}
              actionLabel={expanded ? "收起" : "查看"}
              onAction={() => setExpanded((value) => !value)}
              onDismiss={() => {}}
              onPause={() => {}}
              remainingMs={0}
              durationMs={0}
              running={false}
            />
            {expanded && (
              <ScrollView
                style={{ maxHeight: height * 0.45 }}
                contentContainerStyle={{ gap: 8 }}
                keyboardShouldPersistTaps="handled"
              >
                {pinned.map((item) => (
                  <Item key={item.id} item={item} />
                ))}
                <Pressable
                  onPress={() => setExpanded(false)}
                  accessibilityRole="button"
                >
                  <Text style={{ textAlign: "center", padding: 12 }}>
                    收起问题列表
                  </Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        ) : (
          pinned.map((item) => <Item key={item.id} item={item} />)
        )}
        {ordinary.map((item) => (
          <Item key={item.id} item={item} />
        ))}
      </View>
    </View>
  );
}
