import { StyleSheet, Text, View } from 'react-native';

export default function CreateTodo(){
    return(
        <View style={styles.container}>
            <Text style={styles.text}>新建待办</Text>
        </View>
    )
}
const styles = StyleSheet.create({
    container:{
        flex:1,
        alignItems:'center',
        justifyContent:'center',
        backgroundColor:'#f5f5f5',
    },
    text:{
        fontSize:24,
        fontWeight:'bold',
    },
});