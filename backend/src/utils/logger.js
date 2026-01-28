export const logger = {
  info: (msg) => {
    console.log(`ℹ️  [INFO]: ${msg}`);
  },

  success: (msg) => {
    console.log(`✅ [SUCCESS]: ${msg}`);
  },

  error: (msg) => {
    console.error(`❌ [ERROR]: ${msg}`);
  },

  warn: (msg) => {
    console.warn(`⚠️ [WARN]: ${msg}`);
  }
};
