import { StyleSheet, Text, View } from 'react-native';

export default function Settings(){
    return(
        <View style={styles.container}>
            <Text style={styles.text}>设置</Text>
            <Text style={styles.item}>主题:深色</Text>
            <Text style={styles.item}>字体大小:中</Text>
            <Text style={styles.item}>通知:开启</Text>
            <Text style={styles.item}>关于我们</Text>
        </View>
    )
}
const styles = StyleSheet.create({
    container:{
        flex:1,
        backgroundColor:'#d697ffff',
        alignItems:'center',
        justifyContent:'center',
    },
    text:{
        color:'#fff',
        fontSize:24,
        fontWeight:'bold',
        marginBottom:20,
    },
    item:{
        fontSize:16,
        color:'#ccc',
        marginTop:10,
    },
});