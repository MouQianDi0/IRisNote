// ============================================
// 导入 React
// ============================================
import { useState } from 'react';

// ============================================
// 导入 React Native 组件
// ============================================
import {
    Alert // 弹窗提示
    , // 可点击组件
    StyleSheet, // 容器组件
    Text, // 文字组件
    TextInput, // 输入框组件
    TouchableOpacity,
    View
} from 'react-native';

// ============================================
// 导入导航方法
// ============================================
import { router } from 'expo-router';

// ============================================
// 导入图标库
// ============================================
import { ArrowLeft, Check } from 'lucide-react-native';

// ============================================
// 定义创建笔记页面组件
// ============================================
export default function CreateNote() {

  // 笔记标题状态
  const [title, setTitle] = useState('');

  // 笔记内容状态
  const [content, setContent] = useState('');

  // 保存笔记函数
  const handleSave = () => {
    // 检查标题是否为空
    if (!title.trim()) {
      // 标题为空，显示提示
      Alert.alert('提示', '请输入笔记标题');
      return;  // 退出函数
    }

    // 标题不为空，显示保存成功提示
    Alert.alert('成功', '笔记已保存', [
      {
        text: '确定',  // 按钮文字
        onPress: () => router.back()  // 点击后返回上一页
      }
    ]);
  };

  // 返回 JSX 结构
  return (
    // 最外层容器
    <View style={styles.container}>

      {/* 顶部导航栏 */}
      <View style={styles.header}>

        {/* 返回按钮 */}
        <TouchableOpacity
          onPress={() => router.back()}  // 点击返回上一页
          style={styles.headerButton}
        >
          {/* 返回图标 */}
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>

        {/* 页面标题 */}
        <Text style={styles.headerTitle}>新建笔记</Text>

        {/* 保存按钮 */}
        <TouchableOpacity
          onPress={handleSave}  // 点击保存笔记
          style={styles.headerButton}
        >
          {/* 保存图标 */}
          <Check size={24} color="#007AFF" />
        </TouchableOpacity>

      </View>

      {/* 笔记标题输入框 */}
      <TextInput
        style={styles.titleInput}  // 标题输入框样式
        placeholder="输入标题..."  // 提示文字
        value={title}  // 绑定 title 状态
        onChangeText={setTitle}  // 输入变化时更新 title
      />

      {/* 笔记内容输入框 */}
      <TextInput
        style={styles.contentInput}  // 内容输入框样式
        placeholder="输入笔记内容..."  // 提示文字
        value={content}  // 绑定 content 状态
        onChangeText={setContent}  // 输入变化时更新 content
        multiline={true}  // 允许多行输入
        textAlignVertical="top"  // 文字从顶部开始
      />

    </View>
  );
}

// ============================================
// 定义样式
// ============================================
const styles = StyleSheet.create({

  // 最外层容器
  container: {
    flex: 1,  // 占满整个屏幕
    backgroundColor: '#fff',  // 白色背景
  },

  // 顶部导航栏
  header: {
    flexDirection: 'row',  // 水平排列
    justifyContent: 'space-between',  // 两端对齐
    alignItems: 'center',  // 垂直居中
    paddingHorizontal: 15,  // 水平内边距
    paddingTop: 50,  // 上边距（避开状态栏）
    paddingBottom: 15,  // 下边距
    borderBottomWidth: 1,  // 底部边框
    borderBottomColor: '#eee',  // 边框颜色
  },

  // 头部按钮
  headerButton: {
    padding: 10,  // 内边距
  },

  // 头部标题
  headerTitle: {
    fontSize: 18,  // 字体大小
    fontWeight: 'bold',  // 加粗
  },

  // 标题输入框
  titleInput: {
    fontSize: 24,  // 字体大小
    fontWeight: 'bold',  // 加粗
    paddingHorizontal: 20,  // 水平内边距
    paddingVertical: 15,  // 垂直内边距
    borderBottomWidth: 1,  // 底部边框
    borderBottomColor: '#eee',  // 边框颜色
  },

  // 内容输入框
  contentInput: {
    flex: 1,  // 占满剩余空间
    fontSize: 16,  // 字体大小
    paddingHorizontal: 20,  // 水平内边距
    paddingVertical: 15,  // 垂直内边距
  },
});
