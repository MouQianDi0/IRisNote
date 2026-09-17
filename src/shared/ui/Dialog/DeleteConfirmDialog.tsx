import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { DialogButton, DraftDialog } from "./dialog";

/**
 * 不可恢复删除的最终确认弹窗：笔记与分类删除确认共用。
 * 视觉与退出笔记弹窗对齐：内容行间距 12dp，提示行到按钮行 12dp。
 * 「确认删除」沿用草稿删除的 2 秒倒计时：首按进入「删除中…」白色 spinner，
 * 再按或点遮罩/返回键只打断倒计时；删除执行中遮罩不响应，
 * 失败错误以红字 alert 行显示在弹窗内，不再使用系统 Alert。
 */

type DeleteConfirmDialogProps = {
  visible: boolean;
  /** 警示正文，可含换行（如「删除后无法找回\n笔记…将被永久删除」）。 */
  description: string;
  onClose: () => void;
  /** 倒计时结束后的删除动作；抛错时错误信息显示在弹窗内。 */
  onConfirm: () => Promise<void>;
};

export default function DeleteConfirmDialog({
  visible,
  description,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [counting, setCounting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const countdown = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (countdown.current) clearTimeout(countdown.current);
    },
    [],
  );
  // 每次关闭（取消或删除完成）都回到初始态，倒计时一并清掉。
  useEffect(() => {
    if (visible) return;
    if (countdown.current) {
      clearTimeout(countdown.current);
      countdown.current = null;
    }
    void Promise.resolve().then(() => {
      setCounting(false);
      setBusy(false);
      setError("");
    });
  }, [visible]);

  const runDelete = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : "删除失败，请重试",
      );
    } finally {
      setBusy(false);
    }
  };

  const cancelCountdown = () => {
    if (countdown.current) {
      clearTimeout(countdown.current);
      countdown.current = null;
    }
    setCounting(false);
  };

  const startCountdown = () => {
    if (counting || busy) return;
    setCounting(true);
    countdown.current = setTimeout(() => {
      countdown.current = null;
      setCounting(false);
      void runDelete();
    }, 2000);
  };

  return (
    <DraftDialog
      visible={visible}
      title="确认删除？"
      onClose={() => {
        // 倒计时中点遮罩/返回键只打断删除，不关闭弹窗。
        if (counting) {
          cancelCountdown();
          return;
        }
        if (busy) return;
        onClose();
      }}
    >
      <ScrollView style={{ flexShrink: 1 }}>
        <Text className="text-sm text-hyper-text-secondary">{description}</Text>
      </ScrollView>
      {error !== "" && (
        <Text
          accessibilityRole="alert"
          className="mt-3 text-sm text-hyper-error"
        >
          {error}
        </Text>
      )}
      <View className="mt-3 flex-row gap-2.5">
        <DialogButton
          variant="secondary"
          className="flex-1"
          label="取消"
          disabled={busy}
          onPress={onClose}
        />
        <DialogButton
          variant="danger"
          className="flex-1"
          label={counting || busy ? "删除中…" : "确认删除"}
          leading={
            counting || busy ? (
              <ActivityIndicator size="small" color="white" />
            ) : undefined
          }
          disabled={busy}
          onPress={() => {
            if (counting) {
              cancelCountdown();
              return;
            }
            startCountdown();
          }}
        />
      </View>
    </DraftDialog>
  );
}
