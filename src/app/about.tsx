import { router } from 'expo-router';
import { NotebookText } from 'lucide-react-native';
import { Button, StyleSheet, Text, View } from 'react-native';

export default function AboutScreen()
{
    return (
        <View style={styles.container}>
            <Text style={styles.text}>About</Text>
            <NotebookText size={48} color="#03cdffff" />
            
                <View style={styles.buttonContainer}>
                    <Button  
                    title="返回"
                    onPress={() => router.back()}
                    />
            </View>
        </View>
    )
}

const styles= StyleSheet.create({
    container:{
        flex:1,
        backgroundColor:'#25292e',
        alignItems:'center',
        justifyContent:'center'
    },
    text:{
        color:'#fff',
        fontSize:24,
        fontWeight:'bold'
    },
    buttonContainer:{
        marginTop:20,
    }
    
});