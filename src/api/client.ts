import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

const getBaseURL = () => {
    return "https://tech-mou.top/api";
};

const baseURL = getBaseURL();
console.log("[API] 请求地址:", baseURL, "__DEV__:", __DEV__);

const api = axios.create({
    baseURL,
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
