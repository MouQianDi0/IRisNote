import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const getBaseURL = () => {

    return "https://tech-mou.top/api"; // 生产环境服务器地址
};

export const API_BASE_URL = getBaseURL();
console.log("[API] 请求地址:", API_BASE_URL, "__DEV__:", __DEV__);

const api = axios.create({
    baseURL: API_BASE_URL,
});

// 请求拦截器：自动附加 token
api.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;
