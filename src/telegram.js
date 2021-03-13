const { MTProto } = require("@mtproto/core");
const { sleep } = require("@mtproto/core/src/utils/common");
const { getSRPParams } = require("@mtproto/core");
const config = require("./config");

const mtproto = new MTProto({
  api_id: config.telegramApiId,
  api_hash: config.telegramApiHash,
});

const telegram = {
  call(method, params, options = {}) {
    return mtproto.call(method, params, options).catch(async (error) => {
      const { error_code, error_message } = error;

      if (error_code === 420) {
        const seconds = +error_message.split("FLOOD_WAIT_")[1];
        const ms = seconds * 1000;

        await sleep(ms);

        return this.call(method, params, options);
      }

      if (error_code === 303) {
        const [type, dcId] = error_message.split("_MIGRATE_");

        // If auth.sendCode call on incorrect DC need change default DC, because call auth.signIn on incorrect DC return PHONE_CODE_EXPIRED error
        if (type === "PHONE") {
          await mtproto.setDefaultDc(+dcId);
        } else {
          options = {
            ...options,
            dcId: +dcId,
          };
        }

        return this.call(method, params, options);
      }

      return Promise.reject(error);
    });
  },
};

async function getUser() {
  try {
    const user = await telegram.call("users.getFullUser", {
      id: {
        _: "inputUserSelf",
      },
    });

    return user;
  } catch (error) {
    return null;
  }
}

function sendCode() {
  return telegram.call("auth.sendCode", {
    phone_number: config.telegramPhoneNumber,
    settings: {
      _: "codeSettings",
    },
  });
}

function signIn({ code, phone_code_hash }) {
  return telegram.call("auth.signIn", {
    phone_code: code,
    phone_number: config.telegramPhoneNumber,
    phone_code_hash: phone_code_hash,
  });
}

function getPassword() {
  return telegram.call("account.getPassword");
}

function checkPassword({ srp_id, A, M1 }) {
  return telegram.call("auth.checkPassword", {
    password: {
      _: "inputCheckPasswordSRP",
      srp_id,
      A,
      M1,
    },
  });
}

module.exports = {
  sendCode,
  signIn,
  getUser,
  getPassword,
  checkPassword,
  getSRPParams,
  mtproto,
};
