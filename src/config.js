module.exports = {
  telegramPhoneNumber: process.env.TELEGRAM_PHONE_NUMBER, // your telegram phone number in E.164 format
  telegramApiId: process.env.TELEGRAM_API_ID, // the API id from telegram
  telegramApiHash: process.env.TELEGRAM_API_HASH, // the API hash from telegram
  quote: "BTC", // the trade pair quote to look for
  simulate: true, // if true, sends mock requests to exchange
  tickInterval: 2000, // the interval that it checks for new signal messages
  amount: 0.1, // the amount of quote we want to purchase when a trade pair is found
  trailingStopPercent: 0.1, // trailing stop by percentage e.g. price * (1 - trailingStopPercent)
  profitTargets: [
    { profitPercent: 0.05, sellAssetPercent: 0.5 }, // at 5% profit, sell 50%
    { profitPercent: 0.1, sellAssetPercent: 0.5 }, // at 10% profit, sell 50%
  ],
};
