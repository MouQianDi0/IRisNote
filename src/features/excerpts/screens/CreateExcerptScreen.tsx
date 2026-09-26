import { router } from "expo-router";
import { ExcerptFormDialog } from "../components/ExcerptFormDialog";
import { useExcerptScope } from "../hooks/useExcerptScope";

export default function CreateExcerptScreen() {
    const scope = useExcerptScope();
    const close = () => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/excerpt");
    };
    return scope.ready ? (
        <ExcerptFormDialog
            key={`${scope.ownerKey}:${scope.generation}`}
            ownerKey={scope.ownerKey}
            generation={scope.generation}
            onClose={close}
        />
    ) : null;
}
