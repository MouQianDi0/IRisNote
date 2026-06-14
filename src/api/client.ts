import axios from "axios";
import Constants from "expo-constants";

// 开发模式下自动获取电脑局域网 IP，部署时改为服务器地址
const getBaseURL = () => {
    if (__DEV__) {
        const debuggerHost = Constants.expoConfig?.hostUri;
        const host = debuggerHost?.split(":")[0] ?? "localhost";
        return `http://${host}:3000/api`;
    }
    return "http://1.14.177.177:3000/api"; // 生产环境服务器地址
};

const api = axios.create({
    baseURL: getBaseURL(),
});

export default api;
