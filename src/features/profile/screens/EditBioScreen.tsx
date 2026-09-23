import { useAuth } from "@/features/auth/hooks/useAuth";
import { ProfileTextEditor } from "../components/ProfileTextEditor";
import { BIO_MAX, checkBio } from "../utils/profile-validation";

export default function EditBioScreen() {
    const { user } = useAuth();
    return (
        <ProfileTextEditor
            title="编辑个人简介"
            label="个人简介"
            hint={`可选，最多 ${BIO_MAX} 字`}
            placeholder="介绍一下自己"
            maxLength={BIO_MAX}
            multiline
            clearable
            savedValue={user?.bio ?? ""}
            check={checkBio}
            toChanges={(value) => ({ bio: value })}
        />
    );
}
