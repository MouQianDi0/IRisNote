import { router } from "expo-router";
import { toDateId } from "@/shared/utils/date-id";
import { TodoFormDialog } from "../components/TodoFormDialog";
import { useTodoScope } from "../hooks/useTodoScope";
import { isValidDateId } from "../domain/todo-validation";

export default function CreateTodoScreen() {
  const scope = useTodoScope();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/todo");
  };
  const dateId =
    scope.selectedDateId && isValidDateId(scope.selectedDateId)
      ? scope.selectedDateId
      : toDateId(new Date());
  return scope.ready ? (
    <TodoFormDialog
      key={`${scope.ownerKey}:${scope.generation}`}
      ownerKey={scope.ownerKey}
      generation={scope.generation}
      dateId={dateId}
      onClose={close}
    />
  ) : null;
}
