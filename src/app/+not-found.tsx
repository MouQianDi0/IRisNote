import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function NotFoundScreen(){
    return (
        <>
        <Stack.Screen options={{title:'来到了未知空间\n点击返回'}} />
        <View>
            <Link href="/" style={styles.button}>返回首页</Link>
        </View>
        </>
    );
}
const styles=StyleSheet.create({
    container:{
        flex:0.5,
        backgroundColor:'#a0c9fcff',
        justifyContent:'center',
        alignItems:'center',
    },
    button:{
        color:'blue',
    },
});