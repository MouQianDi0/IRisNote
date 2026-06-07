import { StyleSheet, Text, View } from 'react-native';

export default function Contact()
{
    return (
        <View style={styles.container}>
            <Text style={styles.title}>联系我们</Text>
            <Text style={styles.cardText}>1@qq.com</Text>
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
    cardText: {
        fontSize: 16,
        color: '#007AFF',
    },
});
