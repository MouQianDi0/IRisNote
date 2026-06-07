import { usePathname, useRouter } from 'expo-router';
import { Bolt, ClipboardPenLine, Notebook, PencilLine, SquareCheckBig, Sticker } from 'lucide-react-native';
import { useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';

export default function FloatingMenu(){
    const router = useRouter();
    const pathname=usePathname();
    const menuItems=[
        {name:'笔记',path:'/'as const,icon:Notebook},
        {name:'待办',path:'/Todo'as const,icon:SquareCheckBig},
        {name:'剪贴板摘录',path:'/copyExcerpt'as const,icon:ClipboardPenLine},
        {name:'用户',path:'/user'as const,icon:Sticker},      
    ];
    const pathRef=useRef(pathname);
    pathRef.current=pathname;
    const pathToIndex: Record<string, number> = {
        '/user':0,
        '/copyExcerpt':1,
        '/Todo':2,
        '/':3,

    };
    const tabPaths=['/user','/copyExcerpt','/Todo','/'] as const;
    const panResponder=PanResponder.create({
        onMoveShouldSetPanResponder:(_,gesture)=>{

            return Math.abs(gesture.dy)>20&&Math.abs(gesture.dy)>Math.abs(gesture.dx);
        },
        onPanResponderRelease:(_,gesture)=>{
            if (Math.abs(gesture.dy)<30)return;
            const currentIndex=pathToIndex[pathRef.current]??0;
            const total = tabPaths.length; 
            if (gesture.dy<-30){
                const prevIndex=(currentIndex - 1 + total) % total;
                router.push(tabPaths[prevIndex]);
               }
               else if (gesture.dy>30)
               {

                const nextIndex= (currentIndex + 1) % total;
                router.push(tabPaths[nextIndex]);
               }
            
        
        },
    });
   const getAction = (path: string) => {
        switch(path) {
            case '/':            return { icon: PencilLine,       route: '/create' as const };
            case '/Todo':        return { icon: SquareCheckBig,   route: '/createTodo' as const };
            case '/copyExcerpt': return { icon: ClipboardPenLine, route: '/createExcerpt' as const };
            case '/user':        return { icon: Bolt,         route: '/settings' as const };
            default:             return { icon: PencilLine,       route: '/create' as const };
        }
    };
    const { icon: ActionIcon, route: actionRoute } = getAction(pathname);
    return(
        <View style={styles.outerContainer}{...panResponder.panHandlers}>
            <View style={styles.menuContainer}>
                    {menuItems.map((item,index) =>(
                      <Pressable
                        key={index}
                        style={({pressed}) => [
                            styles.menuItem,
                            pathname===item.path && styles.activeItem,
                            pressed && styles.pressedItem
                        ]}
                        onPress={()=>router.push(item.path)}
                      >
                        <item.icon
                            size={24}
                            color={pathname===item.path?'#37a5ffff':'#666'}
                        />
                      </Pressable>  
                    ))}
            </View>
                <Pressable
                style={({pressed}) =>[
                    styles.addButton,
                    pressed && styles.addButtonPressed
                ]}
                onPress={()=> router.push(actionRoute)}
                >
                <ActionIcon size={24} color="#ffffffff" />
                </Pressable>
            
        </View>
    );
}
const styles = StyleSheet.create({
    outerContainer:{
        position:'absolute',
        bottom:50,
        right:20,
        alignItems:'flex-end'
    },
        menuContainer:{
        backgroundColor: '#ffffff',  // 白色背景
        borderRadius: 18,  // 圆角 
        paddingVertical: 10,  // 垂直内边距 10px
        paddingHorizontal: 8,  // 水平内边距 8px
        marginBottom: 15,  // 与"+"按钮的间距
        shadowColor: '#000',  // 阴影颜色
        shadowOffset: { width: 0, height: 2 },  // 阴影偏移
        shadowOpacity: 0.25,  // 阴影透明度
        shadowRadius: 3.84,  // 阴影模糊半径
        elevation: 5,  // Android 阴影
    },
    menuItem:{
        width: 50,  // 宽度 50px
        height: 50,  // 高度 50px
        justifyContent: 'center',  // 垂直居中
        alignItems: 'center',  // 水平居中
        marginVertical: 5,  // 上下间距 5px
        borderRadius: 25,  // 圆形（宽高的一半）
    },
    pressedItem:{
        backgroundColor:'transparent',
        opacity:0.7,
    },
    addButton:{
        width: 66,  // 宽度 60px
        height: 66,  // 高度 60px
        borderRadius: 18,  // 圆角 
        backgroundColor: '#0037ebff',  // 蓝色背景
        justifyContent: 'center',  // 垂直居中
        alignItems: 'center',  // 水平居中
        shadowColor: '#000',  // 阴影颜色
        shadowOffset: { width: 0, height: 2 },  // 阴影偏移
        shadowOpacity: 0.3,  // 阴影透明度
        shadowRadius: 4,  // 阴影模糊半径
        elevation: 8,  // Android 阴影
    },
    addButtonPressed:{
        backgroundColor:'#001692ff',
        opacity:0.7,
    },
    activeItem:{
        backgroundColor:'transparent',
        opacity:0.7,
    },
});