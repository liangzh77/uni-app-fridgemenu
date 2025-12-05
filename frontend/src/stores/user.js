/**
 * 用户状态管理
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const useUserStore = defineStore('user', () => {
  // 状态
  const userId = ref(uni.getStorageSync('userId') || '');
  const sessionId = ref(uni.getStorageSync('sessionId') || '');
  const userInfo = ref(uni.getStorageSync('userInfo') || null);
  const isLoggedIn = computed(() => !!userId.value);

  // 设置用户信息
  const setUser = (user) => {
    userId.value = user.userId;
    sessionId.value = user.sessionId;
    if (user.userInfo) {
      userInfo.value = user.userInfo;
      uni.setStorageSync('userInfo', user.userInfo);
    }
    uni.setStorageSync('userId', user.userId);
    uni.setStorageSync('sessionId', user.sessionId);
  };

  // 清除用户信息
  const clearUser = () => {
    userId.value = '';
    sessionId.value = '';
    userInfo.value = null;
    uni.removeStorageSync('userId');
    uni.removeStorageSync('sessionId');
    uni.removeStorageSync('userInfo');
  };

  // 刷新会话
  const refreshSession = () => {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionId.value = newSessionId;
    uni.setStorageSync('sessionId', newSessionId);
    return newSessionId;
  };

  // 微信登录
  const wechatLogin = async () => {
    return new Promise((resolve, reject) => {
      // #ifdef MP-WEIXIN
      uni.login({
        provider: 'weixin',
        success: async (loginRes) => {
          try {
            // 调用后端登录接口
            const response = await uni.request({
              url: `${API_BASE_URL}/api/auth/wechat-login`,
              method: 'POST',
              data: {
                code: loginRes.code
              }
            });

            if (response.data.success) {
              setUser(response.data.data);
              resolve(response.data.data);
            } else {
              reject(new Error(response.data.message));
            }
          } catch (error) {
            console.error('登录请求失败:', error);
            reject(error);
          }
        },
        fail: (err) => {
          console.error('微信登录失败:', err);
          reject(err);
        }
      });
      // #endif

      // #ifndef MP-WEIXIN
      // 非微信环境，生成临时用户ID
      const tempUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const tempSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setUser({ userId: tempUserId, sessionId: tempSessionId });
      resolve({ userId: tempUserId, sessionId: tempSessionId });
      // #endif
    });
  };

  // 用户名密码登录
  const login = async (username, password) => {
    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/auth/login`,
        method: 'POST',
        data: { username, password }
      });

      if (response.data.success) {
        const data = response.data.data;
        setUser({
          userId: data.userId,
          sessionId: data.sessionId || `session_${Date.now()}`,
          userInfo: {
            username: data.username,
            avatar: data.avatar
          }
        });
        return { success: true };
      } else {
        return { success: false, message: response.data.message || '登录失败' };
      }
    } catch (error) {
      console.error('登录请求失败:', error);
      return { success: false, message: '网络错误' };
    }
  };

  // 注册
  const register = async (username, password) => {
    try {
      const response = await uni.request({
        url: `${API_BASE_URL}/api/auth/register`,
        method: 'POST',
        data: { username, password }
      });

      if (response.data.success) {
        const data = response.data.data;
        setUser({
          userId: data.userId,
          sessionId: data.sessionId || `session_${Date.now()}`,
          userInfo: {
            username: data.username,
            avatar: data.avatar
          }
        });
        return { success: true };
      } else {
        return { success: false, message: response.data.message || '注册失败' };
      }
    } catch (error) {
      console.error('注册请求失败:', error);
      return { success: false, message: '网络错误' };
    }
  };

  // 退出登录
  const logout = () => {
    clearUser();
  };

  return {
    userId,
    sessionId,
    userInfo,
    isLoggedIn,
    setUser,
    clearUser,
    refreshSession,
    wechatLogin,
    login,
    register,
    logout
  };
}, {
  // Pinia持久化配置
  persist: {
    enabled: true,
    strategies: [{
      key: 'user',
      storage: {
        getItem: (key) => uni.getStorageSync(key),
        setItem: (key, value) => uni.setStorageSync(key, value),
        removeItem: (key) => uni.removeStorageSync(key)
      }
    }]
  }
});
