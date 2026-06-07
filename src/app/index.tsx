import { type Href, Redirect } from "expo-router";

export default function AppIndex() {
    return <Redirect href={"/(tabs)/note" as Href} />;
}
