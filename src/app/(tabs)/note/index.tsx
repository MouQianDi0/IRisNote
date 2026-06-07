import { router } from "expo-router";
import { Button, StyleSheet, Text, View } from "react-native";
import FloatingMenu from "../../../components/FloatingMenu";

export default function Index() {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>欢迎来到IRISNote</Text>
            <Button title="Go to About" onPress={() => router.push("/about")} />
            <FloatingMenu />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontSize: 24,
        marginBottom: 20,
    },
    card: {
        marginTop: 20,
        padding: 15,
        backgroundColor: "#f0f0f0",
        borderRadius: 10,
    },
    cardText: {
        fontSize: 16,
        color: "#007AFF",
    },
});
