import { StyleSheet, Text, View } from 'react-native';

export default function CreateExcerpt() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>新建剪贴板摘录</Text>
        </View>
    )
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
    },
    text: {
        fontSize: 24,
        fontWeight: 'bold',
    },
});