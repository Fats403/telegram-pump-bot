require("dotenv").config();

const readline = require("readline");
const logger = require("./logger");
const {
  sendCode,
  signIn,
  getUser,
  getPassword,
  checkPassword,
  getSRPParams,
} = require("./telegram");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (input) => resolve(input));
  });
}

(async function init() {
  logger.info("Connecting to telegram...");

  let authResult = await getUser();

  if (!authResult) {
    const { phone_code_hash } = await sendCode();

    let code = await ask("Enter MFA Code: ");

    try {
      authResult = await signIn({
        code,
        phone_code_hash,
      });
    } catch (error) {
      if (error.error_message !== "SESSION_PASSWORD_NEEDED") {
        logger.error(error.error_message);
        process.exit(1);
      }

      const { srp_id, current_algo, srp_B } = await getPassword();
      const { g, p, salt1, salt2 } = current_algo;

      let password = await ask("Enter password: ");

      const { A, M1 } = await getSRPParams({
        g,
        p,
        salt1,
        salt2,
        gB: srp_B,
        password,
      });

      authResult = await checkPassword({ srp_id, A, M1 });
    }
  }

  logger.info(
    `Successfully connected to telegram. Welcome, ${authResult.user.first_name}!`
  );
})();
