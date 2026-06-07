import { Tabs } from 'expo-router';
import { Notebook, SquareCheckBig, Sticker } from 'lucide-react-native';
import { Dimensions } from 'react-native';

const { height } = Dimensions.get('window');
export default function DrawerLayout()
{
    return (
        <Tabs
            tabBar={() => null}
            screenOptions={{ headerShown: false }}
        >
            <Tabs.Screen name="index"
             options={{
                title: '笔记',
                tabBarIcon:()=><>
                    <Notebook size={24} color="#000000ff" />
                 </>
                }}
            />
            <Tabs.Screen name="Todo"
             options={{
                title: '待办',
                tabBarIcon:()=><>
                    <SquareCheckBig size={24} color="#000000ff" />
                 </>
                }}
            />
            <Tabs.Screen name="user"
             options={{
                title: '我的',
                tabBarIcon:()=><>
                    <Sticker size={24} color="#000000ff" />
                 </>
                }}
            />
            <Tabs.Screen name="copyExcerpt"
             options={{
                title: '剪贴板摘录',
                tabBarIcon:()=><>
                    <Sticker size={24} color="#000000ff" />
                 </>
                }}
            />
            
        </Tabs>
    );
}