import { isSessionExiting } from "@/shared/http/session-events";
import { router, type Href } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useRef, useState } from "react";

const personalInfoRoute = "/pages/user/profile" as Href;

/** 被拦截的导航动作，类型取自 usePreventRemove 回调参数。 */
type LeaveAction = Parameters<
    Parameters<typeof usePreventRemove>[1]
>[0]["data"]["action"];

/**
 * 资料编辑页的离开保护：有未保存改动时拦截返回（按钮、系统返回、手势）并请求确认，
 * 保存中直接阻止离开；保存成功后调用 leaveAfterSave 放行。
 */
export function useUnsavedLeaveGuard(dirty: boolean, saving: boolean) {
    const navigation = useNavigation();
    const [pendingLeave, setPendingLeave] = useState<LeaveAction | null>(null);
    const allowLeaveRef = useRef(false);

    usePreventRemove(saving || dirty, ({ data }) => {
        // 登录已失效时直接放行跳转欢迎页，本地未保存的输入无法再提交。
        if (allowLeaveRef.current || isSessionExiting()) {
            navigation.dispatch(data.action);
            return;
        }
        if (saving) return;
        setPendingLeave(data.action);
    });

    const goBack = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace(personalInfoRoute);
    };

    const discardAndLeave = () => {
        allowLeaveRef.current = true;
        const action = pendingLeave;
        setPendingLeave(null);
        if (action) navigation.dispatch(action);
        else goBack();
    };

    const leaveAfterSave = () => {
        allowLeaveRef.current = true;
        goBack();
    };

    /** 放行下一次离开（如需跳转到其他页面而非返回）。 */
    const allowLeave = () => {
        allowLeaveRef.current = true;
    };

    return {
        confirmVisible: pendingLeave !== null,
        continueEditing: () => setPendingLeave(null),
        discardAndLeave,
        leaveAfterSave,
        allowLeave,
        goBack,
    };
}
