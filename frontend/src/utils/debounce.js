/**
 * 防抖工具函数
 */

/**
 * 防抖函数
 * @param {Function} fn - 要执行的函数
 * @param {number} delay - 延迟时间(ms)
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
  let timer = null;

  return function (...args) {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

/**
 * 节流函数
 * @param {Function} fn - 要执行的函数
 * @param {number} interval - 间隔时间(ms)
 * @returns {Function}
 */
export function throttle(fn, interval = 300) {
  let lastTime = 0;

  return function (...args) {
    const now = Date.now();

    if (now - lastTime >= interval) {
      fn.apply(this, args);
      lastTime = now;
    }
  };
}

/**
 * 创建防抖按钮状态管理
 * @param {number} cooldown - 冷却时间(ms)
 * @returns {Object}
 */
export function createButtonDebounce(cooldown = 2000) {
  let lastClickTime = 0;
  let isLoading = false;

  return {
    /**
     * 检查是否可以点击
     * @returns {boolean}
     */
    canClick() {
      if (isLoading) return false;

      const now = Date.now();
      return now - lastClickTime >= cooldown;
    },

    /**
     * 记录点击
     */
    recordClick() {
      lastClickTime = Date.now();
    },

    /**
     * 设置加载状态
     * @param {boolean} loading
     */
    setLoading(loading) {
      isLoading = loading;
    },

    /**
     * 获取加载状态
     * @returns {boolean}
     */
    isLoading() {
      return isLoading;
    },

    /**
     * 获取剩余冷却时间
     * @returns {number} 剩余毫秒数
     */
    getRemainingCooldown() {
      const elapsed = Date.now() - lastClickTime;
      return Math.max(0, cooldown - elapsed);
    },

    /**
     * 重置状态
     */
    reset() {
      lastClickTime = 0;
      isLoading = false;
    }
  };
}

/**
 * 防抖Hook（用于Composition API）
 * @param {number} delay - 延迟时间(ms)
 * @returns {Object}
 */
export function useDebounce(delay = 300) {
  let timer = null;

  const run = (fn) => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn();
      timer = null;
    }, delay);
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { run, cancel };
}

/**
 * 节流Hook（用于Composition API）
 * @param {number} interval - 间隔时间(ms)
 * @returns {Object}
 */
export function useThrottle(interval = 300) {
  let lastTime = 0;

  const run = (fn) => {
    const now = Date.now();

    if (now - lastTime >= interval) {
      fn();
      lastTime = now;
      return true;
    }

    return false;
  };

  const reset = () => {
    lastTime = 0;
  };

  return { run, reset };
}

export default {
  debounce,
  throttle,
  createButtonDebounce,
  useDebounce,
  useThrottle
};
