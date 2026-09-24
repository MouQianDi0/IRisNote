import { useAuth } from "@/features/auth/hooks/useAuth";
import { ProfileTextEditor } from "../components/ProfileTextEditor";
import { NICKNAME_MAX, checkNickname } from "../utils/profile-validation";

export default function EditNicknameScreen() {
    const { user } = useAuth();
    return (
        <ProfileTextEditor
            title="修改用户名"
            label="用户名"
            hint="用于展示，不影响登录"
            placeholder="输入用户名"
            maxLength={NICKNAME_MAX}
            savedValue={user?.nickname ?? ""}
            check={checkNickname}
            toChanges={(value) => ({ nickname: value ?? "" })}
        />
    );
}
